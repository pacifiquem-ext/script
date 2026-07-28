import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  INGESTION_CREDIT_COST,
  humanizeIngestionFailure,
  needsEmbeddingBackfill,
  normalizeDocumentText,
  type BackfillBody,
} from '@script/shared';
import { prisma } from '../../db/prisma';
import { logger } from '../../lib/logger';
import { storage } from '../../storage';
import { decrementCredits } from '../credits/credits-service';
import { buildDocumentSummary } from '../chat/agent/document-summary';
import {
  createDocumentVersion,
  hashDocumentBytes,
  projectDocumentFromVersion,
  shouldChargeIngestion,
} from '../library/document-versions';
import { chunkText, extractText, type TextChunk } from './extract';
import { embedTexts, vectorLiteral } from './embeddings';
import {
  BACKFILL_QUEUE,
  INGESTION_QUEUE,
  createWorker,
  enqueueBackfill,
  enqueueIngestion,
  registerInlineHandler,
  type BackfillJobData,
  type IngestionJobData,
} from './queue';

type Phase =
  'queued' | 'downloading' | 'extracting' | 'chunking' | 'embedding' | 'persisting' | null;

async function setVersionPhase(
  versionId: string,
  documentId: string,
  processingPhase: Phase,
  extra: Record<string, unknown> = {},
) {
  await prisma.documentVersion.update({
    where: { id: versionId },
    data: { processingPhase, ...extra },
  });
  // Mirror phase onto the document only when this version is the active processing target
  // and we don't need to preserve a ready current version's list status incorrectly.
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return;
  if (doc.processingVersionId === versionId) {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        processingPhase,
        // Keep ready when a current version exists so chat retrieval stays available.
        status:
          doc.currentVersionId && doc.status === 'ready'
            ? 'ready'
            : processingPhase
              ? 'processing'
              : doc.status,
      },
    });
  }
}

async function downloadDocumentBuffer(storageKey: string, sourceUrl: string | null) {
  if (sourceUrl?.startsWith('http')) {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Failed to download source URL: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  const url = await storage.getSignedDownloadUrl(storageKey, 600);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download storage object: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function persistChunksForVersion(
  documentId: string,
  documentVersionId: string,
  workspaceId: string,
  chunks: TextChunk[],
  embeddings: number[][],
) {
  await prisma.$transaction(async (tx) => {
    // Never delete other versions' chunks — only replace this version's rows (retries).
    await tx.documentChunk.deleteMany({ where: { documentVersionId } });
    if (chunks.length === 0) return;
    await tx.documentChunk.createMany({
      data: chunks.map((chunk, i) => ({
        documentId,
        documentVersionId,
        workspaceId,
        position: i,
        content: chunk.content,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        pageNumber: chunk.pageNumber,
      })),
    });
    const rows = await tx.documentChunk.findMany({
      where: { documentVersionId },
      select: { id: true, position: true },
      orderBy: { position: 'asc' },
    });
    for (const row of rows) {
      const embedding = embeddings[row.position];
      if (!embedding) throw new Error(`Missing embedding for chunk position ${row.position}`);
      await tx.$executeRawUnsafe(
        `UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2`,
        vectorLiteral(embedding),
        row.id,
      );
    }
  });
}

async function resolveVersion(data: IngestionJobData) {
  if (data.versionId) {
    const version = await prisma.documentVersion.findUnique({ where: { id: data.versionId } });
    if (!version || version.documentId !== data.documentId) return null;
    return version;
  }

  // Legacy jobs / backfill without versionId: use processing version or create one for backfill.
  const document = await prisma.document.findUnique({ where: { id: data.documentId } });
  if (!document) return null;

  if (document.processingVersionId) {
    return prisma.documentVersion.findUnique({ where: { id: document.processingVersionId } });
  }
  if (document.currentVersionId && data.mode === 'backfill') {
    return prisma.documentVersion.findUnique({ where: { id: document.currentVersionId } });
  }
  if (document.currentVersionId) {
    return prisma.documentVersion.findUnique({ where: { id: document.currentVersionId } });
  }

  // Migrate path: document without versions — should not happen after migration, but be safe.
  const existing = await prisma.documentVersion.findFirst({
    where: { documentId: document.id },
    orderBy: { versionNumber: 'desc' },
  });
  return existing;
}

export async function processIngestion(data: IngestionJobData): Promise<void> {
  const document = await prisma.document.findUnique({ where: { id: data.documentId } });
  if (!document || document.workspaceId !== data.workspaceId) return;

  const mode = data.mode ?? 'ingest';
  const isBackfill = mode === 'backfill';

  let version = await resolveVersion(data);
  if (!version) {
    logger.warn({ documentId: data.documentId }, 'ingestion skipped: no version');
    return;
  }

  // Backfill always creates a new version from current ready content so old chunks (citations) stay.
  if (isBackfill && version.status === 'ready' && !data.versionId) {
    const newVersion = await createDocumentVersion({
      documentId: document.id,
      workspaceId: document.workspaceId,
      mimeType: version.mimeType,
      byteSize: version.byteSize,
      storageKey: version.storageKey,
      contentHash: version.contentHash,
      changeReason: 'backfill',
      createdById: data.userId ?? document.createdById,
      extractedText: version.extractedText,
      pageCount: version.pageCount,
      status: 'pending',
    });
    await prisma.document.update({
      where: { id: document.id },
      data: {
        processingVersionId: newVersion.id,
        status: document.status === 'ready' ? 'ready' : 'pending',
      },
    });
    version = newVersion;
  }

  await prisma.documentVersion.update({
    where: { id: version.id },
    data: { status: 'processing', failureReason: null, processingPhase: 'queued' },
  });
  await prisma.document.update({
    where: { id: document.id },
    data: {
      processingVersionId: version.id,
      status: document.currentVersionId && document.status === 'ready' ? 'ready' : 'processing',
      processingPhase: 'queued',
      failureReason: document.currentVersionId ? document.failureReason : null,
    },
  });

  try {
    let text = version.extractedText?.trim() || document.extractedText?.trim() || '';
    let pageCount = version.pageCount ?? document.pageCount;
    let contentHash = version.contentHash;

    if (!isBackfill || !text) {
      await setVersionPhase(version.id, document.id, 'downloading');
      const buffer = await downloadDocumentBuffer(version.storageKey, document.sourceUrl);
      contentHash = contentHash || hashDocumentBytes(buffer);
      await setVersionPhase(version.id, document.id, 'extracting');
      const extracted = await extractText(buffer, version.mimeType, document.name);
      text = extracted.text;
      pageCount = extracted.pageCount;
    } else {
      await setVersionPhase(version.id, document.id, 'extracting');
    }

    text = normalizeDocumentText(text);
    if (!text) throw new Error('No text could be extracted from document');

    await setVersionPhase(version.id, document.id, 'chunking');
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('Chunking produced no content');

    await setVersionPhase(version.id, document.id, 'embedding');
    const embeddings = await embedTexts(
      chunks.map((c) => c.content),
      'document',
    );
    if (embeddings.length !== chunks.length) {
      throw new Error(`Embedding count mismatch: ${embeddings.length} vs ${chunks.length}`);
    }

    await setVersionPhase(version.id, document.id, 'persisting');
    await persistChunksForVersion(
      document.id,
      version.id,
      document.workspaceId,
      chunks,
      embeddings,
    );

    const summary = buildDocumentSummary(text);
    const readyVersion = await prisma.documentVersion.update({
      where: { id: version.id },
      data: {
        status: 'ready',
        processingPhase: null,
        extractedText: text,
        summary,
        pageCount,
        contentHash,
        embeddingModel: EMBEDDING_MODEL,
        embeddingDimensions: EMBEDDING_DIMENSIONS,
        processedAt: new Date(),
        failureReason: null,
      },
    });

    if (!isBackfill) {
      const charge = await shouldChargeIngestion({
        workspaceId: data.workspaceId,
        documentId: document.id,
        versionId: version.id,
        contentHash,
      });
      if (charge) {
        await decrementCredits({
          workspaceId: data.workspaceId,
          userId: data.userId,
          cost: INGESTION_CREDIT_COST,
          reason: 'ingestion_usage',
          refType: 'document_version',
          refId: version.id,
        });
      }
    }

    await projectDocumentFromVersion(document.id, readyVersion, {
      makeCurrent: true,
      clearProcessing: true,
      failureReason: null,
    });

    logger.info(
      {
        documentId: document.id,
        versionId: version.id,
        versionNumber: version.versionNumber,
        chunkCount: chunks.length,
        mode,
      },
      'ingestion completed',
    );
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Ingestion failed';
    const message = humanizeIngestionFailure(raw);
    logger.error(
      { err: error, documentId: document.id, versionId: version.id, mode, failureReason: message },
      'ingestion failed',
    );
    const failedVersion = await prisma.documentVersion.update({
      where: { id: version.id },
      data: { status: 'failed', failureReason: message, processingPhase: null },
    });
    // Preserve current ready version for retrieval — never demote a working document.
    await projectDocumentFromVersion(document.id, failedVersion, {
      makeCurrent: false,
      clearProcessing: true,
      failureReason: message,
    });
    throw error;
  }
}

async function processBackfill(data: BackfillJobData): Promise<void> {
  const where =
    'documentId' in data
      ? { id: data.documentId, status: 'ready' as const }
      : 'workspaceId' in data
        ? { workspaceId: data.workspaceId, status: 'ready' as const }
        : { status: 'ready' as const };
  const docs = await prisma.document.findMany({ where });
  for (const doc of docs) {
    if (
      !needsEmbeddingBackfill({
        embeddingModel: doc.embeddingModel,
        embeddingDimensions: doc.embeddingDimensions,
        status: doc.status,
      })
    ) {
      continue;
    }
    await processIngestion({
      documentId: doc.id,
      workspaceId: doc.workspaceId,
      userId: doc.createdById ?? undefined,
      mode: 'backfill',
    });
  }
}

export async function requestBackfill(body: BackfillBody, actorUserId: string) {
  await enqueueBackfill(body);
  logger.info({ body, actorUserId }, 'embedding backfill enqueued');
  return { ok: true as const, enqueued: body };
}

export function registerIngestionProcessors(): void {
  registerInlineHandler(INGESTION_QUEUE, (data) => processIngestion(data as IngestionJobData));
  registerInlineHandler(BACKFILL_QUEUE, (data) => processBackfill(data as BackfillJobData));

  const ingestionWorker = createWorker<IngestionJobData>(INGESTION_QUEUE, async (job) => {
    await processIngestion(job.data);
  });
  const backfillWorker = createWorker<BackfillJobData>(BACKFILL_QUEUE, async (job) => {
    await processBackfill(job.data);
  });
  ingestionWorker?.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'ingestion worker job failed');
  });
  backfillWorker?.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'backfill worker job failed');
  });
}

export { enqueueIngestion };

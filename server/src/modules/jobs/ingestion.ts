import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  INGESTION_CREDIT_COST,
  needsEmbeddingBackfill,
  type BackfillBody,
} from '@script/shared';
import { prisma } from '../../db/prisma';
import { logger } from '../../lib/logger';
import { storage } from '../../storage';
import { decrementCredits } from '../credits/credits-service';
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

async function setPhase(
  documentId: string,
  processingPhase: Phase,
  extra: Record<string, unknown> = {},
) {
  await prisma.document.update({
    where: { id: documentId },
    data: { processingPhase, ...extra },
  });
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

async function persistChunks(
  documentId: string,
  workspaceId: string,
  chunks: TextChunk[],
  embeddings: number[][],
) {
  await prisma.$transaction(async (tx) => {
    await tx.documentChunk.deleteMany({ where: { documentId } });
    if (chunks.length === 0) return;
    await tx.documentChunk.createMany({
      data: chunks.map((chunk, i) => ({
        documentId,
        workspaceId,
        position: i,
        content: chunk.content,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        pageNumber: chunk.pageNumber,
      })),
    });
    const rows = await tx.documentChunk.findMany({
      where: { documentId },
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

export async function processIngestion(data: IngestionJobData): Promise<void> {
  const document = await prisma.document.findUnique({ where: { id: data.documentId } });
  if (!document || document.workspaceId !== data.workspaceId) return;

  const mode = data.mode ?? 'ingest';
  const isBackfill = mode === 'backfill';

  await prisma.document.update({
    where: { id: document.id },
    data: { status: 'processing', failureReason: null, processingPhase: 'queued' },
  });

  try {
    let text = document.extractedText?.trim() || '';
    let pageCount = document.pageCount;

    if (!isBackfill || !text) {
      await setPhase(document.id, 'downloading');
      const buffer = await downloadDocumentBuffer(document.storageKey, document.sourceUrl);
      await setPhase(document.id, 'extracting');
      const extracted = await extractText(buffer, document.mimeType, document.name);
      text = extracted.text;
      pageCount = extracted.pageCount;
    } else {
      await setPhase(document.id, 'extracting');
    }

    if (!text) throw new Error('No text could be extracted from document');

    await setPhase(document.id, 'chunking');
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('Chunking produced no content');

    await setPhase(document.id, 'embedding');
    const embeddings = await embedTexts(
      chunks.map((c) => c.content),
      'document',
    );
    if (embeddings.length !== chunks.length) {
      throw new Error(`Embedding count mismatch: ${embeddings.length} vs ${chunks.length}`);
    }

    await setPhase(document.id, 'persisting');
    await persistChunks(document.id, document.workspaceId, chunks, embeddings);

    if (!isBackfill) {
      await decrementCredits({
        workspaceId: data.workspaceId,
        userId: data.userId,
        cost: INGESTION_CREDIT_COST,
        reason: 'ingestion_usage',
        refType: 'document',
        refId: document.id,
      });
    }

    await prisma.document.update({
      where: { id: document.id },
      data: {
        status: 'ready',
        processingPhase: null,
        extractedText: text,
        pageCount,
        embeddingModel: EMBEDDING_MODEL,
        embeddingDimensions: EMBEDDING_DIMENSIONS,
        processedAt: new Date(),
        failureReason: null,
      },
    });

    logger.info(
      { documentId: document.id, chunkCount: chunks.length, mode },
      'ingestion completed',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ingestion failed';
    logger.error({ err: error, documentId: document.id, mode }, 'ingestion failed');
    await prisma.document.update({
      where: { id: document.id },
      data: { status: 'failed', failureReason: message, processingPhase: null },
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

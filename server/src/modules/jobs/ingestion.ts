import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  INGESTION_CREDIT_COST,
  needsEmbeddingBackfill,
} from '@script/shared';
import { prisma } from '../../db/prisma';
import { logger } from '../../lib/logger';
import { storage } from '../../storage';
import { decrementCredits } from '../credits/credits-service';
import { chunkText, extractText } from './extract';
import { embedTexts, vectorLiteral } from './embeddings';
import {
  BACKFILL_QUEUE,
  INGESTION_QUEUE,
  createWorker,
  registerInlineHandler,
  type BackfillJobData,
  type IngestionJobData,
} from './queue';

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

export async function processIngestion(data: IngestionJobData): Promise<void> {
  const document = await prisma.document.findUnique({ where: { id: data.documentId } });
  if (!document || document.workspaceId !== data.workspaceId) return;

  await prisma.document.update({
    where: { id: document.id },
    data: { status: 'processing', failureReason: null },
  });

  try {
    await decrementCredits({
      workspaceId: data.workspaceId,
      userId: data.userId,
      cost: INGESTION_CREDIT_COST,
      reason: 'ingestion_usage',
      refType: 'document',
      refId: document.id,
    });

    const buffer = await downloadDocumentBuffer(document.storageKey, document.sourceUrl);
    const { text, pageCount } = await extractText(buffer, document.mimeType, document.name);
    if (!text) throw new Error('No text could be extracted from document');

    const chunks = chunkText(text);
    const embeddings = await embedTexts(chunks);

    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId: document.id } });
      for (let i = 0; i < chunks.length; i += 1) {
        const id = await tx.documentChunk.create({
          data: {
            documentId: document.id,
            workspaceId: document.workspaceId,
            position: i,
            content: chunks[i]!,
          },
          select: { id: true },
        });
        const embedding = embeddings[i]!;
        await tx.$executeRawUnsafe(
          `UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2`,
          vectorLiteral(embedding),
          id.id,
        );
      }
      await tx.document.update({
        where: { id: document.id },
        data: {
          status: 'ready',
          extractedText: text,
          pageCount,
          embeddingModel: EMBEDDING_MODEL,
          embeddingDimensions: EMBEDDING_DIMENSIONS,
          processedAt: new Date(),
          failureReason: null,
        },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ingestion failed';
    logger.error({ err: error, documentId: document.id }, 'ingestion failed');
    await prisma.document.update({
      where: { id: document.id },
      data: { status: 'failed', failureReason: message },
    });
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
    await processIngestion({ documentId: doc.id, workspaceId: doc.workspaceId });
  }
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

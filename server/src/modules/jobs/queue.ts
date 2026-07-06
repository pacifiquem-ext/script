import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { ConfigurationError } from '../../common/errors';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

export const INGESTION_QUEUE = 'document-ingestion';
export const BACKFILL_QUEUE = 'embeddings-backfill';

export type IngestionJobData = {
  documentId: string;
  workspaceId: string;
  userId?: string;
  mode?: 'ingest' | 'backfill';
};
export type BackfillJobData = { documentId: string } | { workspaceId: string } | { all: true };

let ingestionQueue: Queue<IngestionJobData> | null = null;
let backfillQueue: Queue<BackfillJobData> | null = null;
const inlineHandlers = new Map<string, (data: unknown) => Promise<void>>();
const workers: Worker[] = [];

function connectionOptions(): ConnectionOptions | null {
  if (!env.REDIS_URL) return null;
  return { url: env.REDIS_URL, maxRetriesPerRequest: null };
}

export function getRedisConnection(): ConnectionOptions | null {
  return connectionOptions();
}

function getIngestionQueue() {
  const connection = connectionOptions();
  if (!connection) return null;
  if (!ingestionQueue)
    ingestionQueue = new Queue<IngestionJobData>(INGESTION_QUEUE, { connection });
  return ingestionQueue;
}

function getBackfillQueue() {
  const connection = connectionOptions();
  if (!connection) return null;
  if (!backfillQueue) backfillQueue = new Queue<BackfillJobData>(BACKFILL_QUEUE, { connection });
  return backfillQueue;
}

export function registerInlineHandler(name: string, handler: (data: unknown) => Promise<void>) {
  inlineHandlers.set(name, handler);
}

function allowInline(): boolean {
  if (env.NODE_ENV === 'production') return false;
  if (env.NODE_ENV === 'test') return true;
  return env.ALLOW_INLINE_INGESTION;
}

export async function enqueueIngestion(data: IngestionJobData): Promise<void> {
  const queue = getIngestionQueue();
  if (queue) {
    await queue.add('ingest', data, {
      jobId: `ingest-${data.documentId}-${data.mode ?? 'ingest'}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return;
  }
  if (!allowInline()) {
    throw new ConfigurationError(
      'REDIS_URL is required for background ingestion. Set REDIS_URL or ALLOW_INLINE_INGESTION=true in non-production.',
    );
  }
  const handler = inlineHandlers.get(INGESTION_QUEUE);
  if (!handler) {
    throw new ConfigurationError('Ingestion handler is not registered');
  }
  setImmediate(() => {
    void handler(data).catch((err) => logger.error({ err, data }, 'inline ingestion failed'));
  });
}

export async function enqueueBackfill(data: BackfillJobData): Promise<void> {
  const queue = getBackfillQueue();
  if (queue) {
    const jobId =
      'documentId' in data
        ? `backfill-doc-${data.documentId}`
        : 'workspaceId' in data
          ? `backfill-ws-${data.workspaceId}`
          : 'backfill-all';
    await queue.add('backfill', data, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return;
  }
  if (!allowInline()) {
    throw new ConfigurationError(
      'REDIS_URL is required for embedding backfill. Set REDIS_URL or ALLOW_INLINE_INGESTION=true in non-production.',
    );
  }
  const handler = inlineHandlers.get(BACKFILL_QUEUE);
  if (!handler) {
    throw new ConfigurationError('Backfill handler is not registered');
  }
  setImmediate(() => {
    void handler(data).catch((err) => logger.error({ err, data }, 'inline backfill failed'));
  });
}

export async function getFailedJobs(limit = 50) {
  const ingestion = getIngestionQueue();
  const backfill = getBackfillQueue();
  const [ingestionFailed, backfillFailed] = await Promise.all([
    ingestion?.getFailed(0, limit - 1) ?? Promise.resolve([]),
    backfill?.getFailed(0, limit - 1) ?? Promise.resolve([]),
  ]);
  return {
    redisConfigured: Boolean(connectionOptions()),
    ingestion: ingestionFailed.map((job) => ({
      id: job.id,
      name: job.name,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      data: job.data,
      timestamp: job.timestamp,
    })),
    backfill: backfillFailed.map((job) => ({
      id: job.id,
      name: job.name,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      data: job.data,
      timestamp: job.timestamp,
    })),
  };
}

export async function closeQueues(): Promise<void> {
  await Promise.all(workers.map((worker) => worker.close()));
  workers.length = 0;
  await ingestionQueue?.close();
  await backfillQueue?.close();
  ingestionQueue = null;
  backfillQueue = null;
}

export function createWorker<T>(
  name: string,
  processor: (job: Job<T>) => Promise<void>,
): Worker<T> | null {
  const connection = connectionOptions();
  if (!connection) return null;
  const worker = new Worker<T>(name, processor, { connection, concurrency: 2 });
  workers.push(worker as Worker);
  return worker;
}

import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

export const INGESTION_QUEUE = 'document-ingestion';
export const BACKFILL_QUEUE = 'embeddings-backfill';

export type IngestionJobData = { documentId: string; workspaceId: string; userId?: string };
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

export async function enqueueIngestion(data: IngestionJobData): Promise<void> {
  const queue = getIngestionQueue();
  if (queue) {
    await queue.add('ingest', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return;
  }
  const handler = inlineHandlers.get(INGESTION_QUEUE);
  if (!handler) {
    logger.warn({ data }, 'no redis and no inline ingestion handler');
    return;
  }
  setImmediate(() => {
    void handler(data).catch((err) => logger.error({ err, data }, 'inline ingestion failed'));
  });
}

export async function enqueueBackfill(data: BackfillJobData): Promise<void> {
  const queue = getBackfillQueue();
  if (queue) {
    await queue.add('backfill', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    return;
  }
  const handler = inlineHandlers.get(BACKFILL_QUEUE);
  if (!handler) return;
  setImmediate(() => {
    void handler(data).catch((err) => logger.error({ err, data }, 'inline backfill failed'));
  });
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

import { ensureVectorIndexes } from '../db/ensure-vector-indexes';
import { prisma } from '../db/prisma';
import { logger } from '../lib/logger';
import { registerIngestionProcessors } from '../modules/jobs/ingestion';
import { closeQueues, getRedisConnection } from '../modules/jobs/queue';
import { env } from '../config/env';

async function main() {
  if (env.NODE_ENV === 'production' && !env.VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY is required for the worker in production');
  }
  if (!getRedisConnection()) {
    logger.warn('REDIS_URL unset — worker idles; API process uses inline ingestion fallback');
  }
  await ensureVectorIndexes();
  registerIngestionProcessors();
  logger.info('ingestion worker running');
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`worker received ${signal}, shutting down`);
  await closeQueues();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
void main().catch(async (error) => {
  logger.error({ err: error }, 'worker failed to start');
  await prisma.$disconnect();
  process.exit(1);
});

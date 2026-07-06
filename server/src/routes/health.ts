import type { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { storage } from '../storage';

async function pingRedis(url: string): Promise<boolean> {
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    lazyConnect: true,
    enableOfflineQueue: false,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

async function pingStorage(): Promise<boolean> {
  try {
    const key = `healthchecks/${Date.now()}.txt`;
    const uploaded = await storage.upload({
      buffer: Buffer.from('ok'),
      filename: 'health.txt',
      contentType: 'text/plain',
    });
    await storage.getSignedDownloadUrl(uploaded.key, 60);
    await storage.delete(uploaded.key);
    void key;
    return true;
  } catch {
    return false;
  }
}

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  app.get('/health/ready', async (_request, reply) => {
    const checks: Record<string, 'ok' | 'unreachable' | 'skipped'> = {
      database: 'unreachable',
      redis: env.REDIS_URL ? 'unreachable' : 'skipped',
      storage: 'unreachable',
    };
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch (error) {
      app.log.error({ err: error }, 'readiness check failed: database unreachable');
    }
    if (env.REDIS_URL) checks.redis = (await pingRedis(env.REDIS_URL)) ? 'ok' : 'unreachable';
    if (env.NODE_ENV === 'test') {
      checks.storage = 'skipped';
    } else {
      checks.storage = (await pingStorage()) ? 'ok' : 'unreachable';
    }

    const ready =
      checks.database === 'ok' &&
      checks.redis !== 'unreachable' &&
      checks.storage !== 'unreachable';
    if (!ready) return reply.status(503).send({ status: 'error', checks });
    return { status: 'ok', checks };
  });
}

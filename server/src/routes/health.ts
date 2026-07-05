import type { FastifyInstance } from 'fastify';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { storage } from '../storage';

async function pingRedis(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const port = Number(parsed.port || (parsed.protocol === 'rediss:' ? 6380 : 6379));
  const net = await import('node:net');
  return new Promise((resolve) => {
    const socket = net.connect({ host: parsed.hostname, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
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

import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  app.get('/health/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      app.log.error({ err: error }, 'readiness check failed: database unreachable');
      return reply.status(503).send({ status: 'error', database: 'unreachable' });
    }
  });
}

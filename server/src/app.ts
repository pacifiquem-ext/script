import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env';
import { pinoOptions } from './lib/logger';
import { registerErrorHandler } from './common/error-handler';
import { healthRoutes } from './routes/health';

export function buildApp() {
  const app = Fastify({
    logger: pinoOptions,
  });

  app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  registerErrorHandler(app);

  app.register(healthRoutes);

  return app;
}

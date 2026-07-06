import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { env } from './config/env';
import { pinoOptions } from './lib/logger';
import { registerErrorHandler } from './common/error-handler';
import { registerAuthPlugin } from './plugins/auth';
import { healthRoutes } from './routes/health';
import { authRoutes } from './modules/auth/routes';
import { workspaceRoutes } from './modules/workspaces/routes';
import { libraryRoutes } from './modules/library/routes';
import { chatRoutes } from './modules/chat/routes';
import { apiKeyRoutes } from './modules/api-keys/routes';
import { userRoutes } from './modules/users/routes';
import { creditsRoutes } from './modules/credits/routes';
import { jobsRoutes } from './modules/jobs/routes';
import { registerIngestionProcessors } from './modules/jobs/ingestion';

export function buildApp() {
  registerIngestionProcessors();
  const app = Fastify({ logger: pinoOptions });
  app.register(helmet, { global: true, contentSecurityPolicy: false });
  app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  app.register(cookie);
  app.register(multipart, { limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 10 } });
  app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  registerErrorHandler(app);
  app.register(async (instance) => {
    await registerAuthPlugin(instance);
    await instance.register(healthRoutes);
    await instance.register(authRoutes);
    await instance.register(workspaceRoutes);
    await instance.register(libraryRoutes);
    await instance.register(chatRoutes);
    await instance.register(apiKeyRoutes);
    await instance.register(userRoutes);
    await instance.register(creditsRoutes);
    await instance.register(jobsRoutes);
  });
  return app;
}

export { authRateLimitConfig } from './config/rate-limits';

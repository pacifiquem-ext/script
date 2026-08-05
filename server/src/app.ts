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
import { integrationRoutes } from './modules/integrations/routes';
import { licenseRoutes } from './modules/license/routes';
import { auditRoutes } from './modules/audit/routes';
import { ssoRoutes } from './modules/sso/routes';
import { meetingRoutes } from './modules/meetings/routes';
import { connectorRoutes } from './modules/connectors/routes';
import { slackRoutes } from './modules/slack/routes';
import { clearanceRoutes } from './modules/clearance/routes';

export function buildApp() {
  registerIngestionProcessors();
  const app = Fastify({ logger: pinoOptions });
  // SPA runs on a different origin (e.g. Vite :5173 → API :4000). Default Helmet
  // CORP "same-origin" makes the browser treat successful responses as opaque /
  // blocked for credentialed cross-origin fetch and EventSource — looks like CORS.
  app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  app.register(cors, {
    origin: env.corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Workspace-Id',
      'X-Request-Id',
      'Accept',
    ],
    exposedHeaders: ['Content-Type'],
  });
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
    await instance.register(integrationRoutes);
    await instance.register(licenseRoutes);
    await instance.register(auditRoutes);
    await instance.register(ssoRoutes);
    await instance.register(meetingRoutes);
    await instance.register(connectorRoutes);
    await instance.register(slackRoutes);
    await instance.register(clearanceRoutes);
  });
  return app;
}

export { authRateLimitConfig } from './config/rate-limits';

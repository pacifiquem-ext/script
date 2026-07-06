import type { FastifyInstance } from 'fastify';
import { backfillBodySchema } from '@script/shared';
import { ForbiddenError } from '../../common/errors';
import { backfillRateLimitConfig } from '../../config/rate-limits';
import { requireWorkspace } from '../../plugins/auth';
import { requestBackfill } from './ingestion';
import { getFailedJobs } from './queue';

export async function jobsRoutes(app: FastifyInstance) {
  app.post(
    '/jobs/embeddings/backfill',
    { config: { rateLimit: backfillRateLimitConfig } },
    async (request) => {
      const { user, workspace } = await requireWorkspace(request);
      if (workspace.role !== 'owner' && workspace.role !== 'admin') {
        throw new ForbiddenError('Only workspace owners and admins can trigger backfill');
      }
      const body = backfillBodySchema.parse(request.body ?? {});
      if ('workspaceId' in body && body.workspaceId !== workspace.id) {
        throw new ForbiddenError('Cannot backfill another workspace');
      }
      if ('all' in body) {
        throw new ForbiddenError('Global backfill is restricted to operator tooling');
      }
      const payload = 'documentId' in body ? body : { workspaceId: workspace.id };
      return requestBackfill(payload, user.id);
    },
  );

  app.get('/jobs/failed', async (request) => {
    const { workspace } = await requireWorkspace(request);
    if (workspace.role !== 'owner' && workspace.role !== 'admin') {
      throw new ForbiddenError('Only workspace owners and admins can inspect failed jobs');
    }
    return getFailedJobs();
  });
}

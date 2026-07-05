import type { FastifyInstance } from 'fastify';
import { createApiKeyBodySchema } from '@script/shared';
import { requireWorkspace, requireWorkspaceRole } from '../../plugins/auth';
import * as apiKeys from './api-keys-service';

function meta(request: { ip: string; headers: Record<string, unknown> }) {
  const ua = request.headers['user-agent'];
  return { ip: request.ip, userAgent: typeof ua === 'string' ? ua : null };
}

export async function apiKeyRoutes(app: FastifyInstance) {
  app.get('/api-keys', async (request) => {
    const { workspace } = await requireWorkspace(request);
    return apiKeys.listApiKeys(workspace.id);
  });

  app.get('/api-keys/:apiKeyId/audit', async (request) => {
    const { workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const { apiKeyId } = request.params as { apiKeyId: string };
    return apiKeys.listAuditEvents(workspace.id, apiKeyId);
  });

  app.post('/api-keys', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    return apiKeys.createApiKey(
      workspace.id,
      user.id,
      createApiKeyBodySchema.parse(request.body),
      meta(request),
    );
  });

  app.delete('/api-keys/:apiKeyId', async (request) => {
    const { workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const { apiKeyId } = request.params as { apiKeyId: string };
    return apiKeys.revokeApiKey(workspace.id, apiKeyId, meta(request));
  });
}

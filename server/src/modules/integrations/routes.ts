import type { FastifyInstance } from 'fastify';
import { importCloudFilesBodySchema, listCloudFilesQuerySchema } from '@script/shared';
import { requireWorkspace, requireWorkspaceRole } from '../../plugins/auth';
import * as integrations from './integrations-service';

export async function integrationRoutes(app: FastifyInstance) {
  app.get('/integrations', async (request) => {
    const { workspace } = await requireWorkspace(request);
    return integrations.listIntegrations(workspace.id);
  });

  app.get('/integrations/:provider/connect', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const { provider } = request.params as { provider: string };
    return integrations.startConnect(workspace.id, user.id, provider);
  });

  app.delete('/integrations/:provider', async (request) => {
    const { workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const { provider } = request.params as { provider: string };
    return integrations.disconnect(workspace.id, provider);
  });

  app.get('/integrations/:provider/files', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const { provider } = request.params as { provider: string };
    const query = listCloudFilesQuerySchema.parse(request.query);
    return integrations.listCloudFiles(workspace.id, provider, query);
  });

  app.post('/integrations/:provider/import', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const { provider } = request.params as { provider: string };
    const body = importCloudFilesBodySchema.parse(request.body);
    return integrations.importCloudFiles(workspace.id, user.id, provider, body);
  });

  /** Browser OAuth redirect target (no JSON auth — uses signed state). */
  app.get('/integrations/oauth/callback', async (request, reply) => {
    const q = request.query as { code?: string; state?: string; error?: string };
    const location = await integrations.handleOAuthCallback(q);
    return reply.redirect(location);
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace, requireWorkspaceRole } from '../../plugins/auth';
import * as github from './github-service';

export async function connectorRoutes(app: FastifyInstance) {
  app.get('/connectors', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const githubStatus = await github.getGitHubStatus(workspace.id);
    return { connectors: [githubStatus] };
  });

  app.post('/connectors/github', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const body = z
      .object({
        token: z.string().min(20).max(512),
        repos: z
          .array(z.string().regex(/^[^/]+\/[^/]+$/))
          .min(1)
          .max(20),
      })
      .parse(request.body);
    return github.connectGitHub(workspace.id, user.id, body.token, body.repos);
  });

  app.delete('/connectors/github', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    return github.disconnectGitHub(workspace.id, user.id);
  });

  app.post('/connectors/github/sync', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    return github.syncGitHub(workspace.id, user.id);
  });

  app.get('/work-items', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const q = request.query as { q?: string; state?: string };
    return github.listWorkItemsLocal(workspace.id, { q: q.q, state: q.state, limit: 50 });
  });
}

import type { FastifyInstance } from 'fastify';
import { listAuditQuerySchema } from '@script/shared';
import { requireWorkspace, requireWorkspaceRole } from '../../plugins/auth';
import { listAuditEvents } from './audit-service';

export async function auditRoutes(app: FastifyInstance) {
  app.get('/workspaces/current/audit', async (request) => {
    const { workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const query = listAuditQuerySchema.parse(request.query);
    return listAuditEvents(workspace.id, query);
  });
}

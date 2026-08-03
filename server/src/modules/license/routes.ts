import type { FastifyInstance } from 'fastify';
import { activateLicenseBodySchema } from '@script/shared';
import { requireAuth, requireWorkspace, requireWorkspaceRole } from '../../plugins/auth';
import { activateLicense, getLicenseStatus } from './license-service';

export async function licenseRoutes(app: FastifyInstance) {
  app.get('/license', async (request) => {
    await requireAuth(request);
    return { license: await getLicenseStatus() };
  });

  app.post('/license/activate', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const body = activateLicenseBodySchema.parse(request.body);
    const license = await activateLicense(body, user.id, request.ip);
    return { license };
  });
}

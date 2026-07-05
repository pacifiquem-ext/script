import type { FastifyInstance } from 'fastify';
import { COOKIE_REFRESH_TOKEN, deleteAccountBodySchema } from '@script/shared';
import { BadRequestError } from '../../common/errors';
import { requireAuth, requireWorkspace } from '../../plugins/auth';
import * as privacy from './privacy-service';
import * as users from './users-service';

export async function userRoutes(app: FastifyInstance) {
  app.patch('/me', async (request) => {
    const user = await requireAuth(request);
    return users.updateProfile(user.id, request.body as { name?: string });
  });

  app.post('/me/avatar', async (request) => {
    const user = await requireAuth(request);
    const file = await request.file();
    if (!file) throw new BadRequestError('file is required');
    const buffer = await file.toBuffer();
    return users.updateAvatar(user.id, buffer, file.filename, file.mimetype);
  });

  app.get('/me/preferences', async (request) => {
    const user = await requireAuth(request);
    return users.getPreferences(user.id);
  });

  app.patch('/me/preferences', async (request) => {
    const user = await requireAuth(request);
    return users.updatePreferences(user.id, request.body as Record<string, unknown>);
  });

  app.get('/me/sessions', async (request) => {
    const user = await requireAuth(request);
    return users.listSessions(user.id, request.cookies[COOKIE_REFRESH_TOKEN]);
  });

  app.delete('/me/sessions/:sessionId', async (request) => {
    const user = await requireAuth(request);
    const { sessionId } = request.params as { sessionId: string };
    return users.revokeSession(user.id, sessionId);
  });

  app.get('/me/export', async (request, reply) => {
    const user = await requireAuth(request);
    const payload = await privacy.exportAccountData(user.id);
    reply.header('content-disposition', `attachment; filename="script-export-${user.id}.json"`);
    return payload;
  });

  app.delete('/me', async (request, reply) => {
    const user = await requireAuth(request);
    const body = deleteAccountBodySchema.parse(request.body);
    return privacy.deleteAccount(user.id, body, reply);
  });

  app.patch('/workspaces/current/members/:memberId/credit-share', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const { memberId } = request.params as { memberId: string };
    return users.updateMemberCreditShare(workspace, memberId, request.body);
  });
}

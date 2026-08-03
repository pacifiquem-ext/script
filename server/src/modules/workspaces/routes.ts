import type { FastifyInstance } from 'fastify';
import {
  acceptInviteBodySchema,
  bulkInviteBodySchema,
  createInviteBodySchema,
  createWorkspaceBodySchema,
  inviteMemberBodySchema,
  switchWorkspaceBodySchema,
  updateMemberClearanceBodySchema,
  updateMemberRoleBodySchema,
  updateWorkspaceBodySchema,
} from '@script/shared';
import { BadRequestError } from '../../common/errors';
import { requireAuth, requireWorkspace } from '../../plugins/auth';
import * as workspaceService from './workspace-service';
import * as invitesService from './invites-service';
import { assertLicenseAllowsWrite } from '../license/license-service';

export async function workspaceRoutes(app: FastifyInstance) {
  app.get('/workspaces', async (request) => {
    const user = await requireAuth(request);
    return workspaceService.listWorkspaces(user.id);
  });

  app.post('/workspaces', async (request, reply) => {
    const user = await requireAuth(request);
    await assertLicenseAllowsWrite();
    const body = createWorkspaceBodySchema.parse(request.body);
    return workspaceService.createWorkspace(user, body, reply);
  });

  app.get('/workspaces/current', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    return workspaceService.getWorkspace(user.id, workspace.id);
  });

  app.patch('/workspaces/current', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    await assertLicenseAllowsWrite();
    const body = updateWorkspaceBodySchema.parse(request.body);
    return workspaceService.updateWorkspace(user, workspace, body);
  });

  app.post('/workspaces/switch', async (request, reply) => {
    const user = await requireAuth(request);
    const body = switchWorkspaceBodySchema.parse(request.body);
    return workspaceService.switchWorkspace(user, body.workspaceId, reply);
  });

  app.get('/workspaces/current/members', async (request) => {
    const { workspace } = await requireWorkspace(request);
    return workspaceService.listMembers(workspace);
  });

  app.post('/workspaces/current/members', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const body = inviteMemberBodySchema.parse(request.body);
    return workspaceService.inviteMember(workspace, user, body, request.ip);
  });

  app.patch('/workspaces/current/members/:memberId', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const params = request.params as { memberId: string };
    const body = updateMemberRoleBodySchema.parse(request.body);
    return workspaceService.updateMemberRole(workspace, user.id, params.memberId, body, request.ip);
  });

  app.patch('/workspaces/current/members/:memberId/clearance', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const params = request.params as { memberId: string };
    const body = updateMemberClearanceBodySchema.parse(request.body);
    return workspaceService.updateMemberClearance(
      workspace,
      user.id,
      params.memberId,
      body.clearanceLevel,
      request.ip,
    );
  });

  app.delete('/workspaces/current/members/:memberId', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const params = request.params as { memberId: string };
    return workspaceService.removeMember(workspace, user.id, params.memberId, request.ip);
  });

  app.get('/workspaces/current/invites', async (request) => {
    const { workspace } = await requireWorkspace(request);
    return invitesService.listInvites(workspace);
  });

  app.post('/workspaces/current/invites', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const body = createInviteBodySchema.parse(request.body);
    return invitesService.createInvite(workspace, user, body, request.ip);
  });

  app.post('/workspaces/current/invites/bulk', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const body = bulkInviteBodySchema.parse(request.body);
    return invitesService.bulkInvite(workspace, user, body, request.ip);
  });

  app.post('/workspaces/current/invites/:inviteId/resend', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const params = request.params as { inviteId: string };
    return invitesService.resendInvite(workspace, user, params.inviteId, request.ip);
  });

  app.delete('/workspaces/current/invites/:inviteId', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const params = request.params as { inviteId: string };
    return invitesService.revokeInvite(workspace, user, params.inviteId, request.ip);
  });

  app.get('/invites/preview', async (request) => {
    const query = request.query as { token?: string };
    if (!query.token) throw new BadRequestError('token is required');
    return invitesService.previewInvite(query.token);
  });

  app.post('/invites/accept', async (request) => {
    const user = await requireAuth(request);
    const body = acceptInviteBodySchema.parse(request.body);
    return invitesService.acceptInvite(user, body, request.ip);
  });
}

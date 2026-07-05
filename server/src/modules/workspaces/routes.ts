import type { FastifyInstance } from 'fastify';
import {
  createWorkspaceBodySchema,
  inviteMemberBodySchema,
  switchWorkspaceBodySchema,
  updateMemberRoleBodySchema,
  updateWorkspaceBodySchema,
} from '@script/shared';
import { requireAuth, requireWorkspace } from '../../plugins/auth';
import * as workspaceService from './workspace-service';

export async function workspaceRoutes(app: FastifyInstance) {
  app.get('/workspaces', async (request) => {
    const user = await requireAuth(request);
    return workspaceService.listWorkspaces(user.id);
  });

  app.post('/workspaces', async (request, reply) => {
    const user = await requireAuth(request);
    const body = createWorkspaceBodySchema.parse(request.body);
    return workspaceService.createWorkspace(user, body, reply);
  });

  app.get('/workspaces/current', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    return workspaceService.getWorkspace(user.id, workspace.id);
  });

  app.patch('/workspaces/current', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
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
    const { workspace } = await requireWorkspace(request);
    const body = inviteMemberBodySchema.parse(request.body);
    return workspaceService.inviteMember(workspace, body);
  });

  app.patch('/workspaces/current/members/:memberId', async (request) => {
    const { workspace } = await requireWorkspace(request);
    const params = request.params as { memberId: string };
    const body = updateMemberRoleBodySchema.parse(request.body);
    return workspaceService.updateMemberRole(workspace, params.memberId, body);
  });

  app.delete('/workspaces/current/members/:memberId', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    const params = request.params as { memberId: string };
    return workspaceService.removeMember(workspace, user.id, params.memberId);
  });
}

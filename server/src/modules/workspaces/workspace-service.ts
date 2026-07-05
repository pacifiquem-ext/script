import type { FastifyReply } from 'fastify';
import {
  SIGNUP_CREDIT_GRANT,
  type CreateWorkspaceBody,
  type InviteMemberBody,
  type UpdateMemberRoleBody,
  type UpdateWorkspaceBody,
} from '@script/shared';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../common/errors';
import { prisma } from '../../db/prisma';
import { setWorkspaceCookie } from '../../lib/cookies';
import type { AuthUser, WorkspaceContext } from '../../plugins/auth';
import { requireWorkspaceRole } from '../../plugins/auth';
import { toPublicMember, toPublicWorkspace } from './serialize';

export async function listWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: { include: { creditBalance: true, _count: { select: { members: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return {
    workspaces: memberships.map((m) =>
      toPublicWorkspace(m.workspace, m.role, {
        creditBalance: m.workspace.creditBalance?.balance ?? 0,
        memberCount: m.workspace._count.members,
      }),
    ),
  };
}

export async function getWorkspace(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: {
      workspace: { include: { creditBalance: true, _count: { select: { members: true } } } },
    },
  });
  if (!membership) throw new NotFoundError('Workspace');
  return {
    workspace: toPublicWorkspace(membership.workspace, membership.role, {
      creditBalance: membership.workspace.creditBalance?.balance ?? 0,
      memberCount: membership.workspace._count.members,
    }),
  };
}

export async function createWorkspace(
  user: AuthUser,
  body: CreateWorkspaceBody,
  reply: FastifyReply,
) {
  const workspace = await prisma.workspace.create({
    data: {
      name: body.name,
      plan: 'free',
      members: { create: { userId: user.id, role: 'owner' } },
      creditBalance: { create: { balance: SIGNUP_CREDIT_GRANT } },
      creditLedger: {
        create: {
          userId: user.id,
          delta: SIGNUP_CREDIT_GRANT,
          reason: 'signup_grant',
          note: 'Workspace creation grant',
        },
      },
    },
    include: { creditBalance: true, _count: { select: { members: true } } },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastWorkspaceId: workspace.id } });

  setWorkspaceCookie(reply, workspace.id);
  return {
    workspace: toPublicWorkspace(workspace, 'owner', {
      creditBalance: workspace.creditBalance?.balance ?? 0,
      memberCount: workspace._count.members,
    }),
  };
}

export async function updateWorkspace(
  user: AuthUser,
  workspace: WorkspaceContext,
  body: UpdateWorkspaceBody,
) {
  requireWorkspaceRole(workspace, ['owner', 'admin']);
  const updated = await prisma.workspace.update({
    where: { id: workspace.id },
    data: { name: body.name },
    include: { creditBalance: true, _count: { select: { members: true } } },
  });
  return {
    workspace: toPublicWorkspace(updated, workspace.role, {
      creditBalance: updated.creditBalance?.balance ?? 0,
      memberCount: updated._count.members,
    }),
  };
}

export async function switchWorkspace(user: AuthUser, workspaceId: string, reply: FastifyReply) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    include: {
      workspace: { include: { creditBalance: true, _count: { select: { members: true } } } },
    },
  });
  if (!membership) throw new ForbiddenError('Not a member of this workspace');

  await prisma.user.update({ where: { id: user.id }, data: { lastWorkspaceId: workspaceId } });
  setWorkspaceCookie(reply, workspaceId);
  return {
    workspace: toPublicWorkspace(membership.workspace, membership.role, {
      creditBalance: membership.workspace.creditBalance?.balance ?? 0,
      memberCount: membership.workspace._count.members,
    }),
  };
}

export async function listMembers(workspace: WorkspaceContext) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return { members: members.map(toPublicMember) };
}

export async function inviteMember(workspace: WorkspaceContext, body: InviteMemberBody) {
  requireWorkspaceRole(workspace, ['owner', 'admin']);
  const email = body.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new NotFoundError('User');
  if (user.id && body.role === undefined) {
    // no-op
  }

  const existing = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
  });
  if (existing) throw new ConflictError('User is already a member');

  const member = await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role: body.role },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return { member: toPublicMember(member) };
}

export async function updateMemberRole(
  actor: WorkspaceContext,
  memberId: string,
  body: UpdateMemberRoleBody,
) {
  requireWorkspaceRole(actor, ['owner', 'admin']);
  const member = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: actor.id },
  });
  if (!member) throw new NotFoundError('Member');
  if (member.role === 'owner') throw new BadRequestError('Cannot change the owner role');

  const updated = await prisma.workspaceMember.update({
    where: { id: member.id },
    data: { role: body.role },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return { member: toPublicMember(updated) };
}

export async function removeMember(actor: WorkspaceContext, actorUserId: string, memberId: string) {
  requireWorkspaceRole(actor, ['owner', 'admin']);
  const member = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: actor.id },
  });
  if (!member) throw new NotFoundError('Member');
  if (member.role === 'owner') throw new BadRequestError('Cannot remove the workspace owner');
  if (member.userId === actorUserId) throw new BadRequestError('Cannot remove yourself');

  await prisma.workspaceMember.delete({ where: { id: member.id } });
  return { ok: true as const };
}

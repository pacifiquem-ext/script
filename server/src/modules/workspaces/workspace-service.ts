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
import { recordAudit } from '../audit/audit-service';
import { assertLicenseAllowsWrite, assertSeatAvailable } from '../license/license-service';
import { createInvite } from './invites-service';
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

export async function inviteMember(
  workspace: WorkspaceContext,
  actor: AuthUser,
  body: InviteMemberBody,
  ip?: string | null,
) {
  requireWorkspaceRole(workspace, ['owner', 'admin']);
  await assertLicenseAllowsWrite();
  const email = body.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  // Existing account → immediate membership (seat-capped). New email → token invite.
  if (!user) {
    return createInvite(workspace, actor, body, ip);
  }

  const existing = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
  });
  if (existing) throw new ConflictError('User is already a member');

  await assertSeatAvailable(1);
  const member = await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role: body.role },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  await recordAudit({
    workspaceId: workspace.id,
    actorUserId: actor.id,
    action: 'invite.accept',
    targetType: 'member',
    targetId: member.id,
    metadata: { email, mode: 'direct_add' },
    ip,
  });
  return { member: toPublicMember(member) };
}

export async function updateMemberRole(
  actor: WorkspaceContext,
  actorUserId: string,
  memberId: string,
  body: UpdateMemberRoleBody,
  ip?: string | null,
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
  await recordAudit({
    workspaceId: actor.id,
    actorUserId,
    action: 'member.role_change',
    targetType: 'member',
    targetId: member.id,
    metadata: { from: member.role, to: body.role },
    ip,
  });
  return { member: toPublicMember(updated) };
}

export async function updateMemberClearance(
  actor: WorkspaceContext,
  actorUserId: string,
  memberId: string,
  clearanceLevel: number,
  ip?: string | null,
) {
  requireWorkspaceRole(actor, ['owner', 'admin']);
  const member = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: actor.id },
  });
  if (!member) throw new NotFoundError('Member');

  const updated = await prisma.workspaceMember.update({
    where: { id: member.id },
    data: { clearanceLevel },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  await recordAudit({
    workspaceId: actor.id,
    actorUserId,
    action: 'member.clearance_change',
    targetType: 'member',
    targetId: member.id,
    metadata: { clearanceLevel },
    ip,
  });
  return { member: toPublicMember(updated) };
}

export async function removeMember(
  actor: WorkspaceContext,
  actorUserId: string,
  memberId: string,
  ip?: string | null,
) {
  requireWorkspaceRole(actor, ['owner', 'admin']);
  const member = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: actor.id },
  });
  if (!member) throw new NotFoundError('Member');
  if (member.role === 'owner') throw new BadRequestError('Cannot remove the workspace owner');
  if (member.userId === actorUserId) throw new BadRequestError('Cannot remove yourself');

  await prisma.workspaceMember.delete({ where: { id: member.id } });
  await recordAudit({
    workspaceId: actor.id,
    actorUserId,
    action: 'member.remove',
    targetType: 'member',
    targetId: memberId,
    metadata: { removedUserId: member.userId },
    ip,
  });
  return { ok: true as const };
}

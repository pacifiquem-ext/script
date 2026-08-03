import { createHash, randomBytes } from 'node:crypto';
import {
  INVITE_TTL_MS,
  type AcceptInviteBody,
  type BulkInviteBody,
  type CreateInviteBody,
  type PublicInvite,
} from '@script/shared';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../common/errors';
import { prisma } from '../../db/prisma';
import type { AuthUser, WorkspaceContext } from '../../plugins/auth';
import { requireWorkspaceRole } from '../../plugins/auth';
import { sendInviteEmail } from '../email/mailer';
import { recordAudit } from '../audit/audit-service';
import { assertLicenseAllowsWrite, assertSeatAvailable } from '../license/license-service';
import { env } from '../../config/env';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function inviteStatus(row: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): PublicInvite['status'] {
  if (row.acceptedAt) return 'accepted';
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt.getTime() < Date.now()) return 'expired';
  return 'pending';
}

function mapInvite(row: {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): PublicInvite {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    status: inviteStatus(row),
  };
}

function appBaseUrl(): string {
  return env.APP_PUBLIC_URL ?? env.primaryCorsOrigin;
}

async function createOneInvite(
  workspace: WorkspaceContext,
  actor: AuthUser,
  emailRaw: string,
  role: 'admin' | 'member',
  ip?: string | null,
): Promise<{ invite: PublicInvite; token: string }> {
  await assertLicenseAllowsWrite();
  await assertSeatAvailable(1);

  const email = emailRaw.toLowerCase();
  const existingMember = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: { where: { workspaceId: workspace.id }, take: 1 },
    },
  });
  if (existingMember?.memberships.length) {
    throw new ConflictError(`${email} is already a member`);
  }

  const pending = await prisma.workspaceInvite.findFirst({
    where: {
      workspaceId: workspace.id,
      email,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (pending) {
    throw new ConflictError(`Pending invite already exists for ${email}`);
  }

  const token = randomBytes(32).toString('base64url');
  const invite = await prisma.workspaceInvite.create({
    data: {
      workspaceId: workspace.id,
      email,
      role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      invitedById: actor.id,
    },
  });

  const acceptUrl = `${appBaseUrl().replace(/\/$/, '')}/invite/accept?token=${encodeURIComponent(token)}`;
  await sendInviteEmail({
    to: email,
    workspaceName: workspace.name,
    inviterName: actor.name,
    acceptUrl,
  });

  await recordAudit({
    workspaceId: workspace.id,
    actorUserId: actor.id,
    action: 'invite.create',
    targetType: 'invite',
    targetId: invite.id,
    metadata: { email, role },
    ip,
  });

  return { invite: mapInvite(invite), token };
}

export async function listInvites(workspace: WorkspaceContext) {
  requireWorkspaceRole(workspace, ['owner', 'admin']);
  const rows = await prisma.workspaceInvite.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return { invites: rows.map(mapInvite) };
}

export async function createInvite(
  workspace: WorkspaceContext,
  actor: AuthUser,
  body: CreateInviteBody,
  ip?: string | null,
) {
  requireWorkspaceRole(workspace, ['owner', 'admin']);
  const { invite } = await createOneInvite(workspace, actor, body.email, body.role, ip);
  return { invite };
}

export async function bulkInvite(
  workspace: WorkspaceContext,
  actor: AuthUser,
  body: BulkInviteBody,
  ip?: string | null,
) {
  requireWorkspaceRole(workspace, ['owner', 'admin']);
  const unique = [...new Set(body.emails.map((e) => e.toLowerCase()))];
  await assertLicenseAllowsWrite();
  await assertSeatAvailable(unique.length);

  const created: PublicInvite[] = [];
  const errors: Array<{ email: string; error: string }> = [];
  for (const email of unique) {
    try {
      const { invite } = await createOneInvite(workspace, actor, email, body.role, ip);
      created.push(invite);
    } catch (err) {
      errors.push({
        email,
        error: err instanceof Error ? err.message : 'failed',
      });
    }
  }
  return { invites: created, errors };
}

export async function revokeInvite(
  workspace: WorkspaceContext,
  actor: AuthUser,
  inviteId: string,
  ip?: string | null,
) {
  requireWorkspaceRole(workspace, ['owner', 'admin']);
  const invite = await prisma.workspaceInvite.findFirst({
    where: { id: inviteId, workspaceId: workspace.id },
  });
  if (!invite) throw new NotFoundError('Invite');
  if (invite.acceptedAt) throw new BadRequestError('Invite already accepted');
  if (invite.revokedAt) return { invite: mapInvite(invite) };

  const updated = await prisma.workspaceInvite.update({
    where: { id: invite.id },
    data: { revokedAt: new Date() },
  });
  await recordAudit({
    workspaceId: workspace.id,
    actorUserId: actor.id,
    action: 'invite.revoke',
    targetType: 'invite',
    targetId: invite.id,
    metadata: { email: invite.email },
    ip,
  });
  return { invite: mapInvite(updated) };
}

export async function resendInvite(
  workspace: WorkspaceContext,
  actor: AuthUser,
  inviteId: string,
  ip?: string | null,
) {
  requireWorkspaceRole(workspace, ['owner', 'admin']);
  await assertLicenseAllowsWrite();
  const invite = await prisma.workspaceInvite.findFirst({
    where: { id: inviteId, workspaceId: workspace.id },
  });
  if (!invite) throw new NotFoundError('Invite');
  if (invite.acceptedAt || invite.revokedAt) throw new BadRequestError('Invite is not pending');

  const token = randomBytes(32).toString('base64url');
  const updated = await prisma.workspaceInvite.update({
    where: { id: invite.id },
    data: {
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  const acceptUrl = `${appBaseUrl().replace(/\/$/, '')}/invite/accept?token=${encodeURIComponent(token)}`;
  await sendInviteEmail({
    to: invite.email,
    workspaceName: workspace.name,
    inviterName: actor.name,
    acceptUrl,
  });

  await recordAudit({
    workspaceId: workspace.id,
    actorUserId: actor.id,
    action: 'invite.resend',
    targetType: 'invite',
    targetId: invite.id,
    metadata: { email: invite.email },
    ip,
  });
  return { invite: mapInvite(updated) };
}

export async function acceptInvite(user: AuthUser, body: AcceptInviteBody, ip?: string | null) {
  await assertLicenseAllowsWrite();
  const tokenHash = hashToken(body.token);
  const invite = await prisma.workspaceInvite.findUnique({ where: { tokenHash } });
  if (!invite || invite.revokedAt) throw new NotFoundError('Invite');
  if (invite.acceptedAt) throw new ConflictError('Invite already accepted');
  if (invite.expiresAt.getTime() < Date.now()) throw new BadRequestError('Invite expired');
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw new ForbiddenError('Signed-in email does not match the invite');
  }

  const existing = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
  });
  if (existing) {
    await prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });
    return { workspaceId: invite.workspaceId, alreadyMember: true };
  }

  await assertSeatAvailable(1);

  await prisma.$transaction([
    prisma.workspaceMember.create({
      data: {
        workspaceId: invite.workspaceId,
        userId: user.id,
        role: invite.role === 'owner' ? 'member' : invite.role,
      },
    }),
    prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastWorkspaceId: invite.workspaceId },
    }),
  ]);

  await recordAudit({
    workspaceId: invite.workspaceId,
    actorUserId: user.id,
    action: 'invite.accept',
    targetType: 'invite',
    targetId: invite.id,
    metadata: { email: invite.email },
    ip,
  });

  return { workspaceId: invite.workspaceId, alreadyMember: false };
}

export async function previewInvite(token: string) {
  const invite = await prisma.workspaceInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { workspace: { select: { name: true } } },
  });
  if (!invite || invite.revokedAt) throw new NotFoundError('Invite');
  return {
    email: invite.email,
    workspaceName: invite.workspace.name,
    role: invite.role,
    status: inviteStatus(invite),
    expiresAt: invite.expiresAt.toISOString(),
  };
}

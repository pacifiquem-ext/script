import {
  updateMemberCreditShareBodySchema,
  updatePreferencesBodySchema,
  updateProfileBodySchema,
  userPreferencesSchema,
  type UpdatePreferencesBody,
  type UpdateProfileBody,
} from '@script/shared';
import { NotFoundError } from '../../common/errors';
import { prisma } from '../../db/prisma';
import { sha256 } from '../../lib/crypto';
import { storage } from '../../storage';
import { toPublicUser } from '../auth/serialize';
import { requireWorkspaceRole, type WorkspaceContext } from '../../plugins/auth';

export async function updateProfile(userId: string, body: UpdateProfileBody) {
  const parsed = updateProfileBodySchema.parse(body);
  const user = await prisma.user.update({ where: { id: userId }, data: { name: parsed.name } });
  return { user: await toPublicUser(user) };
}

export async function updateAvatar(
  userId: string,
  buffer: Buffer,
  filename: string,
  contentType: string,
) {
  const uploaded = await storage.upload({ buffer, filename, contentType });
  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarStorageKey: uploaded.key },
  });
  return { user: await toPublicUser(user) };
}

export async function getPreferences(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return { preferences: userPreferencesSchema.parse(user.preferences ?? {}) };
}

export async function updatePreferences(userId: string, body: UpdatePreferencesBody) {
  const parsed = updatePreferencesBodySchema.parse(body);
  const current = await getPreferences(userId);
  const preferences = userPreferencesSchema.parse({ ...current.preferences, ...parsed });
  await prisma.user.update({ where: { id: userId }, data: { preferences } });
  return { preferences };
}

export async function listSessions(userId: string, currentRefreshRaw?: string) {
  const currentHash = currentRefreshRaw ? sha256(currentRefreshRaw) : null;
  const rows = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  return {
    sessions: rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      ip: row.ip,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      current: currentHash ? row.tokenHash === currentHash : false,
    })),
  };
}

export async function revokeSession(userId: string, sessionId: string) {
  const row = await prisma.refreshToken.findFirst({ where: { id: sessionId, userId } });
  if (!row) throw new NotFoundError('Session');
  await prisma.refreshToken.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  return { ok: true as const };
}

export async function updateMemberCreditShare(
  workspace: WorkspaceContext,
  memberId: string,
  body: unknown,
) {
  requireWorkspaceRole(workspace, ['owner', 'admin']);
  const parsed = updateMemberCreditShareBodySchema.parse(body);
  const member = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: workspace.id },
  });
  if (!member) throw new NotFoundError('Member');
  const updated = await prisma.workspaceMember.update({
    where: { id: memberId },
    data: { creditShare: parsed.creditShare },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return {
    member: {
      id: updated.id,
      userId: updated.user.id,
      email: updated.user.email,
      name: updated.user.name,
      role: updated.role,
      creditShare: updated.creditShare,
      createdAt: updated.createdAt.toISOString(),
    },
  };
}

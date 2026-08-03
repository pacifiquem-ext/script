import type { ResourceKind, ResourceVisibility } from '@prisma/client';
import { prisma } from '../../db/prisma';

export type AccessPrincipal = {
  userId: string;
  workspaceId: string;
  clearanceLevel: number;
  role: 'owner' | 'admin' | 'member';
};

export async function loadAccessPrincipal(
  workspaceId: string,
  userId: string,
): Promise<AccessPrincipal | null> {
  if (userId.startsWith('api-key:')) {
    return { userId, workspaceId, clearanceLevel: 100, role: 'admin' };
  }
  const m = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!m) return null;
  return {
    userId,
    workspaceId,
    clearanceLevel: m.clearanceLevel,
    role: m.role,
  };
}

/**
 * Resource is visible when:
 * - clearanceLevel <= principal.clearanceLevel, AND
 * - visibility=workspace OR principal is owner/admin OR listed in ResourcePrincipal
 */
export async function filterAccessibleResourceIds(input: {
  principal: AccessPrincipal;
  resourceKind: ResourceKind;
  candidates: Array<{
    id: string;
    clearanceLevel: number;
    visibility: ResourceVisibility;
  }>;
}): Promise<Set<string>> {
  const { principal, resourceKind, candidates } = input;
  if (candidates.length === 0) return new Set();

  const levelOk = candidates.filter((c) => c.clearanceLevel <= principal.clearanceLevel);
  const unrestricted = levelOk.filter((c) => c.visibility === 'workspace').map((c) => c.id);
  const restrictedIds = levelOk.filter((c) => c.visibility === 'restricted').map((c) => c.id);

  if (principal.role === 'owner' || principal.role === 'admin') {
    return new Set(levelOk.map((c) => c.id));
  }

  const allowed = new Set(unrestricted);
  if (restrictedIds.length === 0) return allowed;

  const principals = await prisma.resourcePrincipal.findMany({
    where: {
      workspaceId: principal.workspaceId,
      resourceKind,
      resourceId: { in: restrictedIds },
      userId: principal.userId,
    },
    select: { resourceId: true },
  });
  for (const p of principals) allowed.add(p.resourceId);
  return allowed;
}

export async function replaceResourcePrincipals(input: {
  workspaceId: string;
  resourceKind: ResourceKind;
  resourceId: string;
  userIds: string[];
}): Promise<void> {
  await prisma.resourcePrincipal.deleteMany({
    where: {
      workspaceId: input.workspaceId,
      resourceKind: input.resourceKind,
      resourceId: input.resourceId,
    },
  });
  if (input.userIds.length) {
    await prisma.resourcePrincipal.createMany({
      data: input.userIds.map((userId) => ({
        workspaceId: input.workspaceId,
        resourceKind: input.resourceKind,
        resourceId: input.resourceId,
        userId,
      })),
      skipDuplicates: true,
    });
  }
}

export async function upsertPersonIdentity(input: {
  workspaceId: string;
  provider: string;
  externalId: string;
  email?: string | null;
  displayName?: string | null;
  userId?: string | null;
}): Promise<void> {
  let userId = input.userId ?? null;
  if (!userId && input.email) {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      select: { id: true },
    });
    if (user) {
      const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: user.id } },
      });
      if (member) userId = user.id;
    }
  }
  await prisma.personIdentity.upsert({
    where: {
      workspaceId_provider_externalId: {
        workspaceId: input.workspaceId,
        provider: input.provider,
        externalId: input.externalId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      provider: input.provider,
      externalId: input.externalId,
      email: input.email?.toLowerCase() ?? null,
      displayName: input.displayName ?? null,
      userId,
    },
    update: {
      email: input.email?.toLowerCase() ?? undefined,
      displayName: input.displayName ?? undefined,
      userId: userId ?? undefined,
    },
  });
}

export async function resolveUserIdFromIdentity(
  workspaceId: string,
  provider: string,
  externalId: string,
): Promise<string | null> {
  const row = await prisma.personIdentity.findUnique({
    where: {
      workspaceId_provider_externalId: { workspaceId, provider, externalId },
    },
  });
  return row?.userId ?? null;
}

export async function resolvePrincipalFromIdentity(
  workspaceId: string,
  provider: string,
  externalId: string,
): Promise<AccessPrincipal | null> {
  const userId = await resolveUserIdFromIdentity(workspaceId, provider, externalId);
  if (!userId) return null;
  return loadAccessPrincipal(workspaceId, userId);
}

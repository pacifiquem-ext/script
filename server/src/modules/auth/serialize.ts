import type { User } from '@prisma/client';
import type { PublicUser } from '@script/shared';
import { storage } from '../../storage';

export async function toPublicUser(user: User): Promise<PublicUser> {
  let avatarUrl: string | null = null;
  if (user.avatarStorageKey) {
    try {
      avatarUrl = await storage.getSignedDownloadUrl(user.avatarStorageKey);
    } catch {
      avatarUrl = null;
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastWorkspaceId: user.lastWorkspaceId,
    createdAt: user.createdAt.toISOString(),
  };
}

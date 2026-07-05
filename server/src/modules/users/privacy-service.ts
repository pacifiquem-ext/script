import type { FastifyReply } from 'fastify';
import { deleteAccountBodySchema, type DeleteAccountBody } from '@script/shared';
import { BadRequestError, UnauthorizedError } from '../../common/errors';
import { prisma } from '../../db/prisma';
import { clearAuthCookies } from '../../lib/cookies';
import { verifyPassword } from '../../lib/password';
import { storage } from '../../storage';
import { toPublicUser } from '../auth/serialize';
import { getPreferences } from './users-service';

const MAX_SIGNED_URLS = 500;

export async function exportAccountData(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const preferences = await getPreferences(userId);
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        include: {
          folders: { orderBy: { name: 'asc' } },
          documents: { orderBy: { createdAt: 'desc' } },
          conversations: {
            where: { userId },
            orderBy: { updatedAt: 'desc' },
            include: {
              messages: {
                orderBy: { createdAt: 'asc' },
                include: { mentions: true },
              },
            },
          },
          creditBalance: true,
        },
      },
    },
  });

  let signedUrlCount = 0;
  const workspaces = [];
  for (const membership of memberships) {
    const docs = [];
    for (const doc of membership.workspace.documents) {
      let downloadUrl: string | null = null;
      if (signedUrlCount < MAX_SIGNED_URLS) {
        try {
          downloadUrl = await storage.getSignedDownloadUrl(doc.storageKey, 3600);
          signedUrlCount += 1;
        } catch {
          downloadUrl = null;
        }
      }
      docs.push({
        id: doc.id,
        name: doc.name,
        folderId: doc.folderId,
        mimeType: doc.mimeType,
        byteSize: doc.byteSize,
        source: doc.source,
        sourceUrl: doc.sourceUrl,
        status: doc.status,
        failureReason: doc.failureReason,
        pageCount: doc.pageCount,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        processedAt: doc.processedAt?.toISOString() ?? null,
        downloadUrl,
      });
    }

    workspaces.push({
      id: membership.workspace.id,
      name: membership.workspace.name,
      plan: membership.workspace.plan,
      role: membership.role,
      creditShare: membership.creditShare,
      creditBalance: membership.workspace.creditBalance?.balance ?? 0,
      folders: membership.workspace.folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        createdAt: folder.createdAt.toISOString(),
        updatedAt: folder.updatedAt.toISOString(),
      })),
      documents: docs,
      conversations: membership.workspace.conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        messages: conversation.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          documentIds: message.mentions.map((m) => m.documentId),
          createdAt: message.createdAt.toISOString(),
        })),
      })),
    });
  }

  return {
    exportedAt: new Date().toISOString(),
    user: await toPublicUser(user),
    preferences: preferences.preferences,
    workspaces,
  };
}

async function transferOwnershipIfNeeded(workspaceId: string, departingUserId: string) {
  const members = await prisma.workspaceMember.findMany({ where: { workspaceId } });
  if (members.length <= 1) return { deleteWorkspace: true as const };

  const departing = members.find((m) => m.userId === departingUserId);
  if (!departing || departing.role !== 'owner') {
    return { deleteWorkspace: false as const };
  }

  const successor =
    members.find((m) => m.userId !== departingUserId && m.role === 'admin') ??
    members.find((m) => m.userId !== departingUserId && m.role === 'member');
  if (!successor) {
    throw new BadRequestError(
      'Cannot delete account while you are the sole owner of a shared workspace with no successor',
    );
  }

  await prisma.workspaceMember.update({
    where: { id: successor.id },
    data: { role: 'owner' },
  });
  return { deleteWorkspace: false as const };
}

async function deleteWorkspaceData(workspaceId: string) {
  const documents = await prisma.document.findMany({
    where: { workspaceId },
    select: { storageKey: true },
  });
  await prisma.workspace.delete({ where: { id: workspaceId } });
  for (const doc of documents) {
    try {
      await storage.delete(doc.storageKey);
    } catch {
      // best effort
    }
  }
}

export async function deleteAccount(userId: string, body: DeleteAccountBody, reply: FastifyReply) {
  const parsed = deleteAccountBodySchema.parse(body);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError();

  if (parsed.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new BadRequestError('Confirmation email does not match this account');
  }
  if (!(await verifyPassword(user.passwordHash, parsed.password))) {
    throw new UnauthorizedError('Password is incorrect');
  }

  const memberships = await prisma.workspaceMember.findMany({ where: { userId } });
  const workspacesToDelete: string[] = [];

  for (const membership of memberships) {
    const decision = await transferOwnershipIfNeeded(membership.workspaceId, userId);
    if (decision.deleteWorkspace) {
      workspacesToDelete.push(membership.workspaceId);
    }
  }

  const avatarKey = user.avatarStorageKey;

  for (const workspaceId of workspacesToDelete) {
    await deleteWorkspaceData(workspaceId);
  }

  await prisma.user.delete({ where: { id: userId } });

  if (avatarKey) {
    try {
      await storage.delete(avatarKey);
    } catch {
      // best effort
    }
  }

  clearAuthCookies(reply);
  return { ok: true as const };
}

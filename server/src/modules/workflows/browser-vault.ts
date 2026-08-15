import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  BadRequestError,
  ConfigurationError,
  ConflictError,
  NotFoundError,
} from '../../common/errors';
import { prisma } from '../../db/prisma';
import { decryptSecret, encryptSecret, hasTokenEncryptionKey } from '../../lib/token-crypto';

const storageStateSchema = z
  .object({
    cookies: z.array(z.unknown()).optional(),
    origins: z.array(z.unknown()).optional(),
  })
  .passthrough()
  .refine((value) => Array.isArray(value.cookies) || Array.isArray(value.origins), {
    message: 'storageState must include a cookies array or origins array (Playwright storageState)',
  });

export type PublicBrowserSession = {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
};

function mapSession(row: {
  id: string;
  name: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}): PublicBrowserSession {
  return {
    id: row.id,
    name: row.name,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const MAX_STORAGE_STATE_BYTES = 256 * 1024;

export function parseStorageState(input: unknown): Record<string, unknown> {
  let value = input;
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > MAX_STORAGE_STATE_BYTES) {
      throw new BadRequestError('storageState is too large (max 256KB)');
    }
    try {
      value = JSON.parse(value);
    } catch {
      throw new BadRequestError('storageState must be valid JSON');
    }
  }
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_STORAGE_STATE_BYTES) {
    throw new BadRequestError('storageState is too large (max 256KB)');
  }
  const parsed = storageStateSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestError(
      'storageState must look like Playwright storageState (cookies[] or origins[])',
      parsed.error.flatten(),
    );
  }
  return parsed.data;
}

export async function listBrowserSessions(
  workspaceId: string,
  userId: string,
): Promise<{ sessions: PublicBrowserSession[] }> {
  const rows = await prisma.browserSessionVault.findMany({
    where: { workspaceId, userId },
    orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, name: true, lastUsedAt: true, createdAt: true },
  });
  return { sessions: rows.map(mapSession) };
}

export async function createBrowserSession(
  workspaceId: string,
  userId: string,
  input: { name: string; storageState?: unknown },
): Promise<PublicBrowserSession> {
  if (!hasTokenEncryptionKey()) {
    throw new ConfigurationError('TOKEN_ENCRYPTION_KEY is required to store browser login vaults');
  }
  const name = input.name.trim();
  if (!name || name.length > 80) {
    throw new BadRequestError('name must be 1–80 characters');
  }
  const storageState = parseStorageState(input.storageState);
  try {
    const row = await prisma.browserSessionVault.create({
      data: {
        workspaceId,
        userId,
        name,
        encryptedStorageState: encryptSecret(JSON.stringify(storageState)),
      },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true },
    });
    return mapSession(row);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('A browser session with this name already exists');
    }
    throw err;
  }
}

export async function deleteBrowserSession(
  workspaceId: string,
  userId: string,
  id: string,
): Promise<{ ok: true }> {
  const row = await prisma.browserSessionVault.findFirst({
    where: { id, workspaceId, userId },
    select: { id: true },
  });
  if (!row) throw new NotFoundError('Browser session');
  await prisma.browserSessionVault.delete({ where: { id: row.id } });
  return { ok: true };
}

export async function loadBrowserSessionStorageState(
  workspaceId: string,
  userId: string,
  id: string,
): Promise<unknown> {
  if (!hasTokenEncryptionKey()) {
    throw new ConfigurationError(
      'TOKEN_ENCRYPTION_KEY is required to decrypt browser login vaults',
    );
  }
  const row = await prisma.browserSessionVault.findFirst({
    where: { id, workspaceId, userId },
  });
  if (!row) throw new NotFoundError('Browser session');
  let parsed: unknown;
  try {
    parsed = JSON.parse(decryptSecret(row.encryptedStorageState));
  } catch {
    throw new BadRequestError('Stored browser session could not be decrypted');
  }
  await prisma.browserSessionVault.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });
  return parsed;
}

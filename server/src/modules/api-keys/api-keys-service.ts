import { createHash, randomBytes } from 'node:crypto';
import type { CreateApiKeyBody } from '@script/shared';
import { ForbiddenError, NotFoundError } from '../../common/errors';
import { prisma } from '../../db/prisma';

const hits = new Map<string, number[]>();

function hashKey(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

function mapKey(row: {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  useCount: number;
  rateLimitRpm: number;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    useCount: row.useCount,
    rateLimitRpm: row.rateLimitRpm,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function writeAudit(
  apiKeyId: string,
  action: string,
  meta?: { ip?: string | null; userAgent?: string | null },
) {
  await prisma.apiKeyAuditEvent.create({
    data: {
      apiKeyId,
      action,
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    },
  });
}

function assertRateLimit(apiKeyId: string, rpm: number) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const series = (hits.get(apiKeyId) ?? []).filter((ts) => ts >= windowStart);
  if (series.length >= rpm) {
    hits.set(apiKeyId, series);
    throw new ForbiddenError('API key rate limit exceeded');
  }
  series.push(now);
  hits.set(apiKeyId, series);
}

export async function listApiKeys(workspaceId: string) {
  const rows = await prisma.apiKey.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });
  return { apiKeys: rows.map(mapKey) };
}

export async function listAuditEvents(workspaceId: string, apiKeyId: string) {
  const key = await prisma.apiKey.findFirst({ where: { id: apiKeyId, workspaceId } });
  if (!key) throw new NotFoundError('API key');
  const events = await prisma.apiKeyAuditEvent.findMany({
    where: { apiKeyId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return {
    events: events.map((e) => ({
      id: e.id,
      action: e.action,
      ip: e.ip,
      userAgent: e.userAgent,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function createApiKey(
  workspaceId: string,
  userId: string,
  body: CreateApiKeyBody,
  meta?: { ip?: string | null; userAgent?: string | null },
) {
  const raw = `sk_live_${randomBytes(24).toString('base64url')}`;
  const keyPrefix = raw.slice(0, 12);
  const row = await prisma.apiKey.create({
    data: {
      workspaceId,
      name: body.name,
      keyPrefix,
      keyHash: hashKey(raw),
      createdById: userId,
    },
  });
  await writeAudit(row.id, 'created', meta);
  return { apiKey: mapKey(row), secret: raw };
}

export async function revokeApiKey(
  workspaceId: string,
  apiKeyId: string,
  meta?: { ip?: string | null; userAgent?: string | null },
) {
  const existing = await prisma.apiKey.findFirst({ where: { id: apiKeyId, workspaceId } });
  if (!existing) throw new NotFoundError('API key');
  const row = await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { revokedAt: new Date() },
  });
  await writeAudit(apiKeyId, 'revoked', meta);
  return { apiKey: mapKey(row) };
}

export async function findApiKey(
  raw: string,
  meta?: { ip?: string | null; userAgent?: string | null },
) {
  const row = await prisma.apiKey.findFirst({
    where: { keyHash: hashKey(raw), revokedAt: null },
    include: { workspace: true, createdBy: true },
  });
  if (!row) return null;
  try {
    assertRateLimit(row.id, row.rateLimitRpm);
  } catch (error) {
    await writeAudit(row.id, 'rate_limited', meta);
    throw error;
  }
  const updated = await prisma.apiKey.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
    include: { workspace: true, createdBy: true },
  });
  await writeAudit(row.id, 'used', meta);
  return updated;
}

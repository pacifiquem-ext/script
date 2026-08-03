import { paginate, toSkipTake, type ListAuditQuery, type PublicAuditEvent } from '@script/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { logger } from '../../lib/logger';

export async function recordAudit(input: {
  workspaceId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        workspaceId: input.workspaceId ?? null,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, action: input.action }, 'failed to write audit event');
  }
}

function mapEvent(row: {
  id: string;
  workspaceId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Prisma.JsonValue;
  ip: string | null;
  createdAt: Date;
}): PublicAuditEvent {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    actorUserId: row.actorUserId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAuditEvents(workspaceId: string | null, query: ListAuditQuery) {
  const where = {
    ...(workspaceId ? { workspaceId } : {}),
    ...(query.action ? { action: query.action } : {}),
  };
  const total = await prisma.auditEvent.count({ where });
  const { skip, take } = toSkipTake(query);
  const rows = await prisma.auditEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip,
    take,
  });
  return {
    events: rows.map(mapEvent),
    pagination: paginate(rows.map(mapEvent), total, query).pagination,
  };
}

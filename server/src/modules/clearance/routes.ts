import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace, requireWorkspaceRole } from '../../plugins/auth';
import { prisma } from '../../db/prisma';
import { replaceResourcePrincipals, upsertPersonIdentity } from './clearance-service';
import { recordAudit } from '../audit/audit-service';
import { NotFoundError } from '../../common/errors';

export async function clearanceRoutes(app: FastifyInstance) {
  app.put('/clearance/resources/:kind/:id/principals', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const { kind, id } = request.params as { kind: string; id: string };
    const body = z.object({ userIds: z.array(z.string().min(1)).max(200) }).parse(request.body);
    const resourceKind = z
      .enum(['document', 'meeting', 'channel', 'work_item', 'work_project'])
      .parse(kind);
    await replaceResourcePrincipals({
      workspaceId: workspace.id,
      resourceKind,
      resourceId: id,
      userIds: body.userIds,
    });
    if (resourceKind === 'document') {
      await prisma.document.updateMany({
        where: { id, workspaceId: workspace.id },
        data: { visibility: 'restricted' },
      });
    }
    if (resourceKind === 'meeting') {
      await prisma.meeting.updateMany({
        where: { id, workspaceId: workspace.id },
        data: { visibility: 'restricted' },
      });
    }
    await recordAudit({
      workspaceId: workspace.id,
      actorUserId: user.id,
      action: 'clearance.principals_set',
      targetType: resourceKind,
      targetId: id,
      metadata: { userIds: body.userIds },
    });
    return { ok: true as const };
  });

  app.post('/clearance/identities', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const body = z
      .object({
        provider: z.string().min(1).max(64),
        externalId: z.string().min(1).max(256),
        email: z.string().email().optional(),
        displayName: z.string().max(200).optional(),
        userId: z.string().optional(),
      })
      .parse(request.body);
    await upsertPersonIdentity({
      workspaceId: workspace.id,
      provider: body.provider,
      externalId: body.externalId,
      email: body.email,
      displayName: body.displayName,
      userId: body.userId,
    });
    await recordAudit({
      workspaceId: workspace.id,
      actorUserId: user.id,
      action: 'identity.upsert',
      targetType: 'person_identity',
      metadata: body,
    });
    return { ok: true as const };
  });

  app.get('/clearance/identities', async (request) => {
    const { workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const rows = await prisma.personIdentity.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return {
      identities: rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        externalId: r.externalId,
        userId: r.userId,
        email: r.email,
        displayName: r.displayName,
      })),
    };
  });

  app.patch('/documents/:documentId/visibility', async (request) => {
    const { user, workspace } = await requireWorkspace(request);
    requireWorkspaceRole(workspace, ['owner', 'admin']);
    const { documentId } = request.params as { documentId: string };
    const body = z
      .object({
        visibility: z.enum(['workspace', 'restricted']),
        clearanceLevel: z.number().int().min(0).max(100).optional(),
      })
      .parse(request.body);
    const doc = await prisma.document.findFirst({
      where: { id: documentId, workspaceId: workspace.id },
    });
    if (!doc) throw new NotFoundError('Document');
    await prisma.document.update({
      where: { id: documentId },
      data: {
        visibility: body.visibility,
        clearanceLevel: body.clearanceLevel ?? undefined,
      },
    });
    await recordAudit({
      workspaceId: workspace.id,
      actorUserId: user.id,
      action: 'document.visibility',
      targetType: 'document',
      targetId: documentId,
      metadata: body,
    });
    return { ok: true as const };
  });
}

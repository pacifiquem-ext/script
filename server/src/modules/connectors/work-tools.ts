import type { AgentToolContext } from '../chat/agent/registry';
import { listWorkItemsLocal, liveGetWorkItem } from './github-service';
import { prisma } from '../../db/prisma';

export async function listWorkItemsTool(
  ctx: AgentToolContext,
  input: { q?: string; state?: string; limit?: number },
) {
  return listWorkItemsLocal(ctx.workspaceId, input);
}

export async function getWorkItemTool(
  ctx: AgentToolContext,
  input: { externalId?: string; title?: string },
) {
  let externalId = input.externalId;
  if (!externalId && input.title?.trim()) {
    const row = await prisma.workItem.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        title: { equals: input.title.trim(), mode: 'insensitive' },
      },
    });
    externalId = row?.externalId;
  }
  if (!externalId) return null;
  return liveGetWorkItem(ctx.workspaceId, externalId);
}

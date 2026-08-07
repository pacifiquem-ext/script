import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { sha256 } from '../../lib/crypto';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors';

const TTL_MS = 15 * 60 * 1000;

export type WriteConfirmationEvidence = {
  method: 'agent_browser' | 'agent_tool' | 'manual';
  summary: string;
  finalUrl?: string;
  actions?: string[];
};

export type CompleteStepConfirmationPayload = {
  runId: string;
  stepKey: string;
  evidence: WriteConfirmationEvidence;
};

export async function createWriteConfirmation(input: {
  workspaceId: string;
  userId: string;
  toolName: string;
  payload: CompleteStepConfirmationPayload;
}): Promise<string> {
  const token = randomBytes(24).toString('hex');
  const row = await prisma.agentWriteConfirmation.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      toolName: input.toolName,
      payloadJson: input.payload as Prisma.InputJsonValue,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return row.id;
}

export async function consumeWriteConfirmation(
  workspaceId: string,
  userId: string,
  confirmationId: string,
): Promise<{ toolName: string; payload: CompleteStepConfirmationPayload }> {
  const updated = await prisma.agentWriteConfirmation.updateMany({
    where: {
      id: confirmationId,
      workspaceId,
      userId,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  if (updated.count !== 1) {
    const existing = await prisma.agentWriteConfirmation.findFirst({
      where: { id: confirmationId, workspaceId, userId },
    });
    if (!existing) throw new NotFoundError('Write confirmation');
    if (existing.usedAt) throw new ConflictError('Confirmation already used');
    throw new BadRequestError('Confirmation expired');
  }
  const row = await prisma.agentWriteConfirmation.findFirstOrThrow({
    where: { id: confirmationId, workspaceId, userId },
  });
  return {
    toolName: row.toolName,
    payload: row.payloadJson as CompleteStepConfirmationPayload,
  };
}

export async function rejectWriteConfirmation(
  workspaceId: string,
  userId: string,
  confirmationId: string,
): Promise<{ ok: true }> {
  const updated = await prisma.agentWriteConfirmation.updateMany({
    where: {
      id: confirmationId,
      workspaceId,
      userId,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  if (updated.count !== 1) {
    const existing = await prisma.agentWriteConfirmation.findFirst({
      where: { id: confirmationId, workspaceId, userId },
    });
    if (!existing) throw new NotFoundError('Write confirmation');
    if (existing.usedAt) throw new ConflictError('Confirmation already used');
    throw new BadRequestError('Confirmation expired');
  }
  return { ok: true };
}

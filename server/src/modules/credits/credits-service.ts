import type { CreditLedgerReason, Prisma } from '@prisma/client';
import { BadRequestError } from '../../common/errors';
import { prisma } from '../../db/prisma';
import { getLicenseStatus } from '../license/license-service';

export async function getBalance(workspaceId: string) {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    include: { creditBalance: true },
  });
  return {
    balance: workspace.creditBalance?.balance ?? 0,
    plan: workspace.plan,
  };
}

export async function getWorkspaceUsage(workspaceId: string) {
  const [workspace, memberCount, documentCount, conversationCount, meetingCount, license] =
    await Promise.all([
      prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        include: { creditBalance: true },
      }),
      prisma.workspaceMember.count({ where: { workspaceId } }),
      prisma.document.count({ where: { workspaceId } }),
      prisma.conversation.count({ where: { workspaceId } }),
      prisma.meeting.count({ where: { workspaceId } }),
      getLicenseStatus(),
    ]);

  return {
    plan: workspace.plan,
    creditBalance: workspace.creditBalance?.balance ?? 0,
    memberCount,
    seatCap: license.enforced ? license.seats : null,
    seatsUsed: license.enforced ? license.seatsUsed : memberCount,
    documentCount,
    conversationCount,
    meetingCount,
    licenseEnforced: license.enforced,
  };
}

export async function assertHasCredits(workspaceId: string, cost: number) {
  const { balance } = await getBalance(workspaceId);
  if (balance < cost) {
    throw new BadRequestError('Insufficient credits', { balance, cost });
  }
}

export async function decrementCredits(input: {
  workspaceId: string;
  userId?: string | null;
  cost: number;
  reason: CreditLedgerReason;
  refType?: string;
  refId?: string;
  note?: string;
  tx?: Prisma.TransactionClient;
}) {
  if (input.cost <= 0) return getBalance(input.workspaceId);

  const run = async (tx: Prisma.TransactionClient) => {
    if (input.refType && input.refId) {
      const existing = await tx.creditLedgerEntry.findFirst({
        where: {
          workspaceId: input.workspaceId,
          reason: input.reason,
          refType: input.refType,
          refId: input.refId,
          delta: { lt: 0 },
        },
      });
      if (existing) {
        const row = await tx.creditBalance.findUnique({
          where: { workspaceId: input.workspaceId },
        });
        return { balance: row?.balance ?? 0, charged: false as const };
      }
    }

    const row = await tx.creditBalance.findUnique({ where: { workspaceId: input.workspaceId } });
    if (!row || row.balance < input.cost) {
      throw new BadRequestError('Insufficient credits', {
        balance: row?.balance ?? 0,
        cost: input.cost,
      });
    }
    const updated = await tx.creditBalance.update({
      where: { workspaceId: input.workspaceId },
      data: { balance: { decrement: input.cost } },
    });
    await tx.creditLedgerEntry.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId ?? null,
        delta: -input.cost,
        reason: input.reason,
        refType: input.refType,
        refId: input.refId,
        note: input.note,
      },
    });
    return { balance: updated.balance, charged: true as const };
  };

  if (input.tx) return run(input.tx);
  return prisma.$transaction(run);
}

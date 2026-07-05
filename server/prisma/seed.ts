import { PrismaClient, WorkspacePlan, WorkspaceRole } from '@prisma/client';
import { SIGNUP_CREDIT_GRANT } from '@script/shared';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

async function main() {
  const email = 'dev@script.local';
  const passwordHash = await hashPassword('devpassword123');
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, emailVerifiedAt: existing.emailVerifiedAt ?? new Date() },
    });
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: 'Dev User',
      passwordHash,
      emailVerifiedAt: new Date(),
      memberships: {
        create: {
          role: WorkspaceRole.owner,
          workspace: {
            create: {
              name: 'Personal Workspace',
              plan: WorkspacePlan.free,
              creditBalance: { create: { balance: SIGNUP_CREDIT_GRANT } },
              creditLedger: {
                create: {
                  delta: SIGNUP_CREDIT_GRANT,
                  reason: 'signup_grant',
                  note: 'Initial dev seed grant',
                },
              },
            },
          },
        },
      },
    },
    include: { memberships: true },
  });

  const workspaceId = user.memberships[0]?.workspaceId;
  if (workspaceId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastWorkspaceId: workspaceId },
    });
    await prisma.creditLedgerEntry.updateMany({
      where: { workspaceId, userId: null },
      data: { userId: user.id },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';
import { setEmbedderForTests } from '../src/modules/jobs/embeddings';
import { disconnectGitHub, indexWorkItemMemory } from '../src/modules/connectors/github-service';

async function seedWorkspace(prefix: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const user = await prisma.user.create({
    data: {
      email: `${prefix}-${suffix}@example.com`,
      name: 'Connector Mem',
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
      memberships: {
        create: {
          role: 'owner',
          workspace: {
            create: {
              name: `${prefix} ws`,
              creditBalance: { create: { balance: 100 } },
            },
          },
        },
      },
    },
    include: { memberships: true },
  });
  return { user, workspaceId: user.memberships[0]!.workspaceId };
}

describe('indexWorkItemMemory', () => {
  const workspaceIds: string[] = [];

  afterAll(async () => {
    if (workspaceIds.length) {
      await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    }
    setEmbedderForTests(null);
  });

  it('upserts a work_item MemorySource and chunks with issue externalId', async () => {
    const { workspaceId } = await seedWorkspace('idx-ok');
    workspaceIds.push(workspaceId);
    const item = await prisma.workItem.create({
      data: {
        workspaceId,
        externalId: 'github:acme/api#42',
        title: 'Fix login timeout',
        body: 'Users are kicked after 30s. Reproduce on staging.',
        state: 'open',
      },
    });

    await indexWorkItemMemory({
      workspaceId,
      workItemId: item.id,
      externalId: item.externalId,
      title: item.title,
      body: item.body,
      issueNumber: 42,
    });

    const source = await prisma.memorySource.findFirst({
      where: { workspaceId, type: 'work_item', externalKey: item.externalId },
    });
    expect(source?.title).toBe('Fix login timeout');
    const chunks = await prisma.memoryChunk.findMany({
      where: { memorySourceId: source!.id },
      orderBy: { position: 'asc' },
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.sourceType === 'work_item')).toBe(true);
    expect(chunks.every((c) => c.externalId === '42')).toBe(true);
    expect(chunks.some((c) => c.content.includes('Fix login timeout'))).toBe(true);
  });

  it('stores chunks without embeddings when embed fails', async () => {
    const { workspaceId } = await seedWorkspace('idx-fail');
    workspaceIds.push(workspaceId);
    setEmbedderForTests({
      embedTexts: async () => {
        throw new Error('voyage down');
      },
      embedQuery: async () => {
        throw new Error('voyage down');
      },
    });
    const item = await prisma.workItem.create({
      data: {
        workspaceId,
        externalId: 'github:acme/api#7',
        title: 'Broken embed path',
        body: 'Still index the issue text when embeddings fail.',
        state: 'open',
      },
    });

    await expect(
      indexWorkItemMemory({
        workspaceId,
        workItemId: item.id,
        externalId: item.externalId,
        title: item.title,
        body: item.body,
        issueNumber: 7,
      }),
    ).resolves.toBeUndefined();

    const source = await prisma.memorySource.findFirst({
      where: { workspaceId, type: 'work_item', externalKey: item.externalId },
    });
    const chunks = await prisma.memoryChunk.findMany({ where: { memorySourceId: source!.id } });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.externalId).toBe('7');
    expect(chunks[0]?.content).toContain('Broken embed path');
    setEmbedderForTests(null);
  });

  it('disconnect deletes github work items and their memory sources', async () => {
    const { user, workspaceId } = await seedWorkspace('idx-dc');
    workspaceIds.push(workspaceId);
    const connector = await prisma.systemConnector.create({
      data: {
        workspaceId,
        provider: 'github',
        encryptedCredentials: 'not-a-real-secret',
        status: 'connected',
        installedById: user.id,
      },
    });
    const project = await prisma.workProject.create({
      data: {
        workspaceId,
        connectorId: connector.id,
        externalId: 'acme/api',
        name: 'acme/api',
        url: 'https://github.com/acme/api',
      },
    });
    const item = await prisma.workItem.create({
      data: {
        workspaceId,
        projectId: project.id,
        externalId: 'github:acme/api#9',
        title: 'Will vanish',
        body: 'Gone after disconnect.',
        state: 'open',
      },
    });
    await indexWorkItemMemory({
      workspaceId,
      workItemId: item.id,
      externalId: item.externalId,
      title: item.title,
      body: item.body,
      issueNumber: 9,
    });

    await disconnectGitHub(workspaceId, user.id);

    expect(await prisma.systemConnector.findUnique({ where: { id: connector.id } })).toBeNull();
    expect(await prisma.workProject.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await prisma.workItem.findUnique({ where: { id: item.id } })).toBeNull();
    expect(
      await prisma.memorySource.findFirst({
        where: { workspaceId, type: 'work_item', externalKey: item.externalId },
      }),
    ).toBeNull();
  });
});

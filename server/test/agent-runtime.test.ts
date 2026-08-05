import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';
import {
  executeAgentTool,
  isLibraryInventoryIntent,
  runAgentWithTools,
} from '../src/modules/chat/agent';
import { createReadyDocumentWithVersion } from './helpers-documents';

describe('isLibraryInventoryIntent', () => {
  it('detects catalog phrasings', () => {
    expect(isLibraryInventoryIntent('Tell me about my whole library')).toBe(true);
    expect(isLibraryInventoryIntent('list all documents with a one-line summary')).toBe(true);
    expect(isLibraryInventoryIntent('What is the Q3 pricing?')).toBe(false);
  });
});

describe('runAgentWithTools production loop', () => {
  let workspaceId = '';

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `agent-runtime-${Date.now()}@example.com`,
        name: 'Runtime',
        passwordHash: 'x',
        emailVerifiedAt: new Date(),
        memberships: {
          create: {
            role: 'owner',
            workspace: {
              create: {
                name: 'Runtime WS',
                creditBalance: { create: { balance: 50 } },
              },
            },
          },
        },
      },
      include: { memberships: true },
    });
    workspaceId = user.memberships[0]!.workspaceId;
    await createReadyDocumentWithVersion({
      workspaceId,
      name: 'policy.txt',
      content: 'Security policy requires MFA for all employees.',
      storageKey: 'rt-policy',
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { memberships: { some: { workspaceId } } },
    });
  });

  it('hard-routes inventory without calling the model', async () => {
    const events: string[] = [];
    for await (const e of runAgentWithTools({
      system: 'sys',
      messages: [{ role: 'user', content: 'What is in my library?' }],
      toolContext: { workspaceId },
    })) {
      events.push(e.type === 'delta' ? `delta:${e.text.slice(0, 40)}` : e.type);
    }
    expect(events).toContain('tool_call');
    expect(events).toContain('tool_result');
    expect(events.some((e) => e.startsWith('delta:') && e.includes('Library inventory'))).toBe(
      true,
    );
  });

  it('Mastra-backed get_document_summary executes via registry bridge', async () => {
    const result = await executeAgentTool(
      'get_document_summary',
      { name: 'policy.txt' },
      { workspaceId },
    );
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ name: 'policy.txt' });
    const summary = (result.data as { summary?: string }).summary ?? '';
    expect(summary).toMatch(/MFA|Security policy/i);
  });

  it('get_document_summary is workspace-scoped', async () => {
    const other = await prisma.user.create({
      data: {
        email: `agent-other-${Date.now()}@example.com`,
        name: 'Other',
        passwordHash: 'x',
        emailVerifiedAt: new Date(),
        memberships: {
          create: {
            role: 'owner',
            workspace: {
              create: {
                name: 'Other WS',
                creditBalance: { create: { balance: 10 } },
              },
            },
          },
        },
      },
      include: { memberships: true },
    });
    const otherWs = other.memberships[0]!.workspaceId;
    await createReadyDocumentWithVersion({
      workspaceId: otherWs,
      name: 'secret-other.txt',
      content: 'Should not appear in primary workspace list.',
      storageKey: 'rt-other',
    });

    const { listLibraryDocuments, getLibraryDocument } =
      await import('../src/modules/chat/agent/library-tools');
    const listed = await listLibraryDocuments({ workspaceId }, {});
    expect(listed.documents.some((d) => d.name === 'secret-other.txt')).toBe(false);
    const foreign = await getLibraryDocument({ workspaceId }, { name: 'secret-other.txt' });
    expect(foreign).toBeNull();

    await prisma.user.delete({ where: { id: other.id } });
  });
});

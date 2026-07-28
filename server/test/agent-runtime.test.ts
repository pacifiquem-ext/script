import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../src/db/prisma';
import {
  isLibraryInventoryIntent,
  runAgentWithTools,
  setAnthropicMessagesCreateForTests,
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
    setAnthropicMessagesCreateForTests(null);
    await prisma.user.deleteMany({
      where: { memberships: { some: { workspaceId } } },
    });
  });

  it('hard-routes inventory without calling Anthropic', async () => {
    let called = 0;
    setAnthropicMessagesCreateForTests(async () => {
      called += 1;
      throw new Error('should not call model for inventory');
    });
    const events: string[] = [];
    for await (const e of runAgentWithTools({
      system: 'sys',
      messages: [{ role: 'user', content: 'What is in my library?' }],
      toolContext: { workspaceId },
    })) {
      events.push(e.type === 'delta' ? `delta:${e.text.slice(0, 40)}` : e.type);
    }
    expect(called).toBe(0);
    expect(events.some((e) => e.startsWith('delta:') && e.includes('Library inventory'))).toBe(
      true,
    );
  });

  it('executes tool_use then final text when model requests tools', async () => {
    let round = 0;
    setAnthropicMessagesCreateForTests(async (params) => {
      round += 1;
      if (round === 1) {
        expect(params.tools.length).toBeGreaterThan(0);
        return {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'test',
          stop_reason: 'tool_use',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [
            {
              type: 'tool_use',
              id: 'tu_1',
              name: 'get_document_summary',
              input: { name: 'policy.txt' },
            },
          ],
        } as Anthropic.Messages.Message;
      }
      return {
        id: 'msg_2',
        type: 'message',
        role: 'assistant',
        model: 'test',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: 'text', text: 'Policy requires MFA for employees.' }],
      } as Anthropic.Messages.Message;
    });

    const kinds: string[] = [];
    let answer = '';
    for await (const e of runAgentWithTools({
      system: 'sys',
      messages: [{ role: 'user', content: 'What does the security policy say?' }],
      toolContext: { workspaceId },
    })) {
      kinds.push(e.type);
      if (e.type === 'delta') answer += e.text;
      if (e.type === 'tool_call') expect(e.name).toBe('get_document_summary');
    }
    expect(kinds).toContain('tool_call');
    expect(kinds).toContain('tool_result');
    expect(kinds).toContain('delta');
    expect(answer).toMatch(/MFA/i);
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

    const { listLibraryDocuments, getLibraryDocument } = await import(
      '../src/modules/chat/agent/library-tools'
    );
    const listed = await listLibraryDocuments({ workspaceId }, {});
    expect(listed.documents.some((d) => d.name === 'secret-other.txt')).toBe(false);
    const foreign = await getLibraryDocument(
      { workspaceId },
      { name: 'secret-other.txt' },
    );
    expect(foreign).toBeNull();

    await prisma.user.delete({ where: { id: other.id } });
  });
});

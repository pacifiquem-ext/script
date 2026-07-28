import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';
import { buildDocumentSummary } from '../src/modules/chat/agent/document-summary';
import {
  defaultTestAgentRunner,
  executeAgentTool,
  listLibraryDocuments,
  setWebSearchForTests,
} from '../src/modules/chat/agent';
import { createReadyDocumentWithVersion } from './helpers-documents';

describe('document summary helper', () => {
  it('truncates long text at a word/sentence boundary', () => {
    const long = `${'Alpha sentence. '.repeat(40)}Tail`;
    const summary = buildDocumentSummary(long, 80);
    expect(summary.length).toBeLessThanOrEqual(85);
    expect(summary.endsWith('…')).toBe(true);
    expect(summary).toContain('Alpha');
  });

  it('returns short text unchanged', () => {
    expect(buildDocumentSummary('Short blurb.')).toBe('Short blurb.');
  });
});

describe('library agent tools', () => {
  let workspaceId = '';

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `agent-tools-${Date.now()}@example.com`,
        name: 'Agent Tools',
        passwordHash: 'x',
        emailVerifiedAt: new Date(),
        memberships: {
          create: {
            role: 'owner',
            workspace: {
              create: {
                name: 'Agent WS',
                creditBalance: { create: { balance: 100 } },
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
      name: 'handbook.pdf',
      content: 'Welcome to the company. Day one: read the security policy and meet your buddy.',
      storageKey: 'agent-handbook',
    });
    await createReadyDocumentWithVersion({
      workspaceId,
      name: 'roadmap.md',
      content: 'Q3 roadmap includes connectors and onboarding workflows for the company brain.',
      storageKey: 'agent-roadmap',
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { memberships: { some: { workspaceId } } },
    });
  });

  it('lists library documents with summaries', async () => {
    const listed = await listLibraryDocuments({ workspaceId }, { limit: 20 });
    expect(listed.total).toBeGreaterThanOrEqual(2);
    const names = listed.documents.map((d) => d.name).sort();
    expect(names).toContain('handbook.pdf');
    expect(names).toContain('roadmap.md');
    const handbook = listed.documents.find((d) => d.name === 'handbook.pdf');
    expect(handbook?.summary).toMatch(/Welcome to the company/i);
  });

  it('executeAgentTool list_library_documents returns inventory JSON', async () => {
    const result = await executeAgentTool('list_library_documents', { limit: 10 }, { workspaceId });
    expect(result.ok).toBe(true);
    const data = result.data as { documents: Array<{ name: string }> };
    expect(data.documents.some((d) => d.name === 'roadmap.md')).toBe(true);
  });

  it('defaultTestAgentRunner answers inventory questions via tools', async () => {
    const events: Array<{ type: string; text?: string; name?: string }> = [];
    for await (const event of defaultTestAgentRunner({
      system: 'test',
      messages: [
        {
          role: 'user',
          content: 'Tell me about my whole library, just a file and one line of its summary.',
        },
      ],
      toolContext: { workspaceId },
    })) {
      if (event.type === 'delta') events.push({ type: 'delta', text: event.text });
      if (event.type === 'tool_call') events.push({ type: 'tool_call', name: event.name });
      if (event.type === 'tool_result') events.push({ type: 'tool_result', name: event.name });
    }
    expect(events.some((e) => e.type === 'tool_call' && e.name === 'list_library_documents')).toBe(
      true,
    );
    const answer = events.find((e) => e.type === 'delta')?.text ?? '';
    expect(answer).toMatch(/Library inventory/i);
    expect(answer).toMatch(/handbook\.pdf/);
    expect(answer).not.toMatch(/I don't have visibility/i);
    expect(answer).not.toMatch(/I do not have access/i);
  });

  it('web_search tool uses injected implementation', async () => {
    setWebSearchForTests(async (query) => [
      { title: 'Result', url: 'https://example.com', snippet: `About ${query}` },
    ]);
    try {
      const result = await executeAgentTool(
        'web_search',
        { query: 'company brain AI', maxResults: 2 },
        { workspaceId },
      );
      expect(result.ok).toBe(true);
      const data = result.data as { results: Array<{ url: string }> };
      expect(data.results[0]?.url).toBe('https://example.com');
    } finally {
      setWebSearchForTests(null);
    }
  });
});

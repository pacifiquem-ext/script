import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/jobs/extract', () => ({
  extractText: vi.fn(async () => ({ text: 'Hello world from contract.', pageCount: 1 })),
  chunkText: (t: string) => [t],
}));
vi.mock('../src/modules/jobs/embeddings', () => ({
  embedTexts: vi.fn(async (texts: string[]) =>
    texts.map(() => Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0))),
  ),
  embedQuery: vi.fn(),
  vectorLiteral: (v: number[]) => `[${v.join(',')}]`,
}));
vi.mock('../src/modules/credits/credits-service', () => ({
  decrementCredits: vi.fn(async () => ({ balance: 10 })),
  assertHasCredits: vi.fn(),
}));
vi.mock('../src/storage', () => ({
  storage: {
    getSignedDownloadUrl: vi.fn(async () => 'https://example.com/file'),
    upload: vi.fn(),
    delete: vi.fn(),
  },
}));

import { embedTexts } from '../src/modules/jobs/embeddings';
import { decrementCredits } from '../src/modules/credits/credits-service';
import { prisma } from '../src/db/prisma';
import { processIngestion } from '../src/modules/jobs/ingestion';

describe('ingestion processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks document ready using faked extractor/embedder', async () => {
    const suffix = `${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        email: `ingest-${suffix}@example.com`,
        name: 'Ingest',
        passwordHash: 'x',
        emailVerifiedAt: new Date(),
        memberships: {
          create: {
            role: 'owner',
            workspace: {
              create: {
                name: 'W',
                creditBalance: { create: { balance: 100 } },
              },
            },
          },
        },
      },
      include: { memberships: true },
    });
    const workspaceId = user.memberships[0]!.workspaceId;
    const doc = await prisma.document.create({
      data: {
        workspaceId,
        name: 'a.txt',
        mimeType: 'text/plain',
        byteSize: 12,
        storageKey: 'k',
        source: 'local',
        sourceUrl: 'https://example.com/a.txt',
        status: 'pending',
        createdById: user.id,
      },
    });

    global.fetch = vi.fn(
      async () => new Response('Hello world from contract.', { status: 200 }),
    ) as typeof fetch;

    await processIngestion({ documentId: doc.id, workspaceId, userId: user.id });
    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.status).toBe('ready');
    expect(updated.extractedText).toContain('Hello world');
    expect(embedTexts).toHaveBeenCalled();
    expect(decrementCredits).toHaveBeenCalled();
    const chunks = await prisma.documentChunk.count({ where: { documentId: doc.id } });
    expect(chunks).toBeGreaterThan(0);
    await prisma.user.delete({ where: { id: user.id } });
  }, 60_000);
});

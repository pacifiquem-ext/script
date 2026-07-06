import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/jobs/extract', async () => {
  const actual = await vi.importActual<typeof import('../src/modules/jobs/extract')>(
    '../src/modules/jobs/extract',
  );
  return {
    ...actual,
    extractText: vi.fn(async () => ({ text: 'Hello world from contract.', pageCount: 1 })),
  };
});

import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from '@script/shared';
import { decrementCredits } from '../src/modules/credits/credits-service';
import { prisma } from '../src/db/prisma';
import { chunkText } from '../src/modules/jobs/extract';
import { processIngestion } from '../src/modules/jobs/ingestion';
import { embedTexts } from '../src/modules/jobs/embeddings';

describe('chunkText', () => {
  it('creates overlapping chunks with offsets', () => {
    const text = 'a'.repeat(2500);
    const chunks = chunkText(text, 1200, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.startOffset).toBe(0);
    expect(chunks[0]?.endOffset).toBeGreaterThan(chunks[0]!.startOffset);
    expect(chunks[1]!.startOffset).toBeLessThan(chunks[0]!.endOffset);
  });
});

describe('ingestion processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks document ready, embeds, and charges once idempotently', async () => {
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
    expect(updated.processingPhase).toBeNull();
    expect(updated.extractedText).toContain('Hello world');
    expect(updated.embeddingModel).toBe(EMBEDDING_MODEL);
    expect(updated.embeddingDimensions).toBe(EMBEDDING_DIMENSIONS);
    const chunks = await prisma.documentChunk.findMany({ where: { documentId: doc.id } });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.startOffset).toBeTypeOf('number');

    const balanceAfterFirst = await prisma.creditBalance.findUniqueOrThrow({
      where: { workspaceId },
    });
    await processIngestion({
      documentId: doc.id,
      workspaceId,
      userId: user.id,
      mode: 'backfill',
    });
    const balanceAfterBackfill = await prisma.creditBalance.findUniqueOrThrow({
      where: { workspaceId },
    });
    expect(balanceAfterBackfill.balance).toBe(balanceAfterFirst.balance);

    await decrementCredits({
      workspaceId,
      userId: user.id,
      cost: 1,
      reason: 'ingestion_usage',
      refType: 'document',
      refId: doc.id,
    });
    const balanceAfterDuplicate = await prisma.creditBalance.findUniqueOrThrow({
      where: { workspaceId },
    });
    expect(balanceAfterDuplicate.balance).toBe(balanceAfterFirst.balance);

    const vectors = await embedTexts(['hello']);
    expect(vectors[0]?.length).toBe(EMBEDDING_DIMENSIONS);

    await prisma.user.delete({ where: { id: user.id } });
  }, 60_000);

  it('uses extractedText on backfill without re-download when present', async () => {
    const suffix = `${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        email: `backfill-${suffix}@example.com`,
        name: 'Backfill',
        passwordHash: 'x',
        emailVerifiedAt: new Date(),
        memberships: {
          create: {
            role: 'owner',
            workspace: {
              create: {
                name: 'W2',
                creditBalance: { create: { balance: 50 } },
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
        name: 'ready.txt',
        mimeType: 'text/plain',
        byteSize: 12,
        storageKey: 'k2',
        source: 'local',
        status: 'ready',
        extractedText: 'Stored extracted text for backfill path.',
        embeddingModel: 'old-model',
        embeddingDimensions: 512,
        createdById: user.id,
      },
    });
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as typeof fetch;
    await processIngestion({
      documentId: doc.id,
      workspaceId,
      userId: user.id,
      mode: 'backfill',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.status).toBe('ready');
    expect(updated.embeddingModel).toBe(EMBEDDING_MODEL);
    await prisma.user.delete({ where: { id: user.id } });
  }, 60_000);
});

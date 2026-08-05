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

import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, INGESTION_CREDIT_COST } from '@script/shared';
import { decrementCredits } from '../src/modules/credits/credits-service';
import { prisma } from '../src/db/prisma';
import { chunkText } from '../src/modules/jobs/extract';
import { processIngestion } from '../src/modules/jobs/ingestion';
import { embedTexts } from '../src/modules/jobs/embeddings';
import { hashDocumentBytes } from '../src/modules/library/document-versions';

async function seedWorkspace(emailPrefix: string, balance = 100) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}-${suffix}@example.com`,
      name: 'Ingest',
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
      memberships: {
        create: {
          role: 'owner',
          workspace: {
            create: {
              name: 'W',
              creditBalance: { create: { balance } },
            },
          },
        },
      },
    },
    include: { memberships: true },
  });
  return { user, workspaceId: user.memberships[0]!.workspaceId };
}

describe('chunkText', () => {
  it('creates overlapping chunks with offsets', () => {
    const text = 'a'.repeat(2500);
    const chunks = chunkText(text, 480, 80);
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

  it('marks document ready, embeds, and charges once idempotently per version', async () => {
    const { user, workspaceId } = await seedWorkspace('ingest');
    const content = 'Hello world from contract.';
    const contentHash = hashDocumentBytes(Buffer.from(content));

    const doc = await prisma.document.create({
      data: {
        workspaceId,
        name: 'a.txt',
        mimeType: 'text/plain',
        byteSize: content.length,
        storageKey: 'k',
        source: 'local',
        sourceUrl: 'https://example.com/a.txt',
        status: 'pending',
        contentHash,
        createdById: user.id,
      },
    });
    const version = await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        workspaceId,
        versionNumber: 1,
        status: 'pending',
        mimeType: 'text/plain',
        byteSize: content.length,
        storageKey: 'k',
        contentHash,
        changeReason: 'upload',
        createdById: user.id,
      },
    });
    await prisma.document.update({
      where: { id: doc.id },
      data: { processingVersionId: version.id },
    });

    global.fetch = vi.fn(async () => new Response(content, { status: 200 })) as typeof fetch;

    await processIngestion({
      documentId: doc.id,
      workspaceId,
      userId: user.id,
      versionId: version.id,
    });
    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.status).toBe('ready');
    expect(updated.processingPhase).toBeNull();
    expect(updated.extractedText).toContain('Hello world');
    expect(updated.embeddingModel).toBe(EMBEDDING_MODEL);
    expect(updated.embeddingDimensions).toBe(EMBEDDING_DIMENSIONS);
    expect(updated.currentVersionId).toBe(version.id);
    expect(updated.processingVersionId).toBeNull();

    const chunks = await prisma.documentChunk.findMany({
      where: { documentVersionId: version.id },
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.startOffset).toBeTypeOf('number');

    const balanceAfterFirst = await prisma.creditBalance.findUniqueOrThrow({
      where: { workspaceId },
    });
    expect(balanceAfterFirst.balance).toBe(100 - INGESTION_CREDIT_COST);

    // Idempotent re-charge for same version ref
    await decrementCredits({
      workspaceId,
      userId: user.id,
      cost: 1,
      reason: 'ingestion_usage',
      refType: 'document_version',
      refId: version.id,
    });
    const balanceAfterDuplicate = await prisma.creditBalance.findUniqueOrThrow({
      where: { workspaceId },
    });
    expect(balanceAfterDuplicate.balance).toBe(balanceAfterFirst.balance);

    // Backfill does not charge
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

    const vectors = await embedTexts(['hello']);
    expect(vectors[0]?.length).toBe(EMBEDDING_DIMENSIONS);

    await prisma.user.delete({ where: { id: user.id } });
  }, 60_000);

  it('uses extractedText on backfill without re-download when present', async () => {
    const { user, workspaceId } = await seedWorkspace('backfill');
    const content = 'Stored extracted text for backfill path.';
    const doc = await prisma.document.create({
      data: {
        workspaceId,
        name: 'ready.txt',
        mimeType: 'text/plain',
        byteSize: content.length,
        storageKey: 'k2',
        source: 'local',
        status: 'ready',
        extractedText: content,
        embeddingModel: 'old-model',
        embeddingDimensions: 512,
        createdById: user.id,
      },
    });
    const version = await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        workspaceId,
        versionNumber: 1,
        status: 'ready',
        mimeType: 'text/plain',
        byteSize: content.length,
        storageKey: 'k2',
        extractedText: content,
        embeddingModel: 'old-model',
        embeddingDimensions: 512,
        changeReason: 'upload',
        processedAt: new Date(),
        createdById: user.id,
      },
    });
    await prisma.document.update({
      where: { id: doc.id },
      data: { currentVersionId: version.id },
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
    // Backfill created a new version; old version remains for citations
    const versions = await prisma.documentVersion.findMany({
      where: { documentId: doc.id },
      orderBy: { versionNumber: 'asc' },
    });
    expect(versions.length).toBe(2);
    expect(versions[0]!.id).toBe(version.id);
    expect(updated.currentVersionId).toBe(versions[1]!.id);
    await prisma.user.delete({ where: { id: user.id } });
  }, 60_000);

  it('failed reprocess does not demote a ready current version', async () => {
    const { extractText } = await import('../src/modules/jobs/extract');
    const { user, workspaceId } = await seedWorkspace('fail-reprocess');
    const content = 'Stable working content that must remain.';
    const contentHash = hashDocumentBytes(Buffer.from(content));

    const doc = await prisma.document.create({
      data: {
        workspaceId,
        name: 'stable.txt',
        mimeType: 'text/plain',
        byteSize: content.length,
        storageKey: 'stable-key',
        source: 'local',
        sourceUrl: 'https://example.com/stable.txt',
        status: 'ready',
        extractedText: content,
        contentHash,
        embeddingModel: EMBEDDING_MODEL,
        embeddingDimensions: EMBEDDING_DIMENSIONS,
        processedAt: new Date(),
        createdById: user.id,
      },
    });
    const v1 = await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        workspaceId,
        versionNumber: 1,
        status: 'ready',
        mimeType: 'text/plain',
        byteSize: content.length,
        storageKey: 'stable-key',
        contentHash,
        extractedText: content,
        embeddingModel: EMBEDDING_MODEL,
        embeddingDimensions: EMBEDDING_DIMENSIONS,
        changeReason: 'upload',
        processedAt: new Date(),
      },
    });
    const chunk = await prisma.documentChunk.create({
      data: {
        documentId: doc.id,
        documentVersionId: v1.id,
        workspaceId,
        position: 0,
        content,
        startOffset: 0,
        endOffset: content.length,
      },
    });
    await prisma.document.update({
      where: { id: doc.id },
      data: { currentVersionId: v1.id },
    });

    const v2 = await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        workspaceId,
        versionNumber: 2,
        status: 'pending',
        mimeType: 'text/plain',
        byteSize: content.length,
        storageKey: 'stable-key',
        contentHash,
        changeReason: 'reprocess',
      },
    });
    await prisma.document.update({
      where: { id: doc.id },
      data: { processingVersionId: v2.id },
    });

    vi.mocked(extractText).mockRejectedValueOnce(new Error('OCR exploded'));
    global.fetch = vi.fn(async () => new Response(content, { status: 200 })) as typeof fetch;

    await expect(
      processIngestion({
        documentId: doc.id,
        workspaceId,
        userId: user.id,
        versionId: v2.id,
      }),
    ).rejects.toThrow(/OCR exploded/);

    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.status).toBe('ready');
    expect(updated.currentVersionId).toBe(v1.id);
    expect(updated.processingVersionId).toBeNull();
    expect(updated.extractedText).toBe(content);

    const oldChunk = await prisma.documentChunk.findUnique({ where: { id: chunk.id } });
    expect(oldChunk).not.toBeNull();
    expect(oldChunk!.content).toBe(content);

    const failed = await prisma.documentVersion.findUniqueOrThrow({ where: { id: v2.id } });
    expect(failed.status).toBe('failed');

    await prisma.user.delete({ where: { id: user.id } });
  }, 60_000);

  it('does not charge again when reprocessing the same content hash', async () => {
    const { user, workspaceId } = await seedWorkspace('same-hash');
    const content = 'Same bytes same bill skip.';
    const contentHash = hashDocumentBytes(Buffer.from(content));

    const doc = await prisma.document.create({
      data: {
        workspaceId,
        name: 'same.txt',
        mimeType: 'text/plain',
        byteSize: content.length,
        storageKey: 'same-key',
        source: 'local',
        sourceUrl: 'https://example.com/same.txt',
        status: 'ready',
        extractedText: content,
        contentHash,
        embeddingModel: EMBEDDING_MODEL,
        embeddingDimensions: EMBEDDING_DIMENSIONS,
        processedAt: new Date(),
        createdById: user.id,
      },
    });
    const v1 = await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        workspaceId,
        versionNumber: 1,
        status: 'ready',
        mimeType: 'text/plain',
        byteSize: content.length,
        storageKey: 'same-key',
        contentHash,
        extractedText: content,
        embeddingModel: EMBEDDING_MODEL,
        embeddingDimensions: EMBEDDING_DIMENSIONS,
        changeReason: 'upload',
        processedAt: new Date(),
      },
    });
    await prisma.document.update({
      where: { id: doc.id },
      data: { currentVersionId: v1.id },
    });
    await decrementCredits({
      workspaceId,
      userId: user.id,
      cost: INGESTION_CREDIT_COST,
      reason: 'ingestion_usage',
      refType: 'document_version',
      refId: v1.id,
    });
    const balanceAfterV1 = (
      await prisma.creditBalance.findUniqueOrThrow({ where: { workspaceId } })
    ).balance;

    const v2 = await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        workspaceId,
        versionNumber: 2,
        status: 'pending',
        mimeType: 'text/plain',
        byteSize: content.length,
        storageKey: 'same-key',
        contentHash,
        changeReason: 'reprocess',
      },
    });
    await prisma.document.update({
      where: { id: doc.id },
      data: { processingVersionId: v2.id },
    });

    global.fetch = vi.fn(async () => new Response(content, { status: 200 })) as typeof fetch;

    await processIngestion({
      documentId: doc.id,
      workspaceId,
      userId: user.id,
      versionId: v2.id,
    });

    const balanceAfterV2 = (
      await prisma.creditBalance.findUniqueOrThrow({ where: { workspaceId } })
    ).balance;
    expect(balanceAfterV2).toBe(balanceAfterV1);

    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.currentVersionId).toBe(v2.id);
    expect(updated.status).toBe('ready');

    await prisma.user.delete({ where: { id: user.id } });
  }, 60_000);
});

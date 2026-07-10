import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sha256 } from '../src/lib/crypto';
import { hashDocumentBytes } from '../src/modules/library/document-versions';
import { originHeaders } from './helpers';
import { createReadyDocumentWithVersion } from './helpers-documents';
import { embedTexts, vectorLiteral } from '../src/modules/jobs/embeddings';

const app = buildApp();
const email = `versions-${Date.now()}@example.com`;
const cookies: Record<string, string> = {};

function absorb(res: { headers: Record<string, unknown> }) {
  const raw = res.headers['set-cookie'];
  if (!raw) return;
  for (const part of Array.isArray(raw) ? raw : [raw]) {
    const pair = String(part).split(';')[0] ?? '';
    const eq = pair.indexOf('=');
    if (eq > -1) cookies[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
}

describe('document version history', () => {
  let workspaceId = '';
  let conversationId = '';

  beforeAll(async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: originHeaders(),
      payload: { name: 'Versions User', email, password: 'password123' },
    });
    const otp = await prisma.emailOtp.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.emailOtp.update({
      where: { id: otp!.id },
      data: { codeHash: sha256('123456'), attempts: 0, expiresAt: new Date(Date.now() + 60_000) },
    });
    absorb(
      await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        headers: originHeaders(),
        payload: { email, code: '123456', purpose: 'signup_verify' },
      }),
    );
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: originHeaders(),
      cookies,
    });
    workspaceId = me.json().user.lastWorkspaceId;
    const conv = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: originHeaders(),
      cookies,
      payload: { title: 'Version chat' },
    });
    conversationId = conv.json().conversation.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('rollback creates a new current version without rewriting history', async () => {
    const { document, version: v1, chunkId } = await createReadyDocumentWithVersion({
      workspaceId,
      name: 'rollback-me.txt',
      content: 'Original version one body.',
      storageKey: 'rb-v1',
    });

    // Create v2 as current with different content
    const v2 = await prisma.documentVersion.create({
      data: {
        documentId: document.id,
        workspaceId,
        versionNumber: 2,
        status: 'ready',
        mimeType: 'text/plain',
        byteSize: 20,
        storageKey: 'rb-v2',
        contentHash: 'hash-v2',
        extractedText: 'Second version body that replaced v1.',
        embeddingModel: 'voyage-3.5',
        embeddingDimensions: 1024,
        changeReason: 'reprocess',
        processedAt: new Date(),
        supersededAt: null,
      },
    });
    await prisma.documentChunk.create({
      data: {
        documentId: document.id,
        documentVersionId: v2.id,
        workspaceId,
        position: 0,
        content: 'Second version body that replaced v1.',
        startOffset: 0,
        endOffset: 36,
      },
    });
    await prisma.documentVersion.update({
      where: { id: v1.id },
      data: { supersededAt: new Date() },
    });
    await prisma.document.update({
      where: { id: document.id },
      data: {
        currentVersionId: v2.id,
        extractedText: 'Second version body that replaced v1.',
        contentHash: 'hash-v2',
        storageKey: 'rb-v2',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/documents/${document.id}/versions/${v1.id}/rollback`,
      headers: originHeaders(),
      cookies,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version.versionNumber).toBe(3);
    expect(body.version.changeReason).toBe('rollback');
    expect(body.version.restoredFromVersionId).toBe(v1.id);
    expect(body.version.isCurrent).toBe(true);
    expect(body.document.currentVersionId).toBe(body.version.id);
    expect(body.document.currentVersionNumber).toBe(3);

    // History still has v1 and v2
    const list = await app.inject({
      method: 'GET',
      url: `/documents/${document.id}/versions`,
      headers: originHeaders(),
      cookies,
    });
    expect(list.statusCode).toBe(200);
    const versions = list.json().versions as Array<{ versionNumber: number; isCurrent: boolean }>;
    expect(versions.map((v) => v.versionNumber).sort()).toEqual([1, 2, 3]);
    expect(versions.find((v) => v.versionNumber === 3)?.isCurrent).toBe(true);
    expect(versions.find((v) => v.versionNumber === 1)?.isCurrent).toBe(false);

    // Original v1 chunk still exists (citation stability)
    const originalChunk = await prisma.documentChunk.findUnique({ where: { id: chunkId! } });
    expect(originalChunk).not.toBeNull();
    expect(originalChunk!.documentVersionId).toBe(v1.id);
    expect(originalChunk!.content).toBe('Original version one body.');
  });

  it('retrieval only uses the current version; prior version chunks remain but are not retrieved', async () => {
    const v1Text = 'UniqueAlphabetVersionOneCitationAnchor';
    const v2Text = 'UniqueZebraVersionTwoRetrievalTarget';
    const { document, version: v1, chunkId: v1ChunkId } = await createReadyDocumentWithVersion({
      workspaceId,
      name: 'retrieve-versions.txt',
      content: v1Text,
      storageKey: 'rv-v1',
    });

    // Cite v1 via a stored assistant message citation
    await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: 'Based on v1',
        citations: [
          {
            documentId: document.id,
            documentName: document.name,
            documentVersionId: v1.id,
            chunkId: v1ChunkId,
            position: 0,
            startOffset: 0,
            endOffset: v1Text.length,
          },
        ],
      },
    });

    // Promote v2 as current with different content + embedding
    const v2 = await prisma.documentVersion.create({
      data: {
        documentId: document.id,
        workspaceId,
        versionNumber: 2,
        status: 'ready',
        mimeType: 'text/plain',
        byteSize: v2Text.length,
        storageKey: 'rv-v2',
        contentHash: 'hash-rv-v2',
        extractedText: v2Text,
        embeddingModel: 'voyage-3.5',
        embeddingDimensions: 1024,
        changeReason: 'reprocess',
        processedAt: new Date(),
      },
    });
    const v2Chunk = await prisma.documentChunk.create({
      data: {
        documentId: document.id,
        documentVersionId: v2.id,
        workspaceId,
        position: 0,
        content: v2Text,
        startOffset: 0,
        endOffset: v2Text.length,
      },
    });
    const [emb] = await embedTexts([v2Text]);
    await prisma.$executeRawUnsafe(
      `UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2`,
      vectorLiteral(emb),
      v2Chunk.id,
    );
    await prisma.documentVersion.update({
      where: { id: v1.id },
      data: { supersededAt: new Date() },
    });
    await prisma.document.update({
      where: { id: document.id },
      data: {
        currentVersionId: v2.id,
        extractedText: v2Text,
        contentHash: 'hash-rv-v2',
        storageKey: 'rv-v2',
      },
    });

    // New chat retrieval should only hit v2
    const chat = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages/sync`,
      headers: originHeaders(),
      cookies,
      payload: { content: 'UniqueZebraVersionTwoRetrievalTarget please', documentIds: [document.id] },
    });
    expect(chat.statusCode).toBe(200);
    const citations = chat.json().message.citations as Array<{
      documentVersionId?: string;
      chunkId: string;
    }>;
    for (const c of citations) {
      if (c.chunkId === v1ChunkId || c.documentVersionId === v1.id) {
        throw new Error('stale version chunk should not be retrieved');
      }
    }
    if (citations.length > 0) {
      expect(citations.every((c) => c.documentVersionId === v2.id)).toBe(true);
    }

    // Historical citation still resolves via version detail API
    const historical = await app.inject({
      method: 'GET',
      url: `/documents/${document.id}?versionId=${v1.id}`,
      headers: originHeaders(),
      cookies,
    });
    expect(historical.statusCode).toBe(200);
    expect(historical.json().document.extractedText).toBe(v1Text);
    expect(historical.json().document.versionId).toBe(v1.id);

    // Old chunk row still present
    const stillThere = await prisma.documentChunk.findUnique({ where: { id: v1ChunkId! } });
    expect(stillThere?.content).toBe(v1Text);
  });

  it('dedupes identical re-upload by content hash without creating a second document', async () => {
    const bytes = Buffer.from('Identical file content for dedup test.');
    const contentHash = hashDocumentBytes(bytes);

    const first = await createReadyDocumentWithVersion({
      workspaceId,
      name: 'dedup-original.txt',
      content: bytes.toString(),
      storageKey: 'dedup-1',
    });
    await prisma.document.update({
      where: { id: first.document.id },
      data: { contentHash },
    });
    await prisma.documentVersion.update({
      where: { id: first.version.id },
      data: { contentHash },
    });

    // Direct service-level dedup path via upload endpoint would need multipart;
    // assert the hash lookup seam used by createDocumentFromBuffer.
    const { findDocumentByContentHash } = await import(
      '../src/modules/library/document-versions'
    );
    const found = await findDocumentByContentHash(workspaceId, contentHash);
    expect(found?.id).toBe(first.document.id);

    const countBefore = await prisma.document.count({ where: { workspaceId } });
    const { createDocumentFromBuffer } = await import('../src/modules/library/library-service');
    // Mock storage upload not needed when dedup hits
    const result = await createDocumentFromBuffer({
      workspaceId,
      userId: (await prisma.user.findFirstOrThrow({ where: { email } })).id,
      filename: 'dedup-copy.txt',
      mimeType: 'text/plain',
      buffer: bytes,
      source: 'local',
    });
    expect(result.deduplicated).toBe(true);
    expect(result.document.id).toBe(first.document.id);
    const countAfter = await prisma.document.count({ where: { workspaceId } });
    expect(countAfter).toBe(countBefore);
  });
});

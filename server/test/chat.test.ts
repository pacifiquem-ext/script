import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sha256 } from '../src/lib/crypto';
import { embedTexts, vectorLiteral } from '../src/modules/jobs/embeddings';
import { originHeaders } from './helpers';

const app = buildApp();
const email = `chat-${Date.now()}@example.com`;
const otherEmail = `chat-other-${Date.now()}@example.com`;
const cookies: Record<string, string> = {};
const otherCookies: Record<string, string> = {};

function absorb(
  jar: Record<string, string>,
  res: { headers: Record<string, unknown> },
) {
  const raw = res.headers['set-cookie'];
  if (!raw) return;
  for (const part of Array.isArray(raw) ? raw : [raw]) {
    const pair = String(part).split(';')[0] ?? '';
    const eq = pair.indexOf('=');
    if (eq > -1) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
}

async function signupAndVerify(address: string, jar: Record<string, string>) {
  await app.inject({
    method: 'POST',
    url: '/auth/signup',
    headers: originHeaders(),
    payload: { name: 'Chat User', email: address, password: 'password123' },
  });
  const otp = await prisma.emailOtp.findFirst({
    where: { email: address },
    orderBy: { createdAt: 'desc' },
  });
  await prisma.emailOtp.update({
    where: { id: otp!.id },
    data: { codeHash: sha256('123456'), attempts: 0, expiresAt: new Date(Date.now() + 60_000) },
  });
  absorb(
    jar,
    await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      headers: originHeaders(),
      cookies: jar,
      payload: { email: address, code: '123456', purpose: 'signup_verify' },
    }),
  );
}

describe('chat routes', () => {
  let conversationId = '';
  let workspaceId = '';
  let otherWorkspaceId = '';

  beforeAll(async () => {
    await app.ready();
    await signupAndVerify(email, cookies);
    await signupAndVerify(otherEmail, otherCookies);
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: originHeaders(),
      cookies,
    });
    workspaceId = me.json().user.lastWorkspaceId;
    const otherMe = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: originHeaders(),
      cookies: otherCookies,
    });
    otherWorkspaceId = otherMe.json().user.lastWorkspaceId;

    const created = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: originHeaders(),
      cookies,
      payload: { title: 'Test' },
    });
    conversationId = created.json().conversation.id;

    const doc = await prisma.document.create({
      data: {
        workspaceId,
        name: 'alpha.txt',
        mimeType: 'text/plain',
        byteSize: 20,
        storageKey: 'k-alpha',
        source: 'local',
        status: 'ready',
        extractedText: 'Alpha secret project plan details.',
        embeddingModel: 'voyage-3.5',
        embeddingDimensions: 1024,
        processedAt: new Date(),
      },
    });
    const [embedding] = await embedTexts(['Alpha secret project plan details.']);
    const chunk = await prisma.documentChunk.create({
      data: {
        documentId: doc.id,
        workspaceId,
        position: 0,
        content: 'Alpha secret project plan details.',
        startOffset: 0,
        endOffset: 33,
      },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2`,
      vectorLiteral(embedding),
      chunk.id,
    );

    const otherDoc = await prisma.document.create({
      data: {
        workspaceId: otherWorkspaceId,
        name: 'beta.txt',
        mimeType: 'text/plain',
        byteSize: 20,
        storageKey: 'k-beta',
        source: 'local',
        status: 'ready',
        extractedText: 'Beta confidential other workspace only.',
        embeddingModel: 'voyage-3.5',
        embeddingDimensions: 1024,
        processedAt: new Date(),
      },
    });
    const [otherEmbedding] = await embedTexts(['Beta confidential other workspace only.']);
    const otherChunk = await prisma.documentChunk.create({
      data: {
        documentId: otherDoc.id,
        workspaceId: otherWorkspaceId,
        position: 0,
        content: 'Beta confidential other workspace only.',
        startOffset: 0,
        endOffset: 40,
      },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2`,
      vectorLiteral(otherEmbedding),
      otherChunk.id,
    );
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  it('sync message returns assistant content with citations shape', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages/sync`,
      headers: originHeaders(),
      cookies,
      payload: { content: 'What is the alpha plan?', documentIds: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message.role).toBe('assistant');
    expect(String(res.json().message.content).length).toBeGreaterThan(0);
    expect(Array.isArray(res.json().message.citations)).toBe(true);
  });

  it('stream endpoint emits structured SSE events', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: originHeaders(),
      cookies,
      payload: { content: 'Stream please', documentIds: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"type":"user_message"');
    expect(res.body).toContain('"type":"done"');
  });

  it('lists conversations with server search', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/conversations?q=Test&page=1&pageSize=20',
      headers: originHeaders(),
      cookies,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().conversations.some((c: { title: string }) => c.title === 'Test')).toBe(true);
    expect(res.json().pagination.total).toBeGreaterThan(0);
  });

  it('does not retrieve chunks from another workspace', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages/sync`,
      headers: originHeaders(),
      cookies,
      payload: { content: 'Beta confidential other workspace only', documentIds: [] },
    });
    expect(res.statusCode).toBe(200);
    const citations = res.json().message.citations as Array<{ documentName: string; documentId: string }>;
    expect(citations.some((c) => c.documentName === 'beta.txt')).toBe(false);
    const foreignChunks = await prisma.documentChunk.count({
      where: { workspaceId: otherWorkspaceId, document: { name: 'beta.txt' } },
    });
    expect(foreignChunks).toBeGreaterThan(0);
    expect(citations).toHaveLength(0);
  });

  it('rejects mentions of non-ready documents', async () => {
    const pending = await prisma.document.create({
      data: {
        workspaceId,
        name: 'pending.txt',
        mimeType: 'text/plain',
        byteSize: 1,
        storageKey: 'k-pending',
        source: 'local',
        status: 'pending',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages/sync`,
      headers: originHeaders(),
      cookies,
      payload: { content: 'Use pending doc', documentIds: [pending.id] },
    });
    expect(res.statusCode).toBe(400);
  });
});

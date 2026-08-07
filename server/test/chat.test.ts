import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sha256 } from '../src/lib/crypto';
import { originHeaders } from './helpers';
import { setMemoryChunkEmbedding } from '../src/db/vector';
import { embedTexts } from '../src/modules/jobs/embeddings';
import { createReadyDocumentWithVersion } from './helpers-documents';

const app = buildApp();
const email = `chat-${Date.now()}@example.com`;
const otherEmail = `chat-other-${Date.now()}@example.com`;
const cookies: Record<string, string> = {};
const otherCookies: Record<string, string> = {};

function absorb(jar: Record<string, string>, res: { headers: Record<string, unknown> }) {
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

    await createReadyDocumentWithVersion({
      workspaceId,
      name: 'alpha.txt',
      content: 'Alpha secret project plan details.',
      storageKey: 'k-alpha',
    });
    await createReadyDocumentWithVersion({
      workspaceId: otherWorkspaceId,
      name: 'beta.txt',
      content: 'Beta confidential other workspace only.',
      storageKey: 'k-beta',
    });
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

  it('library inventory questions list documents with summaries (P0 agent tools)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages/sync`,
      headers: originHeaders(),
      cookies,
      payload: {
        content: 'Tell me about my whole library, just a file and one line of its summary.',
        documentIds: [],
      },
    });
    expect(res.statusCode).toBe(200);
    const content = String(res.json().message.content);
    expect(content).toMatch(/Library inventory/i);
    expect(content).toMatch(/alpha\.txt/i);
    expect(content).not.toMatch(/I don't have (visibility|access)/i);
    expect(content).not.toMatch(/Call the API endpoint/i);
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
    const citations = res.json().message.citations as Array<{
      documentName: string;
      documentId: string;
    }>;
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

  it('passive RAG citations include workflow memory when unscoped', async () => {
    const phrase =
      'Workflow unique phrase: rotate the staging API keys weekly for acme-onboarding.';
    const source = await prisma.memorySource.create({
      data: {
        workspaceId,
        type: 'workflow',
        title: 'Acme onboarding',
        externalKey: `wf-chat-${Date.now()}`,
      },
    });
    const chunk = await prisma.memoryChunk.create({
      data: {
        memorySourceId: source.id,
        workspaceId,
        sourceType: 'workflow',
        position: 0,
        content: phrase,
        startOffset: 0,
        endOffset: phrase.length,
      },
    });
    const [embedding] = await embedTexts([phrase]);
    await setMemoryChunkEmbedding(prisma, chunk.id, embedding);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages/sync`,
      headers: originHeaders(),
      cookies,
      payload: { content: phrase, documentIds: [] },
    });
    expect(res.statusCode).toBe(200);
    const citations = res.json().message.citations as Array<{
      sourceType?: string;
      workflowId?: string;
      documentName: string;
      chunkId: string;
    }>;
    expect(citations.some((c) => c.sourceType === 'workflow' && c.chunkId === chunk.id)).toBe(true);
    const hit = citations.find((c) => c.chunkId === chunk.id);
    expect(hit?.workflowId).toBe(source.externalKey);
    expect(hit?.documentName).toMatch(/onboarding/i);
  });
});

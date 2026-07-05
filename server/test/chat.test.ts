import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sha256 } from '../src/lib/crypto';

const app = buildApp();
const email = `chat-${Date.now()}@example.com`;
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

describe('chat routes', () => {
  let conversationId = '';

  beforeAll(async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: { origin: 'http://localhost:5173' },
      payload: { name: 'Chat User', email, password: 'password123' },
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
        headers: { origin: 'http://localhost:5173' },
        payload: { email, code: '123456', purpose: 'signup_verify' },
      }),
    );
    const created = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { origin: 'http://localhost:5173' },
      cookies,
      payload: { title: 'Test' },
    });
    conversationId = created.json().conversation.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('sync message returns assistant content', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages/sync`,
      headers: { origin: 'http://localhost:5173' },
      cookies,
      payload: { content: 'Hello', documentIds: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message.role).toBe('assistant');
    expect(String(res.json().message.content).length).toBeGreaterThan(0);
  });

  it('stream endpoint emits SSE chunks', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { origin: 'http://localhost:5173' },
      cookies,
      payload: { content: 'Stream please', documentIds: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('data: ');
    expect(res.body).toContain('"type":"done"');
  });
});

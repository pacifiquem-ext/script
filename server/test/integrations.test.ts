import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sha256 } from '../src/lib/crypto';
import { createOAuthState, parseOAuthState } from '../src/modules/integrations/oauth-state';
import { originHeaders } from './helpers';

const app = buildApp();
const email = `int-${Date.now()}@example.com`;
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

describe('integrations routes', () => {
  beforeAll(async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: originHeaders(),
      payload: { name: 'Int User', email, password: 'password123' },
    });
    const otp = await prisma.emailOtp.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.emailOtp.update({
      where: { id: otp!.id },
      data: { codeHash: sha256('123456'), attempts: 0, expiresAt: new Date(Date.now() + 60_000) },
    });
    const verified = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      headers: originHeaders(),
      payload: { email, code: '123456', purpose: 'signup_verify' },
    });
    absorb(verified);
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('lists providers with configured=false when OAuth env empty', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/integrations',
      headers: originHeaders(),
      cookies,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      providers: Array<{ provider: string; configured: boolean; connected: boolean }>;
    };
    expect(body.providers).toHaveLength(4);
    expect(body.providers.every((p) => p.connected === false)).toBe(true);
  });

  it('rejects connect when provider OAuth is not configured', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/integrations/drive/connect',
      headers: originHeaders(),
      cookies,
    });
    expect([400, 503]).toContain(res.statusCode);
  });

  it('rejects list files without a connection', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/integrations/dropbox/files',
      headers: originHeaders(),
      cookies,
    });
    expect([404, 400, 503]).toContain(res.statusCode);
  });
});

describe('oauth state', () => {
  it('signs and verifies state payloads', () => {
    const state = createOAuthState({
      provider: 'drive',
      workspaceId: 'ws_1',
      userId: 'user_1',
    });
    const parsed = parseOAuthState(state);
    expect(parsed.provider).toBe('drive');
    expect(parsed.workspaceId).toBe('ws_1');
    expect(parsed.userId).toBe('user_1');

    const [body] = state.split('.');
    const bad = `${body}.aaaaaaaa`;
    expect(() => parseOAuthState(bad)).toThrow();
  });
});

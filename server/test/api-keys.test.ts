import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sha256 } from '../src/lib/crypto';

const app = buildApp();
const email = `keys-${Date.now()}@example.com`;
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

describe('api keys', () => {
  let secret = '';
  let apiKeyId = '';

  beforeAll(async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: { origin: 'http://localhost:5173' },
      payload: { name: 'Key User', email, password: 'password123' },
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
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('creates lists and authenticates with API key', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api-keys',
      headers: { origin: 'http://localhost:5173' },
      cookies,
      payload: { name: 'CI key' },
    });
    expect(created.statusCode).toBe(200);
    secret = created.json().secret;
    apiKeyId = created.json().apiKey.id;

    const listed = await app.inject({
      method: 'GET',
      url: '/api-keys',
      headers: { origin: 'http://localhost:5173' },
      cookies,
    });
    expect(listed.json().apiKeys.some((k: { id: string }) => k.id === apiKeyId)).toBe(true);

    const viaKey = await app.inject({
      method: 'GET',
      url: '/credits',
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(viaKey.statusCode).toBe(200);
    expect(viaKey.json().balance).toBeGreaterThanOrEqual(0);

    const audit = await app.inject({
      method: 'GET',
      url: `/api-keys/${apiKeyId}/audit`,
      headers: { origin: 'http://localhost:5173' },
      cookies,
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().events.length).toBeGreaterThan(0);

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api-keys/${apiKeyId}`,
      headers: { origin: 'http://localhost:5173' },
      cookies,
    });
    expect(revoked.statusCode).toBe(200);
    const denied = await app.inject({
      method: 'GET',
      url: '/credits',
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(denied.statusCode).toBe(401);
  });
});

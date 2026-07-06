import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sha256 } from '../src/lib/crypto';
import { originHeaders } from './helpers';

const app = buildApp();
const email = `lib-${Date.now()}@example.com`;
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

describe('library routes', () => {
  beforeAll(async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: originHeaders(),
      payload: { name: 'Lib User', email, password: 'password123' },
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

  it('creates and lists folders', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/folders',
      headers: originHeaders(),
      cookies,
      payload: { name: 'Contracts' },
    });
    expect(created.statusCode).toBe(200);
    const listed = await app.inject({
      method: 'GET',
      url: '/folders',
      headers: originHeaders(),
      cookies,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().folders.some((f: { name: string }) => f.name === 'Contracts')).toBe(true);
  });

  it('returns credits balance', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/credits',
      headers: originHeaders(),
      cookies,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().balance).toBeGreaterThan(0);
  });
});

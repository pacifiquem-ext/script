import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';
import { buildApp } from '../src/app';
import { sha256 } from '../src/lib/crypto';

const app = buildApp();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `user-${suffix}@example.com`;
const password = 'password123';
const cookieJar: Record<string, string> = {};

function absorbSetCookie(response: { headers: Record<string, unknown> }) {
  const raw = response.headers['set-cookie'];
  if (!raw) return;
  const parts = Array.isArray(raw) ? raw : [raw];
  for (const part of parts) {
    const pair = String(part).split(';')[0] ?? '';
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (value === '' || String(part).toLowerCase().includes('expires=thu, 01 jan 1970')) {
      delete cookieJar[key];
    } else {
      cookieJar[key] = value;
    }
  }
}

function originHeaders() {
  return { origin: 'http://localhost:5173' };
}

describe('auth routes', () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('signs up and requires verification', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: originHeaders(),
      payload: { name: 'Test User', email, password },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ requiresVerification: true, email });
  });

  it('rejects duplicate signup', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: originHeaders(),
      payload: { name: 'Test User', email, password },
    });
    expect(response.statusCode).toBe(409);
  });

  it('rejects invalid login credentials generically', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: originHeaders(),
      payload: { email, password: 'wrong-password' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.message).toBe('Invalid email or password');
  });

  it('verifies OTP from database and sets session cookies', async () => {
    const otp = await prisma.emailOtp.findFirst({
      where: { email, purpose: 'signup_verify', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(otp).toBeTruthy();
    const code = '123456';
    await prisma.emailOtp.update({
      where: { id: otp!.id },
      data: { codeHash: sha256(code), attempts: 0, expiresAt: new Date(Date.now() + 60_000) },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      headers: originHeaders(),
      payload: { email, code, purpose: 'signup_verify' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe(email);
    absorbSetCookie(response);
    expect(cookieJar.script_access).toBeTruthy();
    expect(cookieJar.script_refresh).toBeTruthy();
  });

  it('returns current user on /auth/me', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: originHeaders(),
      cookies: cookieJar,
    });
    absorbSetCookie(response);
    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe(email);
  });

  it('lists workspaces for the session user', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/workspaces',
      headers: originHeaders(),
      cookies: cookieJar,
    });
    absorbSetCookie(response);
    expect(response.statusCode).toBe(200);
    expect(response.json().workspaces.length).toBeGreaterThan(0);
    expect(response.json().workspaces[0].role).toBe('owner');
  });

  it('enforces workspace isolation on current workspace routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/workspaces/current',
      headers: {
        ...originHeaders(),
        'x-workspace-id': 'nonexistent-workspace-id',
      },
      cookies: cookieJar,
    });
    expect(response.statusCode).toBe(403);
  });

  it('logs out and revokes session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: originHeaders(),
      cookies: cookieJar,
    });
    expect(response.statusCode).toBe(200);
    absorbSetCookie(response);

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: originHeaders(),
      cookies: cookieJar,
    });
    expect(me.statusCode).toBe(401);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sha256 } from '../src/lib/crypto';
import { hashPassword } from '../src/lib/password';

const app = buildApp();

function absorb(res: { headers: Record<string, unknown> }, jar: Record<string, string>) {
  const raw = res.headers['set-cookie'];
  if (!raw) return;
  for (const part of Array.isArray(raw) ? raw : [raw]) {
    const pair = String(part).split(';')[0] ?? '';
    const eq = pair.indexOf('=');
    if (eq > -1) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
}

async function signupSession(email: string, password: string) {
  const cookies: Record<string, string> = {};
  await app.inject({
    method: 'POST',
    url: '/auth/signup',
    headers: { origin: 'http://localhost:5173' },
    payload: { name: 'Privacy User', email, password },
  });
  const otp = await prisma.emailOtp.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } });
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
    cookies,
  );
  return cookies;
}

describe('privacy routes', () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exports account JSON for the session user', async () => {
    const email = `export-${Date.now()}@example.com`;
    const cookies = await signupSession(email, 'password123');
    const res = await app.inject({
      method: 'GET',
      url: '/me/export',
      headers: { origin: 'http://localhost:5173' },
      cookies,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    const body = res.json();
    expect(body.user.email).toBe(email);
    expect(Array.isArray(body.workspaces)).toBe(true);
    expect(body.workspaces[0].documents).toBeDefined();
    await prisma.user.deleteMany({ where: { email } });
  }, 60_000);

  it('rejects delete with mismatched email and deletes sole-owned account', async () => {
    const email = `delete-${Date.now()}@example.com`;
    const password = 'password123';
    const cookies = await signupSession(email, password);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const workspaceId = user.lastWorkspaceId!;

    const bad = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: { origin: 'http://localhost:5173' },
      cookies,
      payload: { email: 'other@example.com', password },
    });
    expect(bad.statusCode).toBe(400);

    const wrongPassword = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: { origin: 'http://localhost:5173' },
      cookies,
      payload: { email, password: 'nope-nope' },
    });
    expect(wrongPassword.statusCode).toBe(401);

    const ok = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: { origin: 'http://localhost:5173' },
      cookies,
      payload: { email, password },
    });
    expect(ok.statusCode).toBe(200);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    expect(await prisma.workspace.findUnique({ where: { id: workspaceId } })).toBeNull();
  }, 60_000);

  it('transfers ownership instead of deleting shared workspaces', async () => {
    const ownerEmail = `owner-${Date.now()}@example.com`;
    const memberEmail = `member-${Date.now()}@example.com`;
    const password = 'password123';
    const ownerCookies = await signupSession(ownerEmail, password);
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });
    const workspaceId = owner.lastWorkspaceId!;

    const memberHash = await hashPassword(password);
    const member = await prisma.user.create({
      data: {
        email: memberEmail,
        name: 'Member',
        passwordHash: memberHash,
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId, userId: member.id, role: 'member' },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: { origin: 'http://localhost:5173' },
      cookies: ownerCookies,
      payload: { email: ownerEmail, password },
    });
    expect(res.statusCode).toBe(200);
    expect(await prisma.user.findUnique({ where: { email: ownerEmail } })).toBeNull();
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    expect(workspace).not.toBeNull();
    const successor = await prisma.workspaceMember.findFirst({ where: { workspaceId } });
    expect(successor?.userId).toBe(member.id);
    expect(successor?.role).toBe('owner');
    await prisma.user.delete({ where: { id: member.id } });
  }, 60_000);
});

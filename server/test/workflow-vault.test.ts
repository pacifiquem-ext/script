import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sha256 } from '../src/lib/crypto';
import { originHeaders } from './helpers';

const app = buildApp();
const email = `wf-vault-${Date.now()}@example.com`;
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

const STORAGE_STATE = {
  cookies: [
    {
      name: 'session',
      value: 'super-secret-cookie-value',
      domain: '.example.com',
      path: '/',
    },
  ],
  origins: [],
};

describe('browser session vault (P5.8b)', () => {
  let sessionId = '';
  let workflowId = '';
  let runId = '';

  beforeAll(async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: originHeaders(),
      payload: { name: 'Vault User', email, password: 'password123' },
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

    const created = await app.inject({
      method: 'POST',
      url: '/workflows',
      headers: originHeaders(),
      cookies,
      payload: {
        markdown: `# Vault smoke\n\n## Steps\n- [ ] Go to example.com\n`,
      },
    });
    workflowId = created.json().id;
    await prisma.workflowVersion.updateMany({
      where: { workflowId },
      data: { verifiedAt: new Date(), verifiedRunId: 'vault-verify' },
    });
    await app.inject({
      method: 'POST',
      url: `/workflows/${workflowId}/publish`,
      headers: originHeaders(),
      cookies,
    });
    const started = await app.inject({
      method: 'POST',
      url: `/workflows/${workflowId}/runs`,
      headers: originHeaders(),
      cookies,
    });
    runId = started.json().id;
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('rejects invalid storageState JSON shape with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows/browser-sessions',
      headers: originHeaders(),
      cookies,
      payload: { name: 'bad', storageState: { foo: 1 } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('stores encrypted storageState and never returns plaintext cookies', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/workflows/browser-sessions',
      headers: originHeaders(),
      cookies,
      payload: { name: 'Example login', storageState: STORAGE_STATE },
    });
    expect(created.statusCode).toBe(200);
    sessionId = created.json().id;
    expect(created.json().name).toBe('Example login');
    expect(JSON.stringify(created.json())).not.toContain('super-secret-cookie-value');

    const listed = await app.inject({
      method: 'GET',
      url: '/workflows/browser-sessions',
      headers: originHeaders(),
      cookies,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().sessions.some((s: { id: string }) => s.id === sessionId)).toBe(true);
    expect(JSON.stringify(listed.json())).not.toContain('super-secret-cookie-value');
    expect(listed.json().sessions[0].encryptedStorageState).toBeUndefined();

    const row = await prisma.browserSessionVault.findUniqueOrThrow({ where: { id: sessionId } });
    expect(row.encryptedStorageState).not.toContain('super-secret-cookie-value');
    expect(row.encryptedStorageState).toMatch(/:/);
  });

  it('execute without vault still works', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/workflows/runs/${runId}/execute`,
      headers: originHeaders(),
      cookies,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'] ?? '')).toMatch(/text\/event-stream/);
    expect(res.body).toMatch(/done|step_completed|status/);
  }, 90_000);

  it('deletes a vault session', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/workflows/browser-sessions/${sessionId}`,
      headers: originHeaders(),
      cookies,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const gone = await prisma.browserSessionVault.findUnique({ where: { id: sessionId } });
    expect(gone).toBeNull();
  });
});

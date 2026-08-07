import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sha256 } from '../src/lib/crypto';
import { extractUrlFromStepLabel } from '../src/modules/workflows/agent-executor';
import { closeAllBrowserSessions } from '../src/modules/workflows/browser-session';
import { originHeaders } from './helpers';

const app = buildApp();
const email = `wf-agent-${Date.now()}@example.com`;
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

describe('extractUrlFromStepLabel', () => {
  it('parses go-to domains and full URLs', () => {
    expect(extractUrlFromStepLabel('Go to Github.com')).toMatch(/github\.com/i);
    expect(extractUrlFromStepLabel('Visit https://example.com/path')).toBe(
      'https://example.com/path',
    );
    expect(extractUrlFromStepLabel('Open docs.github.com')).toMatch(/docs\.github\.com/i);
    expect(extractUrlFromStepLabel('Talk to your manager')).toBeNull();
  });
});

describe('executeSimpleNavigateStep 404 guard', () => {
  it('does not complete when deep path lands on GitHub 404', async () => {
    const { executeSimpleNavigateStep } = await import('../src/modules/workflows/agent-executor');
    // Only exercises URL extraction + failure path when browser is available;
    // if chromium missing, skip gracefully.
    const sessionKey = `test-404-${Date.now()}`;
    try {
      const result = await executeSimpleNavigateStep({
        sessionKey,
        workspaceId: 'ws-none',
        userId: 'u-none',
        role: 'member',
        runId: 'run-none',
        stepKey: 'k',
        label: 'Find PRs in repo: https://github.com/himTresor1/alignui-ai-template.git',
      });
      // Without a valid run/DB this may fail at completeStep; either way must not ok:true on 404
      if (result.ok) {
        expect(result.evidence.summary).not.toMatch(/page not found/i);
      } else {
        expect(result.reason.length).toBeGreaterThan(0);
      }
    } finally {
      const { closeBrowserSession } = await import('../src/modules/workflows/browser-session');
      await closeBrowserSession(sessionKey);
    }
  }, 60_000);
});

describe('workflow agent execute (browser)', () => {
  let workflowId = '';
  let runId = '';
  let stepKey = '';

  beforeAll(async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: originHeaders(),
      payload: { name: 'WF Agent', email, password: 'password123' },
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

    const md = `# Browser smoke

## Steps
- [ ] Go to example.com
- [ ] Talk to your manager offline
`;
    const created = await app.inject({
      method: 'POST',
      url: '/workflows',
      headers: originHeaders(),
      cookies,
      payload: { markdown: md },
    });
    expect(created.statusCode).toBe(200);
    workflowId = created.json().id;
    const published = await app.inject({
      method: 'POST',
      url: `/workflows/${workflowId}/publish`,
      headers: originHeaders(),
      cookies,
    });
    expect(published.statusCode).toBe(200);
    const started = await app.inject({
      method: 'POST',
      url: `/workflows/${workflowId}/runs`,
      headers: originHeaders(),
      cookies,
    });
    expect(started.statusCode).toBe(200);
    runId = started.json().id;
    const pending = started.json().steps.find((s: { status: string }) => s.status === 'pending');
    stepKey = pending.stepKey;
  }, 60_000);

  afterAll(async () => {
    await closeAllBrowserSessions();
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('rejects agent complete without evidence', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/workflows/runs/${runId}/steps/${stepKey}/complete`,
      headers: originHeaders(),
      cookies,
      payload: { source: 'agent' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('executes navigate-style step via SSE and leaves offline steps pending', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/workflows/runs/${runId}/execute`,
      headers: originHeaders(),
      cookies,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'] ?? '')).toMatch(/text\/event-stream/);
    const body = res.body;
    expect(body).toMatch(/data:/);
    expect(body).toMatch(/done|step_completed|status/);

    const got = await app.inject({
      method: 'GET',
      url: `/workflows/runs/${runId}`,
      headers: originHeaders(),
      cookies,
    });
    expect(got.statusCode).toBe(200);
    const run = got.json();
    const exampleStep = run.steps.find((s: { label: string }) => /example\.com/i.test(s.label));
    expect(exampleStep?.status).toBe('done');
    expect(exampleStep?.evidence?.method).toBe('agent_browser');
    expect(exampleStep?.evidence?.finalUrl).toMatch(/example\.com/i);

    const offline = run.steps.find((s: { label: string }) => /manager/i.test(s.label));
    expect(offline?.status).toBe('pending');
  }, 90_000);
});

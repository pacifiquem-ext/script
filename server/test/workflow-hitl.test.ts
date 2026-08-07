import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sha256 } from '../src/lib/crypto';
import { toRequestContext } from '../src/mastra/request-context';
import { completeWorkflowStepTool } from '../src/mastra/tools/workflows';
import { originHeaders } from './helpers';

const app = buildApp();
const email = `wf-hitl-${Date.now()}@example.com`;
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

const MD = `# HITL onboarding

## Steps
- [ ] Create a Slack account
- [ ] Talk to your manager
`;

describe('workflow HITL confirmToken (P5.6b / M.6)', () => {
  let workspaceId = '';
  let userId = '';
  let runId = '';
  let stepKey = '';

  beforeAll(async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: originHeaders(),
      payload: { name: 'HITL User', email, password: 'password123' },
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
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: originHeaders(),
      cookies,
    });
    workspaceId = me.json().user.lastWorkspaceId;
    userId = me.json().user.id;

    const created = await app.inject({
      method: 'POST',
      url: '/workflows',
      headers: originHeaders(),
      cookies,
      payload: { markdown: MD },
    });
    expect(created.statusCode).toBe(200);
    const workflowId = created.json().id as string;
    await prisma.workflowVersion.updateMany({
      where: { workflowId },
      data: { verifiedAt: new Date(), verifiedRunId: 'hitl-verify' },
    });
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
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('chat-path tool without token returns needsConfirmation and does not complete', async () => {
    const rc = toRequestContext({ workspaceId, userId, skipHitl: false });
    const out = await completeWorkflowStepTool.execute!(
      {
        runId,
        stepKey,
        evidence: { method: 'agent_tool', summary: 'Created Slack account in browser' },
      },
      { requestContext: rc },
    );
    expect(out).toMatchObject({
      ok: true,
      needsConfirmation: true,
      runId,
      stepKey,
    });
    expect((out as { confirmToken?: string }).confirmToken).toBeUndefined();
    expect(typeof (out as { confirmationId?: string }).confirmationId).toBe('string');
    expect((out as { confirmationId: string }).confirmationId.length).toBeGreaterThan(8);

    const run = await prisma.workflowRun.findUniqueOrThrow({
      where: { id: runId },
      include: { steps: true },
    });
    const step = run.steps.find((s) => s.stepKey === stepKey);
    expect(step?.status).toBe('pending');
  });

  it('confirm endpoint completes; replay token fails', async () => {
    const rc = toRequestContext({ workspaceId, userId });
    const out = (await completeWorkflowStepTool.execute!(
      {
        runId,
        stepKey,
        evidence: { method: 'agent_browser', summary: 'Landed on slack.com signup' },
      },
      { requestContext: rc },
    )) as { confirmationId: string; needsConfirmation?: boolean; confirmToken?: string };
    expect(out.needsConfirmation).toBe(true);
    expect(out.confirmToken).toBeUndefined();
    const confirmationId = out.confirmationId;

    const confirmed = await app.inject({
      method: 'POST',
      url: `/workflows/write-confirmations/${confirmationId}/confirm`,
      headers: originHeaders(),
      cookies,
    });
    expect(confirmed.statusCode).toBe(200);
    const doneStep = confirmed.json().steps.find((s: { stepKey: string }) => s.stepKey === stepKey);
    expect(doneStep?.status).toBe('done');
    expect(doneStep?.evidence?.summary).toMatch(/slack/i);

    const replay = await app.inject({
      method: 'POST',
      url: `/workflows/write-confirmations/${confirmationId}/confirm`,
      headers: originHeaders(),
      cookies,
    });
    expect(replay.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('reject marks token used without completing remaining steps', async () => {
    const remaining = await prisma.workflowStepState.findFirst({
      where: { runId, status: 'pending' },
    });
    expect(remaining).toBeTruthy();
    const rc = toRequestContext({ workspaceId, userId });
    const out = (await completeWorkflowStepTool.execute!(
      {
        runId,
        stepKey: remaining!.stepKey,
        evidence: { method: 'manual', summary: 'Would mark offline step' },
      },
      { requestContext: rc },
    )) as { confirmationId: string };

    const rejected = await app.inject({
      method: 'POST',
      url: `/workflows/write-confirmations/${out.confirmationId}/reject`,
      headers: originHeaders(),
      cookies,
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json()).toEqual({ ok: true });

    const still = await prisma.workflowStepState.findUniqueOrThrow({
      where: { id: remaining!.id },
    });
    expect(still.status).toBe('pending');

    const replay = await app.inject({
      method: 'POST',
      url: `/workflows/write-confirmations/${out.confirmationId}/reject`,
      headers: originHeaders(),
      cookies,
    });
    expect(replay.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('skipHitl completes immediately without a confirmation row', async () => {
    const remaining = await prisma.workflowStepState.findFirst({
      where: { runId, status: 'pending' },
    });
    if (!remaining) return;
    const before = await prisma.agentWriteConfirmation.count({
      where: { workspaceId, userId },
    });
    const rc = toRequestContext({ workspaceId, userId, skipHitl: true });
    const out = await completeWorkflowStepTool.execute!(
      {
        runId,
        stepKey: remaining.stepKey,
        evidence: { method: 'agent_browser', summary: 'Executor path skip HITL' },
      },
      { requestContext: rc },
    );
    expect(out).toMatchObject({ ok: true, runId });
    expect((out as { needsConfirmation?: boolean }).needsConfirmation).toBeFalsy();
    const after = await prisma.agentWriteConfirmation.count({
      where: { workspaceId, userId },
    });
    expect(after).toBe(before);
    const step = await prisma.workflowStepState.findUniqueOrThrow({
      where: { id: remaining.id },
    });
    expect(step.status).toBe('done');
  });
});

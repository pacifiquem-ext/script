import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sha256 } from '../src/lib/crypto';
import { originHeaders } from './helpers';

const app = buildApp();
const email = `wf-${Date.now()}@example.com`;
const cookies: Record<string, string> = {};

const SAMPLE_MD = `# Employee Onboarding

## Week 1
- [ ] Create accounts
- [ ] Read security policy
- [x] Accept invite email
`;

function absorb(res: { headers: Record<string, unknown> }) {
  const raw = res.headers['set-cookie'];
  if (!raw) return;
  for (const part of Array.isArray(raw) ? raw : [raw]) {
    const pair = String(part).split(';')[0] ?? '';
    const eq = pair.indexOf('=');
    if (eq > -1) cookies[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
}

beforeAll(async () => {
  await app.ready();
}, 30_000);

afterAll(async () => {
  await app.close();
});

describe('workflows API (C7)', () => {
  let workflowId = '';
  let runId = '';
  let stepKey = '';

  beforeAll(async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: originHeaders(),
      payload: { name: 'WF User', email, password: 'password123' },
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
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
  });

  it('creates a draft workflow', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/workflows',
      headers: originHeaders(),
      cookies,
      payload: { markdown: SAMPLE_MD },
    });
    expect(created.statusCode).toBe(200);
    const body = created.json();
    expect(body.status).toBe('draft');
    expect(body.name).toMatch(/Onboarding/i);
    expect(body.version?.steps?.length).toBe(3);
    workflowId = body.id;
  });

  it('lists draft for admin and updates markdown in place', async () => {
    const listed = await app.inject({
      method: 'GET',
      url: '/workflows',
      headers: originHeaders(),
      cookies,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().workflows.some((w: { id: string }) => w.id === workflowId)).toBe(true);

    const updated = await app.inject({
      method: 'PUT',
      url: `/workflows/${workflowId}`,
      headers: originHeaders(),
      cookies,
      payload: {
        markdown: SAMPLE_MD.replace('Create accounts', 'Create email accounts'),
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version?.steps?.some((s: { label: string }) => s.label.includes('email'))).toBe(
      true,
    );
    expect(updated.json().version?.versionNumber).toBe(1);
  });

  it('publishes and starts a run with step states', async () => {
    // Publish requires agent verification of current version.
    await prisma.workflowVersion.updateMany({
      where: { workflowId },
      data: { verifiedAt: new Date(), verifiedRunId: 'test-verify-run' },
    });
    const published = await app.inject({
      method: 'POST',
      url: `/workflows/${workflowId}/publish`,
      headers: originHeaders(),
      cookies,
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().status).toBe('published');

    const started = await app.inject({
      method: 'POST',
      url: `/workflows/${workflowId}/runs`,
      headers: originHeaders(),
      cookies,
    });
    expect(started.statusCode).toBe(200);
    const run = started.json();
    runId = run.id;
    expect(run.status).toBe('in_progress');
    expect(run.agentStatus).toBe('idle');
    expect(Array.isArray(run.executionLog)).toBe(true);
    expect(run.steps.length).toBe(3);
    const preDone = run.steps.find((s: { label: string }) => s.label.includes('Accept'));
    expect(preDone?.status).toBe('done');
    const pending = run.steps.find((s: { status: string }) => s.status === 'pending');
    expect(pending).toBeTruthy();
    stepKey = pending.stepKey;
  });

  it('completes a step and lists my runs', async () => {
    const done = await app.inject({
      method: 'POST',
      url: `/workflows/runs/${runId}/steps/${stepKey}/complete`,
      headers: originHeaders(),
      cookies,
      payload: { source: 'ui' },
    });
    expect(done.statusCode).toBe(200);
    const step = done.json().steps.find((s: { stepKey: string }) => s.stepKey === stepKey);
    expect(step?.status).toBe('done');

    const mine = await app.inject({
      method: 'GET',
      url: '/workflows/runs/mine',
      headers: originHeaders(),
      cookies,
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().runs.some((r: { id: string }) => r.id === runId)).toBe(true);

    const got = await app.inject({
      method: 'GET',
      url: `/workflows/runs/${runId}`,
      headers: originHeaders(),
      cookies,
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().progress.done).toBeGreaterThanOrEqual(2);
  });

  it('appends a new version when editing a published workflow', async () => {
    const updated = await app.inject({
      method: 'PUT',
      url: `/workflows/${workflowId}`,
      headers: originHeaders(),
      cookies,
      payload: {
        markdown: `# Employee Onboarding\n\n## Week 1\n- [ ] Create email accounts\n- [ ] Read security policy\n- [ ] Join Slack\n`,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version?.versionNumber).toBe(2);
    expect(updated.json().status).toBe('published');
  });

  it('run payload includes pinned markdown for runner guidance', async () => {
    const got = await app.inject({
      method: 'GET',
      url: `/workflows/runs/${runId}`,
      headers: originHeaders(),
      cookies,
    });
    expect(got.statusCode).toBe(200);
    const body = got.json();
    expect(typeof body.markdown).toBe('string');
    expect(body.markdown.length).toBeGreaterThan(10);
    expect(body.versionNumber).toBeGreaterThanOrEqual(1);
  });

  it('rejects publish with no checklist steps', async () => {
    const empty = await app.inject({
      method: 'POST',
      url: '/workflows',
      headers: originHeaders(),
      cookies,
      payload: { markdown: '# Empty\n\nJust prose, no steps.\n' },
    });
    expect(empty.statusCode).toBe(200);
    const id = empty.json().id as string;
    const pub = await app.inject({
      method: 'POST',
      url: `/workflows/${id}/publish`,
      headers: originHeaders(),
      cookies,
    });
    expect(pub.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('rejects publish without agent verification', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/workflows',
      headers: originHeaders(),
      cookies,
      payload: {
        markdown: `# Verify gate\n\n## Steps\n- [ ] Go to example.com\n`,
      },
    });
    expect(created.statusCode).toBe(200);
    const id = created.json().id as string;
    expect(created.json().canPublish).toBe(false);
    const pub = await app.inject({
      method: 'POST',
      url: `/workflows/${id}/publish`,
      headers: originHeaders(),
      cookies,
    });
    expect(pub.statusCode).toBeGreaterThanOrEqual(400);
    expect(String(pub.json()?.message ?? pub.json()?.error?.message ?? '')).toMatch(
      /verif/i,
    );
  });
});

describe('workflows API authz (C7)', () => {
  const adminEmail = `wf-admin-${Date.now()}@example.com`;
  const memberEmail = `wf-member-${Date.now()}@example.com`;
  const adminCookies: Record<string, string> = {};
  const memberCookies: Record<string, string> = {};
  let workspaceId = '';
  let draftId = '';
  let publishedId = '';
  let adminRunId = '';
  let adminStepKey = '';

  function absorbJar(res: { headers: Record<string, unknown> }, jar: Record<string, string>) {
    const raw = res.headers['set-cookie'];
    if (!raw) return;
    for (const part of Array.isArray(raw) ? raw : [raw]) {
      const pair = String(part).split(';')[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq > -1) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }

  async function signupSession(targetEmail: string, jar: Record<string, string>) {
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: originHeaders(),
      payload: { name: 'User', email: targetEmail, password: 'password123' },
    });
    const otp = await prisma.emailOtp.findFirst({
      where: { email: targetEmail },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.emailOtp.update({
      where: { id: otp!.id },
      data: { codeHash: sha256('123456'), attempts: 0, expiresAt: new Date(Date.now() + 60_000) },
    });
    absorbJar(
      await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        headers: originHeaders(),
        payload: { email: targetEmail, code: '123456', purpose: 'signup_verify' },
      }),
      jar,
    );
  }

  function wsHeaders() {
    return { ...originHeaders(), 'x-workspace-id': workspaceId };
  }

  beforeAll(async () => {
    await signupSession(adminEmail, adminCookies);
    await signupSession(memberEmail, memberCookies);

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
    const member = await prisma.user.findUniqueOrThrow({ where: { email: memberEmail } });
    const adminMembership = await prisma.workspaceMember.findFirstOrThrow({
      where: { userId: admin.id },
    });
    workspaceId = adminMembership.workspaceId;

    await prisma.workspaceMember.deleteMany({ where: { userId: member.id } });
    await prisma.workspaceMember.create({
      data: {
        userId: member.id,
        workspaceId,
        role: 'member',
      },
    });
    await prisma.user.update({
      where: { id: member.id },
      data: { lastWorkspaceId: workspaceId },
    });

    const draft = await app.inject({
      method: 'POST',
      url: '/workflows',
      headers: wsHeaders(),
      cookies: adminCookies,
      payload: { markdown: `# Draft Only\n\n- [ ] Hidden step\n` },
    });
    expect(draft.statusCode).toBe(200);
    draftId = draft.json().id;

    const published = await app.inject({
      method: 'POST',
      url: '/workflows',
      headers: wsHeaders(),
      cookies: adminCookies,
      payload: { markdown: `# Shared\n\n- [ ] Public step\n` },
    });
    expect(published.statusCode).toBe(200);
    publishedId = published.json().id;
    await prisma.workflowVersion.updateMany({
      where: { workflowId: publishedId },
      data: { verifiedAt: new Date(), verifiedRunId: 'test-authz-verify' },
    });
    const pub = await app.inject({
      method: 'POST',
      url: `/workflows/${publishedId}/publish`,
      headers: wsHeaders(),
      cookies: adminCookies,
    });
    expect(pub.statusCode).toBe(200);

    const started = await app.inject({
      method: 'POST',
      url: `/workflows/${publishedId}/runs`,
      headers: wsHeaders(),
      cookies: adminCookies,
    });
    expect(started.statusCode).toBe(200);
    adminRunId = started.json().id;
    adminStepKey = started.json().steps.find((s: { status: string }) => s.status === 'pending')
      ?.stepKey;
    expect(adminStepKey).toBeTruthy();
  }, 120_000);

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, memberEmail] } },
    });
  });

  it('member list omits drafts and cannot read draft by id', async () => {
    const list2 = await app.inject({
      method: 'GET',
      url: '/workflows',
      headers: wsHeaders(),
      cookies: memberCookies,
    });
    expect(list2.statusCode).toBe(200);
    const ids = (list2.json().workflows as { id: string; status: string }[]).map((w) => w.id);
    expect(ids).not.toContain(draftId);
    expect(ids).toContain(publishedId);

    const getDraft = await app.inject({
      method: 'GET',
      url: `/workflows/${draftId}`,
      headers: wsHeaders(),
      cookies: memberCookies,
    });
    expect(getDraft.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('member cannot create or publish workflows', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/workflows',
      headers: wsHeaders(),
      cookies: memberCookies,
      payload: { markdown: `# Nope\n- [ ] x\n` },
    });
    expect(create.statusCode).toBeGreaterThanOrEqual(400);

    const pub = await app.inject({
      method: 'POST',
      url: `/workflows/${draftId}/publish`,
      headers: wsHeaders(),
      cookies: memberCookies,
    });
    expect(pub.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('member cannot complete another user run', async () => {
    const complete = await app.inject({
      method: 'POST',
      url: `/workflows/runs/${adminRunId}/steps/${encodeURIComponent(adminStepKey)}/complete`,
      headers: wsHeaders(),
      cookies: memberCookies,
      payload: { source: 'ui' },
    });
    expect(complete.statusCode).toBeGreaterThanOrEqual(400);
  });
});

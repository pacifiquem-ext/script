import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { env } from '../src/config/env';
import { prisma } from '../src/db/prisma';
import { sha256 } from '../src/lib/crypto';
import { encryptSecret } from '../src/lib/token-crypto';
import { handleSlackEventPayload, verifySlackSignature } from '../src/modules/slack/slack-service';
import { originHeaders } from './helpers';

const app = buildApp();
const email = `slack-${Date.now()}@example.com`;
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

function ensureTokenEncryptionKey() {
  if (!env.TOKEN_ENCRYPTION_KEY) {
    env.TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32);
  }
}

describe('slack connector', () => {
  let workspaceId = '';
  let userId = '';

  beforeAll(async () => {
    ensureTokenEncryptionKey();
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: originHeaders(),
      payload: { name: 'Slack User', email, password: 'password123' },
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
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userId = user.id;
    workspaceId = user.lastWorkspaceId!;
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('returns url_verification challenge', async () => {
    const prev = env.SLACK_SIGNING_SECRET;
    env.SLACK_SIGNING_SECRET = undefined;
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/slack/events',
        headers: originHeaders(),
        payload: { type: 'url_verification', challenge: 'challenge-token-1' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ challenge: 'challenge-token-1' });
    } finally {
      env.SLACK_SIGNING_SECRET = prev;
    }
  });

  it('rejects invalid signature with 401 when signing secret is set', async () => {
    const prev = env.SLACK_SIGNING_SECRET;
    env.SLACK_SIGNING_SECRET = 'slack-test-signing-secret';
    try {
      const payload = { type: 'event_callback', event: { type: 'message', text: 'hi' } };
      const timestamp = String(Math.floor(Date.now() / 1000));
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/slack/events',
        headers: {
          ...originHeaders(),
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': 'v0=deadbeefdeadbeef',
        },
        payload,
      });
      expect(res.statusCode).toBe(401);
    } finally {
      env.SLACK_SIGNING_SECRET = prev;
    }
  });

  it('accepts a signed url_verification when signing secret is set', async () => {
    const secret = 'slack-test-signing-secret';
    const prev = env.SLACK_SIGNING_SECRET;
    env.SLACK_SIGNING_SECRET = secret;
    try {
      const payload = { type: 'url_verification', challenge: 'signed-challenge' };
      const raw = JSON.stringify(payload);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${raw}`).digest('hex')}`;
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/slack/events',
        headers: {
          ...originHeaders(),
          'content-type': 'application/json',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature,
        },
        payload: raw,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ challenge: 'signed-challenge' });
    } finally {
      env.SLACK_SIGNING_SECRET = prev;
    }
  });

  it('rejects non-xoxb bot tokens on install', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/slack/install',
      headers: originHeaders(),
      cookies,
      payload: {
        botToken: 'not-a-bot-token-value-xx',
        teamId: 'TNOPE',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(String(res.json().error?.message ?? res.body)).toMatch(/xoxb/i);
  });

  it('reports oauthConfigured on status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/slack/status',
      headers: originHeaders(),
      cookies,
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().oauthConfigured).toBe('boolean');
    expect(res.json().connected).toBe(false);
  });

  it('returns 400 from oauth start when client id is missing', async () => {
    const prevId = env.SLACK_CLIENT_ID;
    const prevSecret = env.SLACK_CLIENT_SECRET;
    env.SLACK_CLIENT_ID = undefined;
    env.SLACK_CLIENT_SECRET = undefined;
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/slack/oauth/start',
        headers: originHeaders(),
        cookies,
      });
      expect(res.statusCode).toBe(400);
      expect(String(res.json().error?.message ?? res.body)).toMatch(/SLACK_CLIENT_ID|OAuth/i);
    } finally {
      env.SLACK_CLIENT_ID = prevId;
      env.SLACK_CLIENT_SECRET = prevSecret;
    }
  });

  it('returns 404 for backfill without an install', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/slack/bindings/missing-binding/backfill',
      headers: originHeaders(),
      cookies,
    });
    expect(res.statusCode).toBe(404);
  });

  it('removes memory source on message_deleted', async () => {
    const teamId = `T${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const channelId = 'CTESTDEL';
    const messageTs = '1710000000.000100';
    const install = await prisma.slackInstall.create({
      data: {
        workspaceId,
        teamId,
        teamName: 'Test Team',
        encryptedBotToken: encryptSecret('xoxb-test-token-not-live'),
        botUserId: 'UBOT',
        scopes: ['channels:history'],
        installedById: userId,
        consentAt: new Date(),
        status: 'connected',
      },
    });
    await prisma.channelBinding.create({
      data: {
        workspaceId,
        slackInstallId: install.id,
        channelId,
        channelName: 'general',
        boundByUserId: userId,
        visibility: 'workspace',
        clearanceLevel: 0,
      },
    });

    await handleSlackEventPayload({
      type: 'event_callback',
      team_id: teamId,
      event: {
        type: 'message',
        user: 'UHUMAN',
        text: 'delete me please',
        channel: channelId,
        ts: messageTs,
      },
    });

    const source = await prisma.memorySource.findFirst({
      where: { workspaceId, type: 'channel', externalKey: `${channelId}:${messageTs}` },
    });
    expect(source).not.toBeNull();
    const chunk = await prisma.memoryChunk.findFirst({
      where: { workspaceId, sourceType: 'channel', externalId: messageTs },
    });
    expect(chunk?.content).toBe('delete me please');

    await handleSlackEventPayload({
      type: 'event_callback',
      team_id: teamId,
      event: {
        type: 'message',
        subtype: 'message_deleted',
        channel: channelId,
        deleted_ts: messageTs,
        ts: '1710000001.000200',
      },
    });

    const gone = await prisma.memorySource.findFirst({
      where: { workspaceId, type: 'channel', externalKey: `${channelId}:${messageTs}` },
    });
    expect(gone).toBeNull();
    const leftover = await prisma.memoryChunk.findFirst({
      where: { workspaceId, sourceType: 'channel', externalId: messageTs },
    });
    expect(leftover).toBeNull();
  });

  it('verifySlackSignature accepts matching hmac and rejects drift', () => {
    const secret = 'sig-secret';
    const ts = String(Math.floor(Date.now() / 1000));
    const body = '{"ok":true}';
    const good = `v0=${createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`;
    expect(verifySlackSignature(secret, ts, body, good)).toBe(true);
    expect(verifySlackSignature(secret, ts, body, 'v0=nope')).toBe(false);
    expect(verifySlackSignature(secret, '100', body, good)).toBe(false);
  });
});

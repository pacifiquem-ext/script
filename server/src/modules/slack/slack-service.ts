import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { encryptSecret, decryptSecret, hasTokenEncryptionKey } from '../../lib/token-crypto';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../common/errors';
import { assertLicenseAllowsWrite } from '../license/license-service';
import { recordAudit } from '../audit/audit-service';
import {
  resolvePrincipalFromIdentity,
  upsertPersonIdentity,
} from '../clearance/clearance-service';
import { logger } from '../../lib/logger';
import { handleAgentAskWithoutConversation } from '../chat/agent-entry';
import { setMemoryChunkEmbedding } from '../../db/vector';
import { embedTexts } from '../jobs/embeddings';

export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  const fiveMinutes = 60 * 5;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > fiveMinutes) return false;
  const base = `v0:${timestamp}:${rawBody}`;
  const digest = `v0=${createHmac('sha256', signingSecret).update(base).digest('hex')}`;
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function slackApi(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; error?: string; [k: string]: unknown };
  if (!data.ok) {
    throw new BadRequestError(`Slack API ${method}: ${data.error ?? 'failed'}`);
  }
  return data;
}

export async function installSlackBot(
  workspaceId: string,
  userId: string,
  input: { botToken: string; teamId: string; teamName?: string; botUserId?: string },
) {
  await assertLicenseAllowsWrite();
  if (!hasTokenEncryptionKey()) {
    throw new BadRequestError('TOKEN_ENCRYPTION_KEY is required to store Slack tokens');
  }
  const token = input.botToken.trim();
  if (!token.startsWith('xoxb-')) throw new BadRequestError('Expected a Slack bot token (xoxb-…)');

  const auth = await slackApi(token, 'auth.test', {});
  const teamId = (auth.team_id as string) || input.teamId;
  const botUserId = (auth.user_id as string) || input.botUserId;

  const install = await prisma.slackInstall.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      teamId,
      teamName: input.teamName ?? (auth.team as string) ?? null,
      encryptedBotToken: encryptSecret(token),
      botUserId: botUserId ?? null,
      scopes: ['app_mentions:read', 'chat:write', 'channels:history', 'reactions:write'],
      installedById: userId,
      consentAt: new Date(),
      status: 'connected',
    },
    update: {
      teamId,
      teamName: input.teamName ?? (auth.team as string) ?? null,
      encryptedBotToken: encryptSecret(token),
      botUserId: botUserId ?? null,
      consentAt: new Date(),
      status: 'connected',
    },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'slack.install',
    targetType: 'slack_install',
    targetId: install.id,
    metadata: { teamId },
  });
  return { connected: true as const, teamId };
}

export async function disconnectSlack(workspaceId: string, userId: string) {
  await assertLicenseAllowsWrite();
  await prisma.channelBinding.deleteMany({ where: { workspaceId } });
  await prisma.slackInstall.deleteMany({ where: { workspaceId } });
  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'slack.disconnect',
    targetType: 'slack_install',
  });
  return { connected: false as const };
}

export async function getSlackStatus(workspaceId: string) {
  const install = await prisma.slackInstall.findUnique({ where: { workspaceId } });
  const bindings = install
    ? await prisma.channelBinding.findMany({
        where: { slackInstallId: install.id },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  return {
    connected: Boolean(install && install.status === 'connected'),
    teamId: install?.teamId ?? null,
    teamName: install?.teamName ?? null,
    bindings: bindings.map((b) => ({
      id: b.id,
      channelId: b.channelId,
      channelName: b.channelName,
      visibility: b.visibility,
      announcedAt: b.announcedAt?.toISOString() ?? null,
    })),
  };
}

export async function bindSlackChannel(
  workspaceId: string,
  userId: string,
  input: { channelId: string; channelName?: string },
) {
  await assertLicenseAllowsWrite();
  const install = await prisma.slackInstall.findUnique({ where: { workspaceId } });
  if (!install) throw new NotFoundError('Slack install');
  const token = decryptSecret(install.encryptedBotToken);

  const binding = await prisma.channelBinding.upsert({
    where: {
      slackInstallId_channelId: {
        slackInstallId: install.id,
        channelId: input.channelId,
      },
    },
    create: {
      workspaceId,
      slackInstallId: install.id,
      channelId: input.channelId,
      channelName: input.channelName ?? null,
      boundByUserId: userId,
      announcedAt: new Date(),
      visibility: 'workspace',
      clearanceLevel: 0,
    },
    update: {
      channelName: input.channelName ?? undefined,
      boundByUserId: userId,
    },
  });

  try {
    await slackApi(token, 'chat.postMessage', {
      channel: input.channelId,
      text: 'script is now listening to this channel as company memory (with your workspace’s clearance rules). Mention @script to ask the brain.',
    });
  } catch (err) {
    logger.warn({ err }, 'slack announce failed');
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'slack.channel_bind',
    targetType: 'channel_binding',
    targetId: binding.id,
    metadata: { channelId: input.channelId },
  });
  return { binding: { id: binding.id, channelId: binding.channelId } };
}

export async function unbindSlackChannel(workspaceId: string, userId: string, bindingId: string) {
  await assertLicenseAllowsWrite();
  const binding = await prisma.channelBinding.findFirst({
    where: { id: bindingId, workspaceId },
  });
  if (!binding) throw new NotFoundError('Channel binding');
  await prisma.channelBinding.delete({ where: { id: bindingId } });
  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'slack.channel_unbind',
    targetType: 'channel_binding',
    targetId: bindingId,
  });
  return { ok: true as const };
}

async function ingestChannelMessage(input: {
  workspaceId: string;
  channelId: string;
  channelName?: string | null;
  messageTs: string;
  userExternalId: string;
  text: string;
  threadTs?: string | null;
}) {
  const externalKey = `${input.channelId}:${input.messageTs}`;
  let source = await prisma.memorySource.findFirst({
    where: { workspaceId: input.workspaceId, type: 'channel', externalKey },
  });
  if (!source) {
    source = await prisma.memorySource.create({
      data: {
        workspaceId: input.workspaceId,
        type: 'channel',
        title: input.channelName
          ? `#${input.channelName} ${input.messageTs}`
          : `channel ${input.channelId}`,
        externalKey,
      },
    });
  }
  await prisma.memoryChunk.deleteMany({ where: { memorySourceId: source.id } });
  const content = input.text.trim();
  if (!content) return;
  const chunk = await prisma.memoryChunk.create({
    data: {
      memorySourceId: source.id,
      workspaceId: input.workspaceId,
      sourceType: 'channel',
      position: 0,
      content,
      speaker: input.userExternalId,
    },
  });
  try {
    const embeddings = await embedTexts([content]);
    const emb = embeddings[0];
    if (emb) await setMemoryChunkEmbedding(prisma, chunk.id, emb);
  } catch (err) {
    logger.warn({ err }, 'channel message embed failed');
  }
}

export async function handleSlackEventPayload(payload: {
  type?: string;
  challenge?: string;
  team_id?: string;
  event?: {
    type?: string;
    user?: string;
    text?: string;
    channel?: string;
    ts?: string;
    thread_ts?: string;
    bot_id?: string;
    channel_type?: string;
  };
}): Promise<{ challenge?: string } | { ok: true }> {
  if (payload.type === 'url_verification' && payload.challenge) {
    return { challenge: payload.challenge };
  }
  const event = payload.event;
  if (!event || event.bot_id) return { ok: true };

  const teamId = payload.team_id;
  if (!teamId) return { ok: true };
  const install = await prisma.slackInstall.findUnique({ where: { teamId } });
  if (!install || install.status !== 'connected') return { ok: true };
  const token = decryptSecret(install.encryptedBotToken);
  const workspaceId = install.workspaceId;

  if (event.user) {
    await upsertPersonIdentity({
      workspaceId,
      provider: 'slack',
      externalId: event.user,
      displayName: event.user,
    });
  }

  if (event.type === 'message' && event.channel && event.ts && event.text) {
    const binding = await prisma.channelBinding.findUnique({
      where: {
        slackInstallId_channelId: {
          slackInstallId: install.id,
          channelId: event.channel,
        },
      },
    });
    if (binding) {
      await ingestChannelMessage({
        workspaceId,
        channelId: event.channel,
        channelName: binding.channelName,
        messageTs: event.ts,
        userExternalId: event.user ?? 'unknown',
        text: event.text,
        threadTs: event.thread_ts,
      });
    }
  }

  if (event.type === 'app_mention' && event.channel && event.ts && event.text && event.user) {
    const question = event.text.replace(/<@[^>]+>/g, '').trim();
    // Ack immediately
    try {
      await slackApi(token, 'reactions.add', {
        channel: event.channel,
        timestamp: event.ts,
        name: 'hourglass_flowing_sand',
      });
    } catch (err) {
      logger.warn({ err }, 'slack reaction ack failed');
    }

    const principal = await resolvePrincipalFromIdentity(workspaceId, 'slack', event.user);
    if (!principal) {
      await slackApi(token, 'chat.postMessage', {
        channel: event.channel,
        thread_ts: event.thread_ts ?? event.ts,
        text: 'I could not map your Slack account to a script workspace member with clearance. An admin must link your identity (Person identity map) before I can answer.',
      });
      try {
        await slackApi(token, 'reactions.remove', {
          channel: event.channel,
          timestamp: event.ts,
          name: 'hourglass_flowing_sand',
        });
      } catch {
        /* ignore */
      }
      return { ok: true };
    }

    try {
      const answer = await handleAgentAskWithoutConversation({
        workspaceId,
        userId: principal.userId,
        clearanceLevel: principal.clearanceLevel,
        elevated: principal.role === 'owner' || principal.role === 'admin',
        question: question || 'Help me with this channel context.',
      });
      await slackApi(token, 'chat.postMessage', {
        channel: event.channel,
        thread_ts: event.thread_ts ?? event.ts,
        text: answer.slice(0, 3500) || 'I could not produce an answer.',
      });
    } catch (err) {
      logger.error({ err }, 'slack agent ask failed');
      await slackApi(token, 'chat.postMessage', {
        channel: event.channel,
        thread_ts: event.thread_ts ?? event.ts,
        text: 'Something went wrong answering that. Try again in the web app or contact an admin.',
      });
    }

    try {
      await slackApi(token, 'reactions.remove', {
        channel: event.channel,
        timestamp: event.ts,
        name: 'hourglass_flowing_sand',
      });
      await slackApi(token, 'reactions.add', {
        channel: event.channel,
        timestamp: event.ts,
        name: 'white_check_mark',
      });
    } catch {
      /* ignore */
    }
  }

  return { ok: true };
}

export function requireSlackSigningSecret(): string {
  if (!env.SLACK_SIGNING_SECRET) {
    throw new ForbiddenError('SLACK_SIGNING_SECRET is not configured');
  }
  return env.SLACK_SIGNING_SECRET;
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { encryptSecret, decryptSecret, hasTokenEncryptionKey } from '../../lib/token-crypto';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../common/errors';
import { assertLicenseAllowsWrite } from '../license/license-service';
import { recordAudit } from '../audit/audit-service';
import { resolvePrincipalFromIdentity, upsertPersonIdentity } from '../clearance/clearance-service';
import { logger } from '../../lib/logger';
import { handleAgentAskWithoutConversation } from '../chat/agent-entry';
import { setMemoryChunkEmbedding } from '../../db/vector';
import { embedTexts } from '../jobs/embeddings';
import { createDocumentFromBuffer } from '../library/library-service';
import { decodeSignedPayload, encodeSignedPayload } from '../integrations/oauth-state';

export const SLACK_BOT_SCOPES = [
  'app_mentions:read',
  'chat:write',
  'channels:history',
  'channels:read',
  'groups:history',
  'groups:read',
  'reactions:write',
  'files:read',
  'users:read.email',
  'users:read',
] as const;

const BACKFILL_MESSAGE_CAP = 200;

type SlackFileRef = {
  id?: string;
  name?: string;
  title?: string;
  mimetype?: string;
  url_private?: string;
  url_private_download?: string;
};

type SlackMessageLike = {
  type?: string;
  subtype?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
  files?: SlackFileRef[];
  reply_count?: number;
};

export type SlackEventPayload = {
  type?: string;
  challenge?: string;
  team_id?: string;
  event?: SlackMessageLike & {
    channel?: string;
    channel_type?: string;
    deleted_ts?: string;
    message?: SlackMessageLike;
    previous_message?: SlackMessageLike;
  };
};

type SlackOAuthState = {
  kind: 'slack';
  workspaceId: string;
  userId: string;
  exp?: number;
};

type SlackHistoryPage = {
  ok: boolean;
  error?: string;
  messages?: SlackMessageLike[];
  has_more?: boolean;
  response_metadata?: { next_cursor?: string };
};

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

function slackOAuthRedirectUri(): string {
  if (env.OAUTH_REDIRECT_URL) {
    try {
      return `${new URL(env.OAUTH_REDIRECT_URL).origin}/slack/oauth/callback`;
    } catch {
      /* fall through */
    }
  }
  return 'http://localhost:4000/slack/oauth/callback';
}

function appPublicUrl(): string {
  return (env.APP_PUBLIC_URL || env.primaryCorsOrigin).replace(/\/$/, '');
}

function isSlackOAuthConfigured(): boolean {
  return Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);
}

function createSlackOAuthState(workspaceId: string, userId: string): string {
  return encodeSignedPayload({ kind: 'slack', workspaceId, userId });
}

function parseSlackOAuthState(state: string): SlackOAuthState {
  const payload = decodeSignedPayload<SlackOAuthState>(state);
  if (payload.kind !== 'slack' || !payload.workspaceId || !payload.userId) {
    throw new BadRequestError('Invalid Slack OAuth state');
  }
  return payload;
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

function scopesFromSlack(scope: unknown): string[] {
  if (typeof scope === 'string' && scope.trim()) {
    return scope.split(/[,\s]+/).filter(Boolean);
  }
  return [...SLACK_BOT_SCOPES];
}

export async function upsertSlackInstallFromToken(input: {
  workspaceId: string;
  userId: string;
  botToken: string;
  teamId: string;
  teamName?: string | null;
  botUserId?: string | null;
  scopes?: string[];
}) {
  await assertLicenseAllowsWrite();
  if (!hasTokenEncryptionKey()) {
    throw new BadRequestError('TOKEN_ENCRYPTION_KEY is required to store Slack tokens');
  }
  const token = input.botToken.trim();
  if (!token.startsWith('xoxb-')) throw new BadRequestError('Expected a Slack bot token (xoxb-…)');
  if (!input.teamId.trim()) throw new BadRequestError('Slack team id is required');

  const install = await prisma.slackInstall.upsert({
    where: { workspaceId: input.workspaceId },
    create: {
      workspaceId: input.workspaceId,
      teamId: input.teamId,
      teamName: input.teamName ?? null,
      encryptedBotToken: encryptSecret(token),
      botUserId: input.botUserId ?? null,
      scopes: input.scopes?.length ? input.scopes : [...SLACK_BOT_SCOPES],
      installedById: input.userId,
      consentAt: new Date(),
      status: 'connected',
    },
    update: {
      teamId: input.teamId,
      teamName: input.teamName ?? undefined,
      encryptedBotToken: encryptSecret(token),
      botUserId: input.botUserId ?? null,
      scopes: input.scopes?.length ? input.scopes : [...SLACK_BOT_SCOPES],
      installedById: input.userId,
      consentAt: new Date(),
      status: 'connected',
    },
  });

  await recordAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    action: 'slack.install',
    targetType: 'slack_install',
    targetId: install.id,
    metadata: { teamId: input.teamId },
  });
  return { connected: true as const, teamId: input.teamId, installId: install.id };
}

export async function installSlackBot(
  workspaceId: string,
  userId: string,
  input: { botToken: string; teamId: string; teamName?: string; botUserId?: string },
) {
  const token = input.botToken.trim();
  if (!token.startsWith('xoxb-')) throw new BadRequestError('Expected a Slack bot token (xoxb-…)');
  if (!hasTokenEncryptionKey()) {
    throw new BadRequestError('TOKEN_ENCRYPTION_KEY is required to store Slack tokens');
  }

  const auth = await slackApi(token, 'auth.test', {});
  const teamId = (auth.team_id as string) || input.teamId;
  const botUserId = (auth.user_id as string) || input.botUserId;

  const result = await upsertSlackInstallFromToken({
    workspaceId,
    userId,
    botToken: token,
    teamId,
    teamName: input.teamName ?? (auth.team as string) ?? null,
    botUserId: botUserId ?? null,
    scopes: [...SLACK_BOT_SCOPES],
  });
  return { connected: result.connected, teamId: result.teamId };
}

export function startSlackOAuth(workspaceId: string, userId: string): string {
  if (!isSlackOAuthConfigured()) {
    throw new BadRequestError(
      'Slack OAuth is not configured. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET.',
    );
  }
  if (!hasTokenEncryptionKey()) {
    throw new BadRequestError('TOKEN_ENCRYPTION_KEY is required to store Slack tokens');
  }
  const state = createSlackOAuthState(workspaceId, userId);
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID!,
    scope: SLACK_BOT_SCOPES.join(','),
    redirect_uri: slackOAuthRedirectUri(),
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function handleSlackOAuthCallback(input: {
  code?: string | null;
  state?: string | null;
  error?: string | null;
}): Promise<string> {
  const frontend = appPublicUrl();
  const connectors = `${frontend}/app/connectors`;
  if (input.error) {
    return `${connectors}?slack=error&message=${encodeURIComponent(input.error)}`;
  }
  if (!input.code || !input.state) {
    return `${connectors}?slack=error&message=${encodeURIComponent('Missing code or state')}`;
  }
  try {
    if (!isSlackOAuthConfigured()) {
      throw new BadRequestError(
        'Slack OAuth is not configured. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET.',
      );
    }
    const state = parseSlackOAuthState(input.state);
    const body = new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID!,
      client_secret: env.SLACK_CLIENT_SECRET!,
      code: input.code,
      redirect_uri: slackOAuthRedirectUri(),
    });
    const res = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await res.json()) as {
      ok: boolean;
      error?: string;
      access_token?: string;
      bot_user_id?: string;
      scope?: string;
      team?: { id?: string; name?: string };
    };
    if (!data.ok || !data.access_token || !data.team?.id) {
      throw new BadRequestError(`Slack OAuth exchange failed: ${data.error ?? 'unknown error'}`);
    }
    await upsertSlackInstallFromToken({
      workspaceId: state.workspaceId,
      userId: state.userId,
      botToken: data.access_token,
      teamId: data.team.id,
      teamName: data.team.name ?? null,
      botUserId: data.bot_user_id ?? null,
      scopes: scopesFromSlack(data.scope),
    });
    return `${connectors}?slack=connected`;
  } catch (err) {
    logger.error({ err }, 'slack oauth callback failed');
    const message = err instanceof Error ? err.message : 'OAuth failed';
    return `${connectors}?slack=error&message=${encodeURIComponent(message)}`;
  }
}

async function deleteChannelMemory(workspaceId: string, channelId?: string) {
  if (channelId) {
    await prisma.memorySource.deleteMany({
      where: {
        workspaceId,
        type: 'channel',
        OR: [
          { externalKey: { startsWith: `${channelId}:` } },
          { externalKey: channelId },
        ],
      },
    });
  } else {
    await prisma.memorySource.deleteMany({ where: { workspaceId, type: 'channel' } });
  }
  if (!channelId) {
    await prisma.document.deleteMany({
      where: { workspaceId, sourceUrl: { startsWith: 'slack://' } },
    });
  }
}

export async function disconnectSlack(workspaceId: string, userId: string) {
  await assertLicenseAllowsWrite();
  await deleteChannelMemory(workspaceId);
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
    oauthConfigured: isSlackOAuthConfigured(),
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
  await deleteChannelMemory(workspaceId, binding.channelId);
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

function isBotMessage(msg: SlackMessageLike | undefined | null): boolean {
  if (!msg) return false;
  return Boolean(msg.bot_id) || msg.subtype === 'bot_message';
}

async function ingestSlackFiles(input: {
  workspaceId: string;
  userId: string | null;
  teamId: string;
  token: string;
  files: SlackFileRef[];
}) {
  if (!input.userId || input.files.length === 0) return;
  for (const file of input.files) {
    const url = file.url_private_download || file.url_private;
    if (!url) continue;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${input.token}` },
      });
      if (!res.ok) {
        logger.warn({ status: res.status, fileId: file.id }, 'slack file download failed');
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength === 0) {
        logger.warn({ fileId: file.id }, 'slack file download empty');
        continue;
      }
      const mimeType =
        file.mimetype ||
        res.headers.get('content-type')?.split(';')[0]?.trim() ||
        'application/octet-stream';
      const filename = file.name || file.title || `slack-file-${file.id ?? 'unknown'}`;
      const sourceUrl = file.id
        ? `slack://file/${input.teamId}/${file.id}`
        : `slack://file/${input.teamId}/${encodeURIComponent(url)}`;
      await createDocumentFromBuffer({
        workspaceId: input.workspaceId,
        userId: input.userId,
        filename,
        mimeType,
        buffer,
        source: 'url',
        sourceUrl,
      });
    } catch (err) {
      logger.warn({ err, fileId: file.id }, 'slack file ingest failed');
    }
  }
}

async function ingestChannelMessage(input: {
  workspaceId: string;
  channelId: string;
  channelName?: string | null;
  messageTs: string;
  userExternalId: string;
  text: string;
  threadTs?: string | null;
  files?: SlackFileRef[];
  botToken?: string;
  libraryUserId?: string | null;
  teamId?: string;
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
  if (content) {
    const chunk = await prisma.memoryChunk.create({
      data: {
        memorySourceId: source.id,
        workspaceId: input.workspaceId,
        sourceType: 'channel',
        position: 0,
        content,
        speaker: input.userExternalId,
        externalId: input.messageTs,
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

  const files = input.files?.filter((f) => f.url_private_download || f.url_private) ?? [];
  if (files.length && input.botToken && input.teamId) {
    await ingestSlackFiles({
      workspaceId: input.workspaceId,
      userId: input.libraryUserId ?? null,
      teamId: input.teamId,
      token: input.botToken,
      files,
    });
  }
}

async function deleteChannelMessage(input: {
  workspaceId: string;
  channelId: string;
  messageTs: string;
}) {
  const externalKey = `${input.channelId}:${input.messageTs}`;
  const source = await prisma.memorySource.findFirst({
    where: { workspaceId: input.workspaceId, type: 'channel', externalKey },
  });
  if (source) {
    await prisma.memorySource.delete({ where: { id: source.id } });
  }
}

async function fetchHistoryPage(
  token: string,
  method: 'conversations.history' | 'conversations.replies',
  body: Record<string, unknown>,
): Promise<SlackHistoryPage> {
  const data = (await slackApi(token, method, body)) as SlackHistoryPage;
  return data;
}

async function fetchChannelHistoryForBackfill(
  token: string,
  channelId: string,
  cap: number,
): Promise<SlackMessageLike[]> {
  const collected: SlackMessageLike[] = [];
  let cursor: string | undefined;
  while (collected.length < cap) {
    const page = await fetchHistoryPage(token, 'conversations.history', {
      channel: channelId,
      limit: Math.min(200, cap - collected.length),
      ...(cursor ? { cursor } : {}),
    });
    const messages = page.messages ?? [];
    for (const msg of messages) {
      collected.push(msg);
      if (collected.length >= cap) break;
    }
    const next = page.response_metadata?.next_cursor;
    if (!page.has_more || !next) break;
    cursor = next;
  }

  const seen = new Set(collected.map((m) => m.ts).filter(Boolean) as string[]);
  const parents = collected.filter(
    (m) => m.ts && m.thread_ts && m.ts === m.thread_ts && (m.reply_count ?? 0) > 0,
  );
  for (const parent of parents) {
    if (collected.length >= cap) break;
    let replyCursor: string | undefined;
    while (collected.length < cap) {
      let page: SlackHistoryPage;
      try {
        page = await fetchHistoryPage(token, 'conversations.replies', {
          channel: channelId,
          ts: parent.ts,
          limit: Math.min(200, cap - collected.length),
          ...(replyCursor ? { cursor: replyCursor } : {}),
        });
      } catch (err) {
        logger.warn({ err, channelId, threadTs: parent.ts }, 'slack conversations.replies failed');
        break;
      }
      for (const reply of page.messages ?? []) {
        if (!reply.ts || seen.has(reply.ts)) continue;
        seen.add(reply.ts);
        collected.push(reply);
        if (collected.length >= cap) break;
      }
      const next = page.response_metadata?.next_cursor;
      if (!page.has_more || !next) break;
      replyCursor = next;
    }
  }
  return collected;
}

export async function backfillChannelBinding(
  workspaceId: string,
  userId: string,
  bindingId: string,
) {
  await assertLicenseAllowsWrite();
  const install = await prisma.slackInstall.findUnique({ where: { workspaceId } });
  if (!install || install.status !== 'connected') throw new NotFoundError('Slack install');
  const binding = await prisma.channelBinding.findFirst({
    where: { id: bindingId, workspaceId, slackInstallId: install.id },
  });
  if (!binding) throw new NotFoundError('Channel binding');

  const token = decryptSecret(install.encryptedBotToken);
  const messages = await fetchChannelHistoryForBackfill(
    token,
    binding.channelId,
    BACKFILL_MESSAGE_CAP,
  );

  let imported = 0;
  let skipped = 0;
  for (const msg of messages) {
    if (!msg.ts || isBotMessage(msg) || !msg.user) {
      skipped += 1;
      continue;
    }
    const text = typeof msg.text === 'string' ? msg.text : '';
    const files = Array.isArray(msg.files) ? msg.files : [];
    if (!text.trim() && files.length === 0) {
      skipped += 1;
      continue;
    }
    await ingestChannelMessage({
      workspaceId,
      channelId: binding.channelId,
      channelName: binding.channelName,
      messageTs: msg.ts,
      userExternalId: msg.user,
      text,
      threadTs: msg.thread_ts,
      files,
      botToken: token,
      libraryUserId: userId,
      teamId: install.teamId,
    });
    imported += 1;
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'slack.channel_backfill',
    targetType: 'channel_binding',
    targetId: binding.id,
    metadata: { imported, skipped, channelId: binding.channelId },
  });
  return { imported, skipped };
}

export async function handleSlackEventPayload(
  payload: SlackEventPayload,
): Promise<{ challenge?: string } | { ok: true }> {
  if (payload.type === 'url_verification' && payload.challenge) {
    return { challenge: payload.challenge };
  }
  const event = payload.event;
  if (!event) return { ok: true };

  const teamId = payload.team_id;
  if (!teamId) return { ok: true };
  const install = await prisma.slackInstall.findUnique({ where: { teamId } });
  if (!install || install.status !== 'connected') return { ok: true };
  const token = decryptSecret(install.encryptedBotToken);
  const workspaceId = install.workspaceId;

  const subtype = event.subtype;
  if (event.type === 'message' && event.channel && subtype === 'message_deleted') {
    const deletedTs = event.deleted_ts || event.previous_message?.ts;
    if (deletedTs) {
      await deleteChannelMessage({
        workspaceId,
        channelId: event.channel,
        messageTs: deletedTs,
      });
    }
    return { ok: true };
  }

  if (event.bot_id) return { ok: true };

  if (event.user) {
    await upsertPersonIdentity({
      workspaceId,
      provider: 'slack',
      externalId: event.user,
      displayName: event.user,
    });
  }

  if (event.type === 'message' && event.channel) {
    const binding = await prisma.channelBinding.findUnique({
      where: {
        slackInstallId_channelId: {
          slackInstallId: install.id,
          channelId: event.channel,
        },
      },
    });
    if (binding) {
      if (subtype === 'message_changed') {
        const updated = event.message;
        if (updated?.ts && !isBotMessage(updated)) {
          const text = typeof updated.text === 'string' ? updated.text : '';
          await ingestChannelMessage({
            workspaceId,
            channelId: event.channel,
            channelName: binding.channelName,
            messageTs: updated.ts,
            userExternalId: updated.user ?? event.user ?? 'unknown',
            text,
            threadTs: updated.thread_ts ?? event.thread_ts,
            files: updated.files,
            botToken: token,
            libraryUserId: install.installedById,
            teamId: install.teamId,
          });
        }
      } else if (event.ts && (event.text || (event.files && event.files.length > 0))) {
        await ingestChannelMessage({
          workspaceId,
          channelId: event.channel,
          channelName: binding.channelName,
          messageTs: event.ts,
          userExternalId: event.user ?? 'unknown',
          text: event.text ?? '',
          threadTs: event.thread_ts,
          files: event.files,
          botToken: token,
          libraryUserId: install.installedById,
          teamId: install.teamId,
        });
      }
    }
  }

  if (event.type === 'app_mention' && event.channel && event.ts && event.text && event.user) {
    const question = event.text.replace(/<@[^>]+>/g, '').trim();
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

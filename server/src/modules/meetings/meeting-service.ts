import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  INGESTION_CREDIT_COST,
  paginate,
  toSkipTake,
  type ListMeetingsQuery,
  type PublicMeeting,
  type PublicMeetingDetail,
} from '@script/shared';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../common/errors';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { logger } from '../../lib/logger';
import { decryptSecret, encryptSecret, hasTokenEncryptionKey } from '../../lib/token-crypto';
import { assertHasCredits, decrementCredits } from '../credits/credits-service';
import { setMemoryChunkEmbedding } from '../../db/vector';
import { chunkText } from '../jobs/extract';
import { embedTexts } from '../jobs/embeddings';
import { assertLicenseAllowsWrite } from '../license/license-service';
import { extractMeetingCommitments } from './commitment-extract';
import {
  buildTranscriptText,
  fetchFirefliesTranscript,
  listFirefliesTranscripts,
  secondsToMs,
  type FirefliesTranscript,
} from './fireflies-client';

const PROVIDER = 'fireflies';

function mapMeeting(row: {
  id: string;
  title: string;
  summary: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  sourceProvider: string;
  sourceUrl: string | null;
  participants: unknown;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
  sourceExternalId?: string | null;
}): PublicMeeting {
  const participants = Array.isArray(row.participants)
    ? (row.participants as Array<{ name: string; email?: string }>)
    : [];
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    sourceProvider: row.sourceProvider,
    sourceUrl: row.sourceUrl,
    participants,
    status: row.status,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
  };
}

async function getFirefliesApiKey(workspaceId: string): Promise<string> {
  const conn = await prisma.meetingConnector.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: PROVIDER } },
  });
  if (!conn || conn.status !== 'connected') {
    throw new BadRequestError('Fireflies is not connected for this workspace');
  }
  return decryptSecret(conn.encryptedCredentials);
}

export async function getMeetingConnectorStatus(workspaceId: string) {
  const conn = await prisma.meetingConnector.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: PROVIDER } },
  });
  return {
    provider: PROVIDER,
    connected: Boolean(conn && conn.status === 'connected'),
    lastSyncAt: conn?.lastSyncAt?.toISOString() ?? null,
    lastError: conn?.lastError ?? null,
    webhookConfigured: Boolean(env.FIREFLIES_WEBHOOK_SECRET),
  };
}

export async function connectFireflies(
  workspaceId: string,
  apiKey: string,
): Promise<{ connected: true }> {
  await assertLicenseAllowsWrite();
  if (!hasTokenEncryptionKey()) {
    throw new BadRequestError('TOKEN_ENCRYPTION_KEY is required to store Fireflies API keys');
  }
  const key = apiKey.trim();
  if (key.length < 16) throw new BadRequestError('Invalid Fireflies API key');

  // Validate key by listing one page
  await listFirefliesTranscripts(key, 1);

  await prisma.meetingConnector.upsert({
    where: { workspaceId_provider: { workspaceId, provider: PROVIDER } },
    create: {
      workspaceId,
      provider: PROVIDER,
      encryptedCredentials: encryptSecret(key),
      status: 'connected',
      lastError: null,
    },
    update: {
      encryptedCredentials: encryptSecret(key),
      status: 'connected',
      lastError: null,
    },
  });
  return { connected: true };
}

export async function disconnectFireflies(workspaceId: string) {
  await assertLicenseAllowsWrite();
  await prisma.meetingConnector.deleteMany({
    where: { workspaceId, provider: PROVIDER },
  });
  return { connected: false as const };
}

export async function syncFirefliesMeetings(
  workspaceId: string,
  userId: string,
  limit = 15,
): Promise<{ imported: number; skipped: number; failed: number }> {
  await assertLicenseAllowsWrite();
  const apiKey = await getFirefliesApiKey(workspaceId);
  const list = await listFirefliesTranscripts(apiKey, Math.min(Math.max(limit, 1), 50));
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of list) {
    const existing = await prisma.meeting.findFirst({
      where: {
        workspaceId,
        sourceProvider: PROVIDER,
        sourceExternalId: item.id,
      },
    });
    if (existing?.status === 'ready') {
      skipped += 1;
      continue;
    }
    try {
      await importFirefliesTranscript(workspaceId, userId, item.id, apiKey);
      imported += 1;
    } catch (err) {
      failed += 1;
      logger.error({ err, transcriptId: item.id }, 'fireflies sync item failed');
    }
  }

  await prisma.meetingConnector.updateMany({
    where: { workspaceId, provider: PROVIDER },
    data: {
      lastSyncAt: new Date(),
      lastError: failed > 0 ? `${failed} transcript(s) failed during sync` : null,
    },
  });

  return { imported, skipped, failed };
}

export async function importFirefliesTranscript(
  workspaceId: string,
  userId: string | null,
  transcriptId: string,
  apiKey?: string,
): Promise<{ meeting: PublicMeeting }> {
  await assertLicenseAllowsWrite();
  await assertHasCredits(workspaceId, INGESTION_CREDIT_COST);
  const key = apiKey ?? (await getFirefliesApiKey(workspaceId));
  const remote = await fetchFirefliesTranscript(key, transcriptId);
  const meeting = await upsertFromFireflies(workspaceId, userId, remote);
  await processMeetingEmbeddings(meeting.id);
  if (userId) {
    await decrementCredits({
      workspaceId,
      userId,
      cost: INGESTION_CREDIT_COST,
      reason: 'ingestion_usage',
      refType: 'meeting',
      refId: meeting.id,
    }).catch((err) => logger.warn({ err }, 'meeting credit charge failed'));
  }
  const fresh = await prisma.meeting.findUniqueOrThrow({ where: { id: meeting.id } });
  return { meeting: mapMeeting(fresh) };
}

async function upsertFromFireflies(
  workspaceId: string,
  userId: string | null,
  remote: FirefliesTranscript,
) {
  const sentences = remote.sentences ?? [];
  const transcriptText = buildTranscriptText(sentences);
  if (!transcriptText.trim()) {
    throw new BadRequestError('Fireflies transcript has no sentences yet');
  }

  const summary =
    remote.summary?.overview?.trim() ||
    remote.summary?.short_summary?.trim() ||
    remote.summary?.short_overview?.trim() ||
    remote.summary?.bullet_gist?.trim() ||
    null;

  const participants: Array<{ name: string; email?: string }> = [];
  for (const a of remote.meeting_attendees ?? []) {
    const name = (a.displayName || a.name || a.email || '').trim();
    if (name) participants.push({ name, email: a.email ?? undefined });
  }
  if (participants.length === 0) {
    for (const p of remote.participants ?? []) {
      if (p?.trim()) participants.push({ name: p.trim() });
    }
  }

  const startedAt = remote.date ? new Date(remote.date) : null;
  const endedAt =
    startedAt && remote.duration != null
      ? new Date(startedAt.getTime() + remote.duration * 60_000)
      : null;

  const existing = await prisma.meeting.findFirst({
    where: {
      workspaceId,
      sourceProvider: PROVIDER,
      sourceExternalId: remote.id,
    },
  });

  if (existing) {
    return prisma.meeting.update({
      where: { id: existing.id },
      data: {
        title: remote.title?.trim() || existing.title,
        summary,
        transcriptText,
        startedAt,
        endedAt,
        sourceUrl: remote.transcript_url,
        participants,
        status: 'pending',
        failureReason: null,
      },
    });
  }

  return prisma.meeting.create({
    data: {
      workspaceId,
      title: remote.title?.trim() || 'Fireflies meeting',
      summary,
      transcriptText,
      startedAt,
      endedAt,
      sourceProvider: PROVIDER,
      sourceExternalId: remote.id,
      sourceUrl: remote.transcript_url,
      participants,
      status: 'pending',
      createdById: userId,
    },
  });
}

export async function resolveCommitmentOwner(
  workspaceId: string,
  ownerLabel: string | null | undefined,
): Promise<string | null> {
  const label = ownerLabel?.trim();
  if (!label) return null;
  const lowered = label.toLowerCase();

  const identities = await prisma.personIdentity.findMany({
    where: {
      workspaceId,
      userId: { not: null },
      OR: [
        { displayName: { equals: label, mode: 'insensitive' } },
        { email: { equals: lowered, mode: 'insensitive' } },
      ],
    },
    select: { userId: true },
    take: 8,
  });
  const fromIdentity = identities.find((row) => row.userId)?.userId ?? null;
  if (fromIdentity) return fromIdentity;

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const member = members.find((row) => {
    const name = row.user.name.trim().toLowerCase();
    const email = row.user.email.trim().toLowerCase();
    return name === lowered || email === lowered;
  });
  return member?.user.id ?? null;
}

export async function processMeetingEmbeddings(meetingId: string): Promise<void> {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting?.transcriptText) return;

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { status: 'processing', failureReason: null },
  });

  try {
    let remote: FirefliesTranscript | null = null;
    if (meeting.sourceProvider === PROVIDER && meeting.sourceExternalId) {
      try {
        const key = await getFirefliesApiKey(meeting.workspaceId);
        remote = await fetchFirefliesTranscript(key, meeting.sourceExternalId);
      } catch (err) {
        logger.warn(
          { err, meetingId },
          're-fetch fireflies for segments failed; using stored text',
        );
      }
    }

    type Seg = {
      content: string;
      speaker: string | null;
      startMs: number | null;
      endMs: number | null;
      position: number;
    };

    let finalSegments: Seg[] = [];
    if (remote?.sentences?.length) {
      finalSegments = remote.sentences
        .filter((s) => Boolean(s.text?.trim()))
        .map((s, i) => ({
          content: s.text.trim(),
          speaker: s.speaker_name?.trim() || null,
          startMs: secondsToMs(s.start_time),
          endMs: secondsToMs(s.end_time),
          position: i,
        }));
    }
    if (finalSegments.length === 0) {
      finalSegments = chunkText(meeting.transcriptText).map((c, i) => ({
        content: c.content,
        speaker: null,
        startMs: null,
        endMs: null,
        position: i,
      }));
    }

    if (finalSegments.length === 0) throw new BadRequestError('No transcript segments to embed');

    const embeddings = await embedTexts(
      finalSegments.map((s: Seg) => s.content),
      'document',
    );

    let memorySource = await prisma.memorySource.findUnique({
      where: { meetingId },
    });
    if (!memorySource) {
      memorySource = await prisma.memorySource.create({
        data: {
          workspaceId: meeting.workspaceId,
          type: 'meeting',
          title: meeting.title,
          meetingId: meeting.id,
        },
      });
    } else {
      await prisma.memorySource.update({
        where: { id: memorySource.id },
        data: { title: meeting.title },
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.memoryChunk.deleteMany({ where: { memorySourceId: memorySource!.id } });
      await tx.memoryChunk.createMany({
        data: finalSegments.map((seg: Seg) => ({
          memorySourceId: memorySource!.id,
          workspaceId: meeting.workspaceId,
          sourceType: 'meeting' as const,
          position: seg.position,
          content: seg.content,
          meetingId: meeting.id,
          speaker: seg.speaker,
          startMs: seg.startMs,
          endMs: seg.endMs,
        })),
      });
      const rows = await tx.memoryChunk.findMany({
        where: { memorySourceId: memorySource!.id },
        select: { id: true, position: true },
        orderBy: { position: 'asc' },
      });
      for (const row of rows) {
        const emb = embeddings[row.position];
        if (!emb) throw new Error(`Missing embedding ${row.position}`);
        await setMemoryChunkEmbedding(tx, row.id, emb);
      }
    });

    const providerActions = remote?.summary?.action_items ?? null;
    const commitments = await extractMeetingCommitments({
      title: meeting.title,
      summary: meeting.summary,
      transcriptText: meeting.transcriptText,
      providerActionItems: providerActions,
    });

    await prisma.meetingCommitment.deleteMany({ where: { meetingId: meeting.id } });
    if (commitments.length > 0) {
      const withOwners = await Promise.all(
        commitments.map(async (c) => ({
          ...c,
          ownerUserId: await resolveCommitmentOwner(meeting.workspaceId, c.ownerLabel),
        })),
      );
      await prisma.meetingCommitment.createMany({
        data: withOwners.map((c) => ({
          meetingId: meeting.id,
          workspaceId: meeting.workspaceId,
          text: c.text,
          ownerLabel: c.ownerLabel,
          ownerUserId: c.ownerUserId,
          dueAt: c.dueAt ? new Date(c.dueAt) : null,
          sourceStartMs: c.sourceStartMs,
        })),
      });
    }

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        status: 'ready',
        processedAt: new Date(),
        failureReason: null,
        summary: meeting.summary,
      },
    });
  } catch (err) {
    logger.error({ err, meetingId }, 'meeting process failed');
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'failed',
        failureReason: err instanceof Error ? err.message.slice(0, 500) : 'Processing failed',
      },
    });
    throw err;
  }
}

export function verifyFirefliesWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  const secret = env.FIREFLIES_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('FIREFLIES_WEBHOOK_SECRET unset; rejecting webhook');
    return false;
  }
  if (!signatureHeader) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function handleFirefliesWebhook(payload: {
  meetingId?: string;
  clientReferenceId?: string;
  eventType?: string;
}): Promise<{ ok: true; meetingId?: string }> {
  const transcriptId = payload.meetingId;
  if (!transcriptId) throw new BadRequestError('meetingId (transcript id) required');

  // clientReferenceId may encode workspaceId when configured in Fireflies
  const workspaceId = payload.clientReferenceId?.startsWith('ws:')
    ? payload.clientReferenceId.slice(3)
    : null;

  if (!workspaceId) {
    // Fall back: find any workspace with Fireflies connected that can access this transcript
    const connectors = await prisma.meetingConnector.findMany({
      where: { provider: PROVIDER, status: 'connected' },
      take: 20,
    });
    for (const c of connectors) {
      try {
        const key = decryptSecret(c.encryptedCredentials);
        await importFirefliesTranscript(c.workspaceId, null, transcriptId, key);
        return { ok: true, meetingId: transcriptId };
      } catch {
        // try next workspace
      }
    }
    throw new ForbiddenError(
      'No workspace could import this Fireflies transcript. Set clientReferenceId=ws:<workspaceId> on the webhook or connect Fireflies first.',
    );
  }

  await importFirefliesTranscript(workspaceId, null, transcriptId);
  return { ok: true, meetingId: transcriptId };
}

export async function listMeetingsApi(workspaceId: string, query: ListMeetingsQuery) {
  const where = {
    workspaceId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.q?.trim()
      ? { title: { contains: query.q.trim(), mode: 'insensitive' as const } }
      : {}),
  };
  const total = await prisma.meeting.count({ where });
  const rows = await prisma.meeting.findMany({
    where,
    orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    ...toSkipTake(query),
  });
  return paginate(rows.map(mapMeeting), total, query);
}

export async function getMeetingApi(
  workspaceId: string,
  meetingId: string,
): Promise<{ meeting: PublicMeetingDetail }> {
  const row = await prisma.meeting.findFirst({
    where: { id: meetingId, workspaceId },
    include: { commitments: { orderBy: { createdAt: 'asc' } } },
  });
  if (!row) throw new NotFoundError('Meeting');
  return {
    meeting: {
      ...mapMeeting(row),
      transcriptText: row.transcriptText,
      commitments: row.commitments.map((c) => ({
        id: c.id,
        text: c.text,
        ownerLabel: c.ownerLabel,
        ownerUserId: c.ownerUserId,
        dueAt: c.dueAt?.toISOString() ?? null,
        sourceStartMs: c.sourceStartMs,
      })),
    },
  };
}

export async function deleteMeeting(workspaceId: string, meetingId: string) {
  await assertLicenseAllowsWrite();
  const existing = await prisma.meeting.findFirst({ where: { id: meetingId, workspaceId } });
  if (!existing) throw new NotFoundError('Meeting');
  await prisma.meeting.delete({ where: { id: meetingId } });
  return { ok: true as const };
}

export function webhookSecretFingerprint(): string | null {
  if (!env.FIREFLIES_WEBHOOK_SECRET) return null;
  return createHash('sha256').update(env.FIREFLIES_WEBHOOK_SECRET).digest('hex').slice(0, 12);
}

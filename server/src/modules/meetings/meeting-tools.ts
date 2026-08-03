import { RAG_MIN_SIMILARITY, RAG_TOP_K } from '@script/shared';
import { prisma } from '../../db/prisma';
import { embedQuery } from '../jobs/embeddings';
import { searchMemoryChunks } from '../memory/memory-chunks';
import type { AgentToolContext } from '../chat/agent/registry';

export async function listMeetings(
  ctx: AgentToolContext,
  input: { q?: string; limit?: number },
): Promise<{
  total: number;
  meetings: Array<{
    id: string;
    title: string;
    summary: string | null;
    status: string;
    startedAt: string | null;
  }>;
}> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const where = {
    workspaceId: ctx.workspaceId,
    ...(input.q?.trim()
      ? { title: { contains: input.q.trim(), mode: 'insensitive' as const } }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.meeting.count({ where }),
    prisma.meeting.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        summary: true,
        status: true,
        startedAt: true,
      },
    }),
  ]);
  return {
    total,
    meetings: rows.map((m) => ({
      id: m.id,
      title: m.title,
      summary: m.summary,
      status: m.status,
      startedAt: m.startedAt?.toISOString() ?? null,
    })),
  };
}

export async function getMeetingSummary(
  ctx: AgentToolContext,
  input: { meetingId?: string; title?: string },
) {
  const row = input.meetingId
    ? await prisma.meeting.findFirst({
        where: { id: input.meetingId, workspaceId: ctx.workspaceId },
        include: { commitments: true },
      })
    : input.title?.trim()
      ? await prisma.meeting.findFirst({
          where: {
            workspaceId: ctx.workspaceId,
            title: { equals: input.title.trim(), mode: 'insensitive' },
          },
          include: { commitments: true },
        })
      : null;
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    participants: row.participants,
    transcriptPreview: row.transcriptText?.slice(0, 1500) ?? null,
    commitments: row.commitments.map((c) => ({
      id: c.id,
      text: c.text,
      ownerLabel: c.ownerLabel,
      dueAt: c.dueAt?.toISOString() ?? null,
      sourceStartMs: c.sourceStartMs,
    })),
  };
}

export type MeetingSearchHit = {
  meetingId: string;
  meetingTitle: string;
  chunkId: string;
  position: number;
  score: number;
  excerpt: string;
  speaker: string | null;
  startMs: number | null;
  endMs: number | null;
};

export async function searchMeetings(
  ctx: AgentToolContext,
  input: { query: string; meetingIds?: string[]; limit?: number },
): Promise<{ hits: MeetingSearchHit[] }> {
  const query = input.query.trim();
  if (!query) return { hits: [] };
  const limit = Math.min(Math.max(input.limit ?? RAG_TOP_K, 1), 20);
  const embedding = await embedQuery(query);
  const hits = await searchMemoryChunks({
    workspaceId: ctx.workspaceId,
    queryEmbedding: embedding,
    sourceType: 'meeting',
    meetingIds: input.meetingIds,
    limit,
    minSimilarity: RAG_MIN_SIMILARITY,
  });
  return {
    hits: hits
      .filter((h) => h.meetingId)
      .map((h) => ({
        meetingId: h.meetingId!,
        meetingTitle: h.meetingTitle ?? 'Meeting',
        chunkId: h.chunkId,
        position: h.position,
        score: h.score,
        excerpt: h.content.slice(0, 500),
        speaker: h.speaker,
        startMs: h.startMs,
        endMs: h.endMs,
      })),
  };
}

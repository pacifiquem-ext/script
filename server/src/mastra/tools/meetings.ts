import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  getMeetingSummary,
  listMeetings,
  searchMeetings,
} from '../../modules/meetings/meeting-tools';
import { toolContextFromRequestContext } from '../request-context';

export const listMeetingsTool = createTool({
  id: 'list_meetings',
  description:
    'List meetings/calls in the workspace with titles, dates, and short summaries. Use for "what meetings do we have?", recent calls inventory. Not for document library files.',
  inputSchema: z.object({
    q: z.string().optional().describe('Optional title filter'),
    limit: z.number().optional().describe('1–50, default 20'),
  }),
  execute: async (input, { requestContext }) => {
    const ctx = toolContextFromRequestContext(requestContext);
    return listMeetings(ctx, { q: input.q, limit: input.limit });
  },
});

export const getMeetingSummaryTool = createTool({
  id: 'get_meeting_summary',
  description: 'Get summary, participants, and commitments for one meeting by id or exact title.',
  inputSchema: z.object({
    meetingId: z.string().optional(),
    title: z.string().optional(),
  }),
  execute: async (input, { requestContext }) => {
    const ctx = toolContextFromRequestContext(requestContext);
    const meeting = await getMeetingSummary(ctx, {
      meetingId: input.meetingId,
      title: input.title,
    });
    if (!meeting) return { error: 'Meeting not found in this workspace' };
    return meeting;
  },
});

export const searchMeetingsTool = createTool({
  id: 'search_meetings',
  description:
    'Semantic search over meeting transcripts. Use for "what did we decide on the call?", speaker content. Prefer list_meetings for inventory. Not for Library files — use search_library.',
  inputSchema: z.object({
    query: z.string(),
    meetingIds: z.array(z.string()).optional(),
    limit: z.number().optional(),
  }),
  execute: async (input, { requestContext }) => {
    const ctx = toolContextFromRequestContext(requestContext);
    const query = input.query?.trim() ?? '';
    if (!query) return { error: 'query is required', hits: [] as const };
    const result = await searchMeetings(ctx, {
      query,
      meetingIds: input.meetingIds,
      limit: input.limit,
    });
    return {
      ...result,
      citations: result.hits.map((h) => ({
        sourceType: 'meeting' as const,
        documentId: h.meetingId,
        documentName: h.meetingTitle,
        chunkId: h.chunkId,
        position: h.position,
        score: Number(h.score.toFixed(4)),
        meetingId: h.meetingId,
        startMs: h.startMs,
        endMs: h.endMs,
        speaker: h.speaker,
      })),
    };
  },
});

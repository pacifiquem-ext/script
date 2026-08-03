import {
  getLibraryDocument,
  listLibraryDocuments,
  searchLibrary,
} from './library-tools';
import { registerTool } from './registry';
import { webSearch } from './web-search';
import {
  getMeetingSummary,
  listMeetings,
  searchMeetings,
} from '../../meetings/meeting-tools';
import { getWorkItemTool, listWorkItemsTool } from '../../connectors/work-tools';

let registered = false;

/** Idempotent bootstrap — import once from agent/index. */
export function registerBuiltinTools(): void {
  if (registered) return;
  registered = true;

  registerTool({
    statusLabel: 'Listing Library…',
    definition: {
      name: 'list_library_documents',
      description:
        'List documents in the workspace Library with one-line summaries. Use for inventory questions like "what is in my library?", overviews, or finding files by name fragment. Does not return full document bodies.',
      input_schema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Optional case-insensitive name filter' },
          limit: { type: 'number', description: 'Max documents to return (1–100, default 50)' },
          folderId: {
            type: 'string',
            description: 'Optional folder id; omit for all folders',
          },
        },
        additionalProperties: false,
      },
    },
    execute: async (input, ctx) => {
      const result = await listLibraryDocuments(ctx, {
        q: typeof input.q === 'string' ? input.q : undefined,
        limit: typeof input.limit === 'number' ? input.limit : undefined,
        folderId:
          input.folderId === null
            ? null
            : typeof input.folderId === 'string'
              ? input.folderId
              : undefined,
      });
      return { ok: true, data: result };
    },
  });

  registerTool({
    statusLabel: 'Loading document…',
    definition: {
      name: 'get_document_summary',
      description:
        'Get metadata and a short summary/preview for one Library document by id or exact name.',
      input_schema: {
        type: 'object',
        properties: {
          documentId: { type: 'string' },
          name: { type: 'string', description: 'Exact document name (case-insensitive)' },
        },
        additionalProperties: false,
      },
    },
    execute: async (input, ctx) => {
      const doc = await getLibraryDocument(ctx, {
        documentId: typeof input.documentId === 'string' ? input.documentId : undefined,
        name: typeof input.name === 'string' ? input.name : undefined,
      });
      if (!doc) return { ok: false, data: { error: 'Document not found in this workspace' } };
      return { ok: true, data: doc };
    },
  });

  registerTool({
    statusLabel: 'Searching Library…',
    definition: {
      name: 'search_library',
      description:
        'Semantic search over current-version document chunks in the Library. Use for content questions. Prefer list_library_documents for inventory. Does not search meetings — use search_meetings.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query' },
          documentIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional restrict to these document ids',
          },
          limit: { type: 'number', description: 'Max hits (default 8)' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    execute: async (input, ctx) => {
      const query = typeof input.query === 'string' ? input.query : '';
      if (!query.trim()) return { ok: false, data: { error: 'query is required' } };
      const result = await searchLibrary(ctx, {
        query,
        documentIds: Array.isArray(input.documentIds)
          ? input.documentIds.filter((id): id is string => typeof id === 'string')
          : undefined,
        limit: typeof input.limit === 'number' ? input.limit : undefined,
      });
      return {
        ok: true,
        data: result,
        citations: result.hits.map((h) => ({
          sourceType: 'document' as const,
          documentId: h.documentId,
          documentName: h.documentName,
          documentVersionId: h.documentVersionId,
          chunkId: h.chunkId,
          position: h.position,
          score: Number(h.score.toFixed(4)),
          startOffset: h.startOffset,
          endOffset: h.endOffset,
          pageNumber: h.pageNumber,
        })),
      };
    },
  });

  registerTool({
    statusLabel: 'Searching the web…',
    definition: {
      name: 'web_search',
      description:
        'Search the public web for up-to-date external information. Not a substitute for Library or meeting content. Requires TAVILY_API_KEY when not in tests.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          maxResults: { type: 'number', description: '1–8 results, default 5' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    execute: async (input) => {
      const query = typeof input.query === 'string' ? input.query : '';
      if (!query.trim()) return { ok: false, data: { error: 'query is required' } };
      const maxResults = typeof input.maxResults === 'number' ? input.maxResults : 5;
      const results = await webSearch(query, maxResults);
      return { ok: true, data: { results } };
    },
  });

  registerTool({
    statusLabel: 'Listing meetings…',
    definition: {
      name: 'list_meetings',
      description:
        'List meetings/calls in the workspace with titles, dates, and short summaries. Use for "what meetings do we have?", recent calls inventory. Not for document library files.',
      input_schema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Optional title filter' },
          limit: { type: 'number', description: '1–50, default 20' },
        },
        additionalProperties: false,
      },
    },
    execute: async (input, ctx) => {
      const result = await listMeetings(ctx, {
        q: typeof input.q === 'string' ? input.q : undefined,
        limit: typeof input.limit === 'number' ? input.limit : undefined,
      });
      return { ok: true, data: result };
    },
  });

  registerTool({
    statusLabel: 'Loading meeting…',
    definition: {
      name: 'get_meeting_summary',
      description:
        'Get summary, participants, and commitments for one meeting by id or exact title.',
      input_schema: {
        type: 'object',
        properties: {
          meetingId: { type: 'string' },
          title: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    execute: async (input, ctx) => {
      const meeting = await getMeetingSummary(ctx, {
        meetingId: typeof input.meetingId === 'string' ? input.meetingId : undefined,
        title: typeof input.title === 'string' ? input.title : undefined,
      });
      if (!meeting) return { ok: false, data: { error: 'Meeting not found in this workspace' } };
      return { ok: true, data: meeting };
    },
  });

  registerTool({
    statusLabel: 'Searching meetings…',
    definition: {
      name: 'search_meetings',
      description:
        'Semantic search over meeting transcripts. Use for "what did we decide on the call?", speaker content. Prefer list_meetings for inventory. Not for Library files — use search_library.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          meetingIds: { type: 'array', items: { type: 'string' } },
          limit: { type: 'number' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    execute: async (input, ctx) => {
      const query = typeof input.query === 'string' ? input.query : '';
      if (!query.trim()) return { ok: false, data: { error: 'query is required' } };
      const result = await searchMeetings(ctx, {
        query,
        meetingIds: Array.isArray(input.meetingIds)
          ? input.meetingIds.filter((id): id is string => typeof id === 'string')
          : undefined,
        limit: typeof input.limit === 'number' ? input.limit : undefined,
      });
      return {
        ok: true,
        data: result,
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

  registerTool({
    statusLabel: 'Listing work items…',
    definition: {
      name: 'list_work_items',
      description:
        'List normalized work items (issues) from connected work systems (e.g. GitHub). Use for "what issues are open?" inventory.',
      input_schema: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          state: { type: 'string', description: 'open | closed' },
          limit: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
    execute: async (input, ctx) => {
      const data = await listWorkItemsTool(ctx, {
        q: typeof input.q === 'string' ? input.q : undefined,
        state: typeof input.state === 'string' ? input.state : undefined,
        limit: typeof input.limit === 'number' ? input.limit : undefined,
      });
      return { ok: true, data };
    },
  });

  registerTool({
    statusLabel: 'Loading work item…',
    definition: {
      name: 'get_work_item',
      description:
        'Get a work item by externalId (e.g. github:org/repo#12) or title. Live-fetches assignee/state from GitHub when connected so status is not stale.',
      input_schema: {
        type: 'object',
        properties: {
          externalId: { type: 'string' },
          title: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    execute: async (input, ctx) => {
      const item = await getWorkItemTool(ctx, {
        externalId: typeof input.externalId === 'string' ? input.externalId : undefined,
        title: typeof input.title === 'string' ? input.title : undefined,
      });
      if (!item) return { ok: false, data: { error: 'Work item not found' } };
      return { ok: true, data: item };
    },
  });
}

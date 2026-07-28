import type Anthropic from '@anthropic-ai/sdk';
import {
  getLibraryDocument,
  listLibraryDocuments,
  searchLibrary,
  type LibraryToolContext,
} from './library-tools';
import { webSearch } from './web-search';

export const AGENT_TOOL_DEFINITIONS: Anthropic.Messages.Tool[] = [
  {
    name: 'list_library_documents',
    description:
      'List documents in the workspace Library with one-line summaries. Use for inventory questions like "what is in my library?", overviews, or finding files by name fragment. Does not return full document bodies.',
    input_schema: {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          description: 'Optional case-insensitive name filter',
        },
        limit: {
          type: 'number',
          description: 'Max documents to return (1–100, default 50)',
        },
        folderId: {
          type: 'string',
          description: 'Optional folder id; omit for all folders, null for root only if supported by caller',
        },
      },
      additionalProperties: false,
    },
  },
  {
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
  {
    name: 'search_library',
    description:
      'Semantic search over current-version document chunks in the Library. Use for content questions. Prefer list_library_documents for inventory.',
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
  {
    name: 'web_search',
    description:
      'Search the public web for up-to-date external information. Not a substitute for Library content. Requires TAVILY_API_KEY when not in tests.',
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
];

export type ToolExecutionResult = {
  ok: boolean;
  /** JSON-serializable payload for the model */
  data: unknown;
  /** Optional citations derived from search_library */
  citations?: Array<{
    documentId: string;
    documentName: string;
    documentVersionId: string;
    chunkId: string;
    position: number;
    score: number;
    startOffset?: number | null;
    endOffset?: number | null;
    pageNumber?: number | null;
  }>;
};

export async function executeAgentTool(
  name: string,
  rawInput: unknown,
  ctx: LibraryToolContext,
): Promise<ToolExecutionResult> {
  const input = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Record<
    string,
    unknown
  >;

  try {
    switch (name) {
      case 'list_library_documents': {
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
      }
      case 'get_document_summary': {
        const doc = await getLibraryDocument(ctx, {
          documentId: typeof input.documentId === 'string' ? input.documentId : undefined,
          name: typeof input.name === 'string' ? input.name : undefined,
        });
        if (!doc) return { ok: false, data: { error: 'Document not found in this workspace' } };
        return { ok: true, data: doc };
      }
      case 'search_library': {
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
      }
      case 'web_search': {
        const query = typeof input.query === 'string' ? input.query : '';
        if (!query.trim()) return { ok: false, data: { error: 'query is required' } };
        const maxResults = typeof input.maxResults === 'number' ? input.maxResults : 5;
        const results = await webSearch(query, maxResults);
        return { ok: true, data: { results } };
      }
      default:
        return { ok: false, data: { error: `Unknown tool: ${name}` } };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool failed';
    return { ok: false, data: { error: message } };
  }
}

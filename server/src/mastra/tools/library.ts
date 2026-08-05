import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  getLibraryDocument,
  listLibraryDocuments,
  searchLibrary,
} from '../../modules/chat/agent/library-tools';
import { toolContextFromRequestContext } from '../request-context';

export const listLibraryDocumentsTool = createTool({
  id: 'list_library_documents',
  description:
    'List documents in the workspace Library with one-line summaries. Use for inventory questions like "what is in my library?", overviews, or finding files by name fragment. Does not return full document bodies.',
  inputSchema: z.object({
    q: z.string().optional().describe('Optional case-insensitive name filter'),
    limit: z.number().optional().describe('Max documents to return (1–100, default 50)'),
    folderId: z.string().nullable().optional().describe('Optional folder id; omit for all folders'),
  }),
  execute: async (input, { requestContext }) => {
    const ctx = toolContextFromRequestContext(requestContext);
    return listLibraryDocuments(ctx, {
      q: input.q,
      limit: input.limit,
      folderId: input.folderId === undefined ? undefined : input.folderId,
    });
  },
});

export const getDocumentSummaryTool = createTool({
  id: 'get_document_summary',
  description:
    'Get metadata and a short summary/preview for one Library document by id or exact name.',
  inputSchema: z.object({
    documentId: z.string().optional(),
    name: z.string().optional().describe('Exact document name (case-insensitive)'),
  }),
  execute: async (input, { requestContext }) => {
    const ctx = toolContextFromRequestContext(requestContext);
    const doc = await getLibraryDocument(ctx, {
      documentId: input.documentId,
      name: input.name,
    });
    if (!doc) {
      return { error: 'Document not found in this workspace' };
    }
    return doc;
  },
});

export const searchLibraryTool = createTool({
  id: 'search_library',
  description:
    'Semantic search over current-version document chunks in the Library. Use for content questions. Prefer list_library_documents for inventory. Does not search meetings — use search_meetings.',
  inputSchema: z.object({
    query: z.string().describe('Natural language search query'),
    documentIds: z.array(z.string()).optional().describe('Optional restrict to these document ids'),
    limit: z.number().optional().describe('Max hits (default 8)'),
  }),
  execute: async (input, { requestContext }) => {
    const ctx = toolContextFromRequestContext(requestContext);
    const query = input.query?.trim() ?? '';
    if (!query) return { error: 'query is required', hits: [] as const };
    const result = await searchLibrary(ctx, {
      query,
      documentIds: input.documentIds,
      limit: input.limit,
    });
    return {
      ...result,
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

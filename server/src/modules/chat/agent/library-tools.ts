import { RAG_MIN_SIMILARITY, RAG_TOP_K } from '@script/shared';
import { prisma } from '../../../db/prisma';
import { searchDocumentChunkVectors } from '../../../db/vector';
import { filterAccessibleResourceIds } from '../../clearance/clearance-service';
import { embedQuery } from '../../jobs/embeddings';
import { searchMemoryChunks } from '../../memory/memory-chunks';

export type LibraryToolContext = {
  workspaceId: string;
  userId?: string;
  /** Member clearance (Org-P9b / ADR 0014). Documents above this level are invisible. */
  maxClearanceLevel?: number;
  elevated?: boolean;
};

export type LibraryDocRow = {
  id: string;
  name: string;
  status: string;
  summary: string | null;
  folderId: string | null;
  mimeType: string;
  updatedAt: string;
  currentVersionNumber: number | null;
};

export async function listLibraryDocuments(
  ctx: LibraryToolContext,
  input: { q?: string; limit?: number; folderId?: string | null },
): Promise<{ total: number; documents: LibraryDocRow[] }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const maxClearance = ctx.maxClearanceLevel ?? 0;
  const candidates = await prisma.document.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      clearanceLevel: { lte: maxClearance },
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
      ...(input.q?.trim()
        ? { name: { contains: input.q.trim(), mode: 'insensitive' as const } }
        : {}),
    },
    orderBy: [{ name: 'asc' }],
    take: Math.min(limit * 4, 400),
    select: {
      id: true,
      name: true,
      status: true,
      summary: true,
      folderId: true,
      mimeType: true,
      updatedAt: true,
      clearanceLevel: true,
      visibility: true,
      currentVersion: { select: { versionNumber: true, summary: true } },
    },
  });
  const principal = ctx.userId
    ? {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        clearanceLevel: maxClearance,
        role: ctx.elevated ? ('admin' as const) : ('member' as const),
      }
    : null;
  const allowed = principal
    ? await filterAccessibleResourceIds({
        principal,
        resourceKind: 'document',
        candidates: candidates.map((c) => ({
          id: c.id,
          clearanceLevel: c.clearanceLevel,
          visibility: c.visibility,
        })),
      })
    : new Set(
        candidates.filter((c) => c.visibility === 'workspace').map((c) => c.id),
      );
  const rows = candidates.filter((c) => allowed.has(c.id)).slice(0, limit);
  const total = rows.length;

  return {
    total,
    documents: rows.map((row) => {
      const summary = row.summary || row.currentVersion?.summary || null;
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        summary,
        folderId: row.folderId,
        mimeType: row.mimeType,
        updatedAt: row.updatedAt.toISOString(),
        currentVersionNumber: row.currentVersion?.versionNumber ?? null,
      };
    }),
  };
}

function fallbackSummary(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length <= 240 ? one : `${one.slice(0, 237)}…`;
}

export async function getLibraryDocument(
  ctx: LibraryToolContext,
  input: { documentId?: string; name?: string },
): Promise<LibraryDocRow & { extractedPreview: string | null } | null> {
  const maxClearance = ctx.maxClearanceLevel ?? 0;
  const clearanceFilter = { clearanceLevel: { lte: maxClearance } };
  const row = input.documentId
    ? await prisma.document.findFirst({
        where: { id: input.documentId, workspaceId: ctx.workspaceId, ...clearanceFilter },
        select: {
          id: true,
          name: true,
          status: true,
          summary: true,
          folderId: true,
          mimeType: true,
          updatedAt: true,
          extractedText: true,
          currentVersion: { select: { versionNumber: true, summary: true, extractedText: true } },
        },
      })
    : input.name?.trim()
      ? await prisma.document.findFirst({
          where: {
            workspaceId: ctx.workspaceId,
            name: { equals: input.name.trim(), mode: 'insensitive' },
            ...clearanceFilter,
          },
          select: {
            id: true,
            name: true,
            status: true,
            summary: true,
            folderId: true,
            mimeType: true,
            updatedAt: true,
            extractedText: true,
            currentVersion: { select: { versionNumber: true, summary: true, extractedText: true } },
          },
        })
      : null;

  if (!row) return null;
  const full = row.extractedText || row.currentVersion?.extractedText || null;
  const summary =
    row.summary || row.currentVersion?.summary || fallbackSummary(full);
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    summary,
    folderId: row.folderId,
    mimeType: row.mimeType,
    updatedAt: row.updatedAt.toISOString(),
    currentVersionNumber: row.currentVersion?.versionNumber ?? null,
    extractedPreview: full ? full.slice(0, 1200) : null,
  };
}

export type SearchLibraryHit = {
  documentId: string;
  documentName: string;
  documentVersionId: string;
  chunkId: string;
  position: number;
  score: number;
  excerpt: string;
  startOffset: number | null;
  endOffset: number | null;
  pageNumber: number | null;
};

export async function searchLibrary(
  ctx: LibraryToolContext,
  input: { query: string; documentIds?: string[]; limit?: number },
): Promise<{ hits: SearchLibraryHit[] }> {
  const query = input.query.trim();
  if (!query) return { hits: [] };
  const limit = Math.min(Math.max(input.limit ?? RAG_TOP_K, 1), 20);
  const embedding = await embedQuery(query);
  const documentIds = input.documentIds?.filter(Boolean) ?? [];
  const maxClearance = ctx.maxClearanceLevel ?? 0;

  // Prefer unified MemoryChunk (ADR 0012); fall back to DocumentChunk for legacy rows.
  try {
    const memoryHits = await searchMemoryChunks({
      workspaceId: ctx.workspaceId,
      queryEmbedding: embedding,
      sourceType: 'document',
      documentIds: documentIds.length ? documentIds : undefined,
      limit,
      minSimilarity: RAG_MIN_SIMILARITY,
    });
    if (memoryHits.length > 0) {
      const ids = [
        ...new Set(
          memoryHits.map((h) => h.documentId).filter((id): id is string => Boolean(id)),
        ),
      ];
      const allowed = await prisma.document.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          id: { in: ids },
          clearanceLevel: { lte: maxClearance },
          status: 'ready',
        },
        select: { id: true },
      });
      const allowedSet = new Set(allowed.map((d) => d.id));
      const hits: SearchLibraryHit[] = memoryHits
        .filter((h) => h.documentId && allowedSet.has(h.documentId))
        .map((h) => ({
          documentId: h.documentId!,
          documentName: h.documentName ?? 'Document',
          documentVersionId: h.documentVersionId ?? '',
          chunkId: h.chunkId,
          position: h.position,
          score: h.score,
          excerpt: h.content.slice(0, 500),
          startOffset: h.startOffset,
          endOffset: h.endOffset,
          pageNumber: h.pageNumber,
        }));
      if (hits.length > 0) return { hits };
    }
  } catch {
    // table may not exist yet mid-migration
  }

  const rows = await searchDocumentChunkVectors({
    workspaceId: ctx.workspaceId,
    queryEmbedding: embedding,
    limit,
    maxClearanceLevel: maxClearance,
    documentIds: documentIds.length ? documentIds : undefined,
    userId: ctx.userId,
    elevated: ctx.elevated,
  });

  const hits = rows
    .map((row) => ({
      documentId: row.document_id,
      documentName: row.name,
      documentVersionId: row.document_version_id,
      chunkId: row.id,
      position: row.position,
      score: Math.max(0, Math.min(1, 1 - Number(row.distance))),
      excerpt: row.content.slice(0, 500),
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      pageNumber: row.page_number,
    }))
    .filter((h) => h.score >= RAG_MIN_SIMILARITY);

  return { hits };
}
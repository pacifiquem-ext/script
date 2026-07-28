import { Prisma } from '@prisma/client';
import { RAG_MIN_SIMILARITY, RAG_TOP_K } from '@script/shared';
import { prisma } from '../../../db/prisma';
import { embedQuery, vectorLiteral } from '../../jobs/embeddings';

export type LibraryToolContext = {
  workspaceId: string;
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
  const where = {
    workspaceId: ctx.workspaceId,
    ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
    ...(input.q?.trim()
      ? { name: { contains: input.q.trim(), mode: 'insensitive' as const } }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      take: limit,
      select: {
        id: true,
        name: true,
        status: true,
        summary: true,
        folderId: true,
        mimeType: true,
        updatedAt: true,
        currentVersion: { select: { versionNumber: true, summary: true } },
      },
    }),
  ]);

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
  const row = input.documentId
    ? await prisma.document.findFirst({
        where: { id: input.documentId, workspaceId: ctx.workspaceId },
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
  const vector = vectorLiteral(embedding);
  const documentIds = input.documentIds?.filter(Boolean) ?? [];

  type Row = {
    id: string;
    content: string;
    document_id: string;
    document_version_id: string;
    name: string;
    position: number;
    distance: number;
    start_offset: number | null;
    end_offset: number | null;
    page_number: number | null;
  };

  const rows =
    documentIds.length > 0
      ? await prisma.$queryRaw<Row[]>`
          SELECT c.id, c.content, c."documentId" as document_id,
                 c."documentVersionId" as document_version_id, d.name, c.position,
                 c."startOffset" as start_offset, c."endOffset" as end_offset,
                 c."pageNumber" as page_number,
                 (c.embedding <=> ${vector}::vector) as distance
          FROM "DocumentChunk" c
          JOIN "Document" d ON d.id = c."documentId"
          WHERE c."workspaceId" = ${ctx.workspaceId}
            AND d.status = 'ready'
            AND d."currentVersionId" IS NOT NULL
            AND c."documentVersionId" = d."currentVersionId"
            AND c.embedding IS NOT NULL
            AND d.id IN (${Prisma.join(documentIds)})
          ORDER BY c.embedding <=> ${vector}::vector
          LIMIT ${limit}
        `
      : await prisma.$queryRaw<Row[]>`
          SELECT c.id, c.content, c."documentId" as document_id,
                 c."documentVersionId" as document_version_id, d.name, c.position,
                 c."startOffset" as start_offset, c."endOffset" as end_offset,
                 c."pageNumber" as page_number,
                 (c.embedding <=> ${vector}::vector) as distance
          FROM "DocumentChunk" c
          JOIN "Document" d ON d.id = c."documentId"
          WHERE c."workspaceId" = ${ctx.workspaceId}
            AND d.status = 'ready'
            AND d."currentVersionId" IS NOT NULL
            AND c."documentVersionId" = d."currentVersionId"
            AND c.embedding IS NOT NULL
          ORDER BY c.embedding <=> ${vector}::vector
          LIMIT ${limit}
        `;

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

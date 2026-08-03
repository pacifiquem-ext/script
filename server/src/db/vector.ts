/**
 * Sole application seam for pgvector read/write.
 *
 * Prisma cannot express `vector` distance ops or assign Unsupported("vector") columns via the
 * typed client. Product modules must call this module — never prisma.$queryRaw / $executeRaw.
 *
 * DDL (HNSW indexes) stays in ensure-vector-indexes.ts; liveness ping stays in health routes.
 */
import { Prisma } from '@prisma/client';
import type { Prisma as PrismaNs } from '@prisma/client';
import { prisma } from './prisma';
import { vectorLiteral } from '../modules/jobs/embeddings';

type Tx = PrismaNs.TransactionClient | typeof prisma;

export async function setDocumentChunkEmbedding(
  db: Tx,
  chunkId: string,
  embedding: number[],
): Promise<void> {
  await db.$executeRaw`
    UPDATE "DocumentChunk"
    SET embedding = ${vectorLiteral(embedding)}::vector
    WHERE id = ${chunkId}
  `;
}

export async function setMemoryChunkEmbedding(
  db: Tx,
  chunkId: string,
  embedding: number[],
): Promise<void> {
  await db.$executeRaw`
    UPDATE "MemoryChunk"
    SET embedding = ${vectorLiteral(embedding)}::vector
    WHERE id = ${chunkId}
  `;
}

/** Copy embeddings from one document version's chunks to another by position. */
export async function copyDocumentChunkEmbeddingsByPosition(
  db: Tx,
  sourceVersionId: string,
  targetVersionId: string,
): Promise<void> {
  await db.$executeRaw`
    UPDATE "DocumentChunk" AS target
    SET embedding = source.embedding
    FROM "DocumentChunk" AS source
    WHERE target."documentVersionId" = ${targetVersionId}
      AND source."documentVersionId" = ${sourceVersionId}
      AND target.position = source.position
  `;
}

export type DocumentVectorHit = {
  id: string;
  content: string;
  document_id: string;
  document_version_id: string;
  name: string;
  position: number;
  start_offset: number | null;
  end_offset: number | null;
  page_number: number | null;
  distance: number;
};

/** Current-version document RAG search with clearance filter. */
export async function searchDocumentChunkVectors(input: {
  workspaceId: string;
  queryEmbedding: number[];
  limit: number;
  maxClearanceLevel: number;
  documentIds?: string[];
}): Promise<DocumentVectorHit[]> {
  const vector = vectorLiteral(input.queryEmbedding);
  const documentIds = input.documentIds?.filter(Boolean) ?? [];

  if (documentIds.length > 0) {
    return prisma.$queryRaw<DocumentVectorHit[]>`
      SELECT c.id, c.content, c."documentId" as document_id,
             c."documentVersionId" as document_version_id, d.name, c.position,
             c."startOffset" as start_offset, c."endOffset" as end_offset,
             c."pageNumber" as page_number,
             (c.embedding <=> ${vector}::vector) as distance
      FROM "DocumentChunk" c
      JOIN "Document" d ON d.id = c."documentId"
      WHERE c."workspaceId" = ${input.workspaceId}
        AND d.status = 'ready'
        AND d."currentVersionId" IS NOT NULL
        AND c."documentVersionId" = d."currentVersionId"
        AND c.embedding IS NOT NULL
        AND d."clearanceLevel" <= ${input.maxClearanceLevel}
        AND d.id IN (${Prisma.join(documentIds)})
      ORDER BY c.embedding <=> ${vector}::vector
      LIMIT ${input.limit}
    `;
  }

  return prisma.$queryRaw<DocumentVectorHit[]>`
    SELECT c.id, c.content, c."documentId" as document_id,
           c."documentVersionId" as document_version_id, d.name, c.position,
           c."startOffset" as start_offset, c."endOffset" as end_offset,
           c."pageNumber" as page_number,
           (c.embedding <=> ${vector}::vector) as distance
    FROM "DocumentChunk" c
    JOIN "Document" d ON d.id = c."documentId"
    WHERE c."workspaceId" = ${input.workspaceId}
      AND d.status = 'ready'
      AND d."currentVersionId" IS NOT NULL
      AND c."documentVersionId" = d."currentVersionId"
      AND c.embedding IS NOT NULL
      AND d."clearanceLevel" <= ${input.maxClearanceLevel}
    ORDER BY c.embedding <=> ${vector}::vector
    LIMIT ${input.limit}
  `;
}

export type MemoryVectorHit = {
  id: string;
  content: string;
  source_type: 'document' | 'meeting';
  position: number;
  distance: number;
  document_id: string | null;
  document_version_id: string | null;
  meeting_id: string | null;
  start_offset: number | null;
  end_offset: number | null;
  page_number: number | null;
  speaker: string | null;
  start_ms: number | null;
  end_ms: number | null;
  source_title: string;
};

export async function searchMemoryChunkVectors(input: {
  workspaceId: string;
  queryEmbedding: number[];
  limit: number;
  sourceType?: 'document' | 'meeting' | null;
  documentIds?: string[];
  meetingIds?: string[];
}): Promise<MemoryVectorHit[]> {
  const vector = vectorLiteral(input.queryEmbedding);
  const sourceType = input.sourceType ?? null;
  const documentIds = input.documentIds?.filter(Boolean) ?? [];
  const meetingIds = input.meetingIds?.filter(Boolean) ?? [];

  if (documentIds.length > 0) {
    return prisma.$queryRaw<MemoryVectorHit[]>`
      SELECT c.id, c.content, c."sourceType" as source_type, c.position,
             c."documentId" as document_id, c."documentVersionId" as document_version_id,
             c."meetingId" as meeting_id,
             c."startOffset" as start_offset, c."endOffset" as end_offset, c."pageNumber" as page_number,
             c.speaker, c."startMs" as start_ms, c."endMs" as end_ms,
             s.title as source_title,
             (c.embedding <=> ${vector}::vector) as distance
      FROM "MemoryChunk" c
      JOIN "MemorySource" s ON s.id = c."memorySourceId"
      WHERE c."workspaceId" = ${input.workspaceId}
        AND c.embedding IS NOT NULL
        AND (${sourceType}::"MemorySourceType" IS NULL OR c."sourceType" = ${sourceType}::"MemorySourceType")
        AND c."documentId" IN (${Prisma.join(documentIds)})
      ORDER BY c.embedding <=> ${vector}::vector
      LIMIT ${input.limit}
    `;
  }

  if (meetingIds.length > 0) {
    return prisma.$queryRaw<MemoryVectorHit[]>`
      SELECT c.id, c.content, c."sourceType" as source_type, c.position,
             c."documentId" as document_id, c."documentVersionId" as document_version_id,
             c."meetingId" as meeting_id,
             c."startOffset" as start_offset, c."endOffset" as end_offset, c."pageNumber" as page_number,
             c.speaker, c."startMs" as start_ms, c."endMs" as end_ms,
             s.title as source_title,
             (c.embedding <=> ${vector}::vector) as distance
      FROM "MemoryChunk" c
      JOIN "MemorySource" s ON s.id = c."memorySourceId"
      WHERE c."workspaceId" = ${input.workspaceId}
        AND c.embedding IS NOT NULL
        AND (${sourceType}::"MemorySourceType" IS NULL OR c."sourceType" = ${sourceType}::"MemorySourceType")
        AND c."meetingId" IN (${Prisma.join(meetingIds)})
      ORDER BY c.embedding <=> ${vector}::vector
      LIMIT ${input.limit}
    `;
  }

  if (sourceType) {
    return prisma.$queryRaw<MemoryVectorHit[]>`
      SELECT c.id, c.content, c."sourceType" as source_type, c.position,
             c."documentId" as document_id, c."documentVersionId" as document_version_id,
             c."meetingId" as meeting_id,
             c."startOffset" as start_offset, c."endOffset" as end_offset, c."pageNumber" as page_number,
             c.speaker, c."startMs" as start_ms, c."endMs" as end_ms,
             s.title as source_title,
             (c.embedding <=> ${vector}::vector) as distance
      FROM "MemoryChunk" c
      JOIN "MemorySource" s ON s.id = c."memorySourceId"
      WHERE c."workspaceId" = ${input.workspaceId}
        AND c.embedding IS NOT NULL
        AND c."sourceType" = ${sourceType}::"MemorySourceType"
      ORDER BY c.embedding <=> ${vector}::vector
      LIMIT ${input.limit}
    `;
  }

  return prisma.$queryRaw<MemoryVectorHit[]>`
    SELECT c.id, c.content, c."sourceType" as source_type, c.position,
           c."documentId" as document_id, c."documentVersionId" as document_version_id,
           c."meetingId" as meeting_id,
           c."startOffset" as start_offset, c."endOffset" as end_offset, c."pageNumber" as page_number,
           c.speaker, c."startMs" as start_ms, c."endMs" as end_ms,
           s.title as source_title,
           (c.embedding <=> ${vector}::vector) as distance
    FROM "MemoryChunk" c
    JOIN "MemorySource" s ON s.id = c."memorySourceId"
    WHERE c."workspaceId" = ${input.workspaceId}
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${vector}::vector
    LIMIT ${input.limit}
  `;
}

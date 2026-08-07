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

/**
 * Current-version document RAG with level clearance + restricted principal allow-list (ADR 0014).
 * When userId is null, restricted documents are excluded (except none).
 */
export async function searchDocumentChunkVectors(input: {
  workspaceId: string;
  queryEmbedding: number[];
  limit: number;
  maxClearanceLevel: number;
  documentIds?: string[];
  userId?: string | null;
  /** owner/admin bypass restricted principal checks */
  elevated?: boolean;
}): Promise<DocumentVectorHit[]> {
  const vector = vectorLiteral(input.queryEmbedding);
  const documentIds = input.documentIds?.filter(Boolean) ?? [];
  const userId = input.userId ?? null;
  const elevated = input.elevated === true;

  // Restricted: visibility=workspace OR elevated OR principal row exists for userId
  const restrictedClause = elevated
    ? Prisma.sql`TRUE`
    : userId
      ? Prisma.sql`(
          d.visibility = 'workspace'::"ResourceVisibility"
          OR EXISTS (
            SELECT 1 FROM "ResourcePrincipal" rp
            WHERE rp."workspaceId" = ${input.workspaceId}
              AND rp."resourceKind" = 'document'::"ResourceKind"
              AND rp."resourceId" = d.id
              AND rp."userId" = ${userId}
          )
        )`
      : Prisma.sql`d.visibility = 'workspace'::"ResourceVisibility"`;

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
        AND ${restrictedClause}
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
      AND ${restrictedClause}
    ORDER BY c.embedding <=> ${vector}::vector
    LIMIT ${input.limit}
  `;
}

export type MemorySourceTypeName = 'document' | 'meeting' | 'channel' | 'work_item' | 'workflow';

export type MemoryVectorHit = {
  id: string;
  content: string;
  source_type: MemorySourceTypeName;
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
  external_key: string | null;
};

function memoryClearanceSql(input: {
  workspaceId: string;
  maxClearanceLevel?: number;
  userId?: string | null;
  elevated?: boolean;
}): Prisma.Sql {
  if (input.maxClearanceLevel === undefined) return Prisma.sql`TRUE`;
  const maxClearance = input.maxClearanceLevel;
  const userId = input.userId ?? null;
  const elevated = input.elevated === true;

  const docRestricted = elevated
    ? Prisma.sql`TRUE`
    : userId
      ? Prisma.sql`(
          d.visibility = 'workspace'::"ResourceVisibility"
          OR EXISTS (
            SELECT 1 FROM "ResourcePrincipal" rp
            WHERE rp."workspaceId" = ${input.workspaceId}
              AND rp."resourceKind" = 'document'::"ResourceKind"
              AND rp."resourceId" = d.id
              AND rp."userId" = ${userId}
          )
        )`
      : Prisma.sql`d.visibility = 'workspace'::"ResourceVisibility"`;

  const meetingRestricted = elevated
    ? Prisma.sql`TRUE`
    : userId
      ? Prisma.sql`(
          m.visibility = 'workspace'::"ResourceVisibility"
          OR EXISTS (
            SELECT 1 FROM "ResourcePrincipal" rp
            WHERE rp."workspaceId" = ${input.workspaceId}
              AND rp."resourceKind" = 'meeting'::"ResourceKind"
              AND rp."resourceId" = m.id
              AND rp."userId" = ${userId}
          )
        )`
      : Prisma.sql`m.visibility = 'workspace'::"ResourceVisibility"`;

  return Prisma.sql`(
    (
      c."sourceType" <> 'document'::"MemorySourceType"
      OR (
        d.id IS NOT NULL
        AND d.status = 'ready'
        AND d."clearanceLevel" <= ${maxClearance}
        AND ${docRestricted}
      )
    )
    AND (
      c."sourceType" <> 'meeting'::"MemorySourceType"
      OR (
        m.id IS NOT NULL
        AND m."clearanceLevel" <= ${maxClearance}
        AND ${meetingRestricted}
      )
    )
  )`;
}

export async function searchMemoryChunkVectors(input: {
  workspaceId: string;
  queryEmbedding: number[];
  limit: number;
  sourceType?: MemorySourceTypeName | null;
  documentIds?: string[];
  meetingIds?: string[];
  maxClearanceLevel?: number;
  userId?: string | null;
  elevated?: boolean;
}): Promise<MemoryVectorHit[]> {
  const vector = vectorLiteral(input.queryEmbedding);
  const sourceType = input.sourceType ?? null;
  const documentIds = input.documentIds?.filter(Boolean) ?? [];
  const meetingIds = input.meetingIds?.filter(Boolean) ?? [];
  const clearance = memoryClearanceSql({
    workspaceId: input.workspaceId,
    maxClearanceLevel: input.maxClearanceLevel,
    userId: input.userId,
    elevated: input.elevated,
  });

  const selectSql = Prisma.sql`
    SELECT c.id, c.content, c."sourceType" as source_type, c.position,
           c."documentId" as document_id, c."documentVersionId" as document_version_id,
           c."meetingId" as meeting_id,
           c."startOffset" as start_offset, c."endOffset" as end_offset, c."pageNumber" as page_number,
           c.speaker, c."startMs" as start_ms, c."endMs" as end_ms,
           s.title as source_title, s."externalKey" as external_key,
           (c.embedding <=> ${vector}::vector) as distance
    FROM "MemoryChunk" c
    JOIN "MemorySource" s ON s.id = c."memorySourceId"
    LEFT JOIN "Document" d ON d.id = c."documentId" AND c."sourceType" = 'document'::"MemorySourceType"
    LEFT JOIN "Meeting" m ON m.id = c."meetingId" AND c."sourceType" = 'meeting'::"MemorySourceType"
  `;

  if (documentIds.length > 0) {
    return prisma.$queryRaw<MemoryVectorHit[]>`
      ${selectSql}
      WHERE c."workspaceId" = ${input.workspaceId}
        AND c.embedding IS NOT NULL
        AND (${sourceType}::"MemorySourceType" IS NULL OR c."sourceType" = ${sourceType}::"MemorySourceType")
        AND c."documentId" IN (${Prisma.join(documentIds)})
        AND ${clearance}
      ORDER BY c.embedding <=> ${vector}::vector
      LIMIT ${input.limit}
    `;
  }

  if (meetingIds.length > 0) {
    return prisma.$queryRaw<MemoryVectorHit[]>`
      ${selectSql}
      WHERE c."workspaceId" = ${input.workspaceId}
        AND c.embedding IS NOT NULL
        AND (${sourceType}::"MemorySourceType" IS NULL OR c."sourceType" = ${sourceType}::"MemorySourceType")
        AND c."meetingId" IN (${Prisma.join(meetingIds)})
        AND ${clearance}
      ORDER BY c.embedding <=> ${vector}::vector
      LIMIT ${input.limit}
    `;
  }

  if (sourceType) {
    return prisma.$queryRaw<MemoryVectorHit[]>`
      ${selectSql}
      WHERE c."workspaceId" = ${input.workspaceId}
        AND c.embedding IS NOT NULL
        AND c."sourceType" = ${sourceType}::"MemorySourceType"
        AND ${clearance}
      ORDER BY c.embedding <=> ${vector}::vector
      LIMIT ${input.limit}
    `;
  }

  return prisma.$queryRaw<MemoryVectorHit[]>`
    ${selectSql}
    WHERE c."workspaceId" = ${input.workspaceId}
      AND c.embedding IS NOT NULL
      AND ${clearance}
    ORDER BY c.embedding <=> ${vector}::vector
    LIMIT ${input.limit}
  `;
}

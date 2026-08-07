import type { MemorySourceType } from '@script/shared';
import { prisma } from '../../db/prisma';
import {
  searchMemoryChunkVectors,
  setMemoryChunkEmbedding,
  type MemorySourceTypeName,
} from '../../db/vector';

export type TextChunk = {
  content: string;
  startOffset?: number | null;
  endOffset?: number | null;
  pageNumber?: number | null;
};

export async function ensureDocumentMemorySource(input: {
  workspaceId: string;
  documentId: string;
  title: string;
}): Promise<string> {
  const existing = await prisma.memorySource.findUnique({
    where: { documentId: input.documentId },
  });
  if (existing) {
    if (existing.title !== input.title) {
      await prisma.memorySource.update({
        where: { id: existing.id },
        data: { title: input.title },
      });
    }
    return existing.id;
  }
  const created = await prisma.memorySource.create({
    data: {
      workspaceId: input.workspaceId,
      type: 'document',
      title: input.title,
      documentId: input.documentId,
    },
  });
  return created.id;
}

export async function dualWriteDocumentMemoryChunks(input: {
  workspaceId: string;
  documentId: string;
  documentVersionId: string;
  title: string;
  chunks: TextChunk[];
  embeddings: number[][];
}): Promise<void> {
  const memorySourceId = await ensureDocumentMemorySource({
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    title: input.title,
  });

  await prisma.$transaction(async (tx) => {
    await tx.memoryChunk.deleteMany({
      where: { memorySourceId, documentVersionId: input.documentVersionId },
    });
    await tx.memoryChunk.deleteMany({
      where: {
        documentId: input.documentId,
        NOT: { documentVersionId: input.documentVersionId },
      },
    });
    if (input.chunks.length === 0) return;
    await tx.memoryChunk.createMany({
      data: input.chunks.map((chunk, i) => ({
        memorySourceId,
        workspaceId: input.workspaceId,
        sourceType: 'document' as const,
        position: i,
        content: chunk.content,
        documentId: input.documentId,
        documentVersionId: input.documentVersionId,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        pageNumber: chunk.pageNumber,
      })),
    });
    const rows = await tx.memoryChunk.findMany({
      where: { memorySourceId, documentVersionId: input.documentVersionId },
      select: { id: true, position: true },
      orderBy: { position: 'asc' },
    });
    for (const row of rows) {
      const embedding = input.embeddings[row.position];
      if (!embedding) throw new Error(`Missing embedding for memory chunk ${row.position}`);
      await setMemoryChunkEmbedding(tx, row.id, embedding);
    }
  });
}

export type MemorySearchHit = {
  chunkId: string;
  content: string;
  sourceType: MemorySourceType;
  position: number;
  score: number;
  documentId: string | null;
  documentVersionId: string | null;
  documentName: string | null;
  meetingId: string | null;
  meetingTitle: string | null;
  sourceTitle: string | null;
  workItemId: string | null;
  workflowId: string | null;
  href?: string;
  startOffset: number | null;
  endOffset: number | null;
  pageNumber: number | null;
  speaker: string | null;
  startMs: number | null;
  endMs: number | null;
};

function hrefForHit(row: {
  source_type: MemorySourceTypeName;
  meeting_id: string | null;
  external_key: string | null;
}): string | undefined {
  if (row.source_type === 'meeting' && row.meeting_id) {
    return `/app/meetings?id=${encodeURIComponent(row.meeting_id)}`;
  }
  if (row.source_type === 'workflow' && row.external_key) {
    return `/app/workflows?id=${encodeURIComponent(row.external_key)}`;
  }
  if (row.source_type === 'work_item' && row.external_key?.startsWith('github:')) {
    const m = row.external_key.match(/^github:([^/]+\/[^#]+)#(\d+)$/);
    if (m) return `https://github.com/${m[1]}/issues/${m[2]}`;
  }
  return undefined;
}

export async function searchMemoryChunks(input: {
  workspaceId: string;
  queryEmbedding: number[];
  sourceType?: MemorySourceTypeName;
  documentIds?: string[];
  meetingIds?: string[];
  limit: number;
  minSimilarity: number;
  maxClearanceLevel?: number;
  userId?: string;
  elevated?: boolean;
}): Promise<MemorySearchHit[]> {
  try {
    const rows = await searchMemoryChunkVectors({
      workspaceId: input.workspaceId,
      queryEmbedding: input.queryEmbedding,
      limit: input.limit,
      sourceType: input.sourceType ?? null,
      documentIds: input.documentIds,
      meetingIds: input.meetingIds,
      maxClearanceLevel: input.maxClearanceLevel,
      userId: input.userId,
      elevated: input.elevated,
    });
    return rows
      .map((row) => ({
        chunkId: row.id,
        content: row.content,
        sourceType: row.source_type,
        position: row.position,
        score: Math.max(0, Math.min(1, 1 - Number(row.distance))),
        documentId: row.document_id,
        documentVersionId: row.document_version_id,
        documentName: row.source_type === 'document' ? row.source_title : null,
        meetingId: row.meeting_id,
        meetingTitle: row.source_type === 'meeting' ? row.source_title : null,
        sourceTitle: row.source_title,
        workItemId: row.source_type === 'work_item' ? row.external_key : null,
        workflowId: row.source_type === 'workflow' ? row.external_key : null,
        href: hrefForHit(row),
        startOffset: row.start_offset,
        endOffset: row.end_offset,
        pageNumber: row.page_number,
        speaker: row.speaker,
        startMs: row.start_ms,
        endMs: row.end_ms,
      }))
      .filter((h) => h.score >= input.minSimilarity);
  } catch {
    return [];
  }
}

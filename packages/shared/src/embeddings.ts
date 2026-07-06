import { z } from 'zod';
import {
  CHUNK_OVERLAP_CHARS,
  CHUNK_SIZE_CHARS,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EMBEDDING_PROVIDER,
  VOYAGE_EMBED_BATCH_SIZE,
} from './constants';

export interface EmbeddingModelConfig {
  provider: typeof EMBEDDING_PROVIDER;
  model: typeof EMBEDDING_MODEL;
  dimensions: typeof EMBEDDING_DIMENSIONS;
  batchSize: typeof VOYAGE_EMBED_BATCH_SIZE;
  chunkSizeChars: typeof CHUNK_SIZE_CHARS;
  chunkOverlapChars: typeof CHUNK_OVERLAP_CHARS;
}

export const currentEmbeddingModel: EmbeddingModelConfig = {
  provider: EMBEDDING_PROVIDER,
  model: EMBEDDING_MODEL,
  dimensions: EMBEDDING_DIMENSIONS,
  batchSize: VOYAGE_EMBED_BATCH_SIZE,
  chunkSizeChars: CHUNK_SIZE_CHARS,
  chunkOverlapChars: CHUNK_OVERLAP_CHARS,
};

/** Documents whose embeddingModel/dimensions differ need the backfill job (ADR 0001). */
export function needsEmbeddingBackfill(doc: {
  embeddingModel: string | null;
  embeddingDimensions: number | null;
  status: string;
}): boolean {
  if (doc.status !== 'ready') return false;
  return (
    doc.embeddingModel !== currentEmbeddingModel.model ||
    doc.embeddingDimensions !== currentEmbeddingModel.dimensions
  );
}

export const backfillBodySchema = z.union([
  z.object({ documentId: z.string().min(1) }),
  z.object({ workspaceId: z.string().min(1) }),
  z.object({ all: z.literal(true) }),
]);
export type BackfillBody = z.infer<typeof backfillBodySchema>;

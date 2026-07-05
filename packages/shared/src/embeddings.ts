import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, EMBEDDING_PROVIDER } from './constants';

export interface EmbeddingModelConfig {
  provider: typeof EMBEDDING_PROVIDER;
  model: typeof EMBEDDING_MODEL;
  dimensions: typeof EMBEDDING_DIMENSIONS;
}

export const currentEmbeddingModel: EmbeddingModelConfig = {
  provider: EMBEDDING_PROVIDER,
  model: EMBEDDING_MODEL,
  dimensions: EMBEDDING_DIMENSIONS,
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

import { EMBEDDING_DIMENSIONS } from '@script/shared';
import { ConfigurationError } from '../../common/errors';
import { env } from '../../config/env';
import {
  createConfiguredEmbedder,
  type Embedder,
  type EmbedInputType,
} from '../ai/embeddings-provider';

export type { Embedder, EmbedInputType };

function assertEmbedding(vector: number[] | undefined, index: number): number[] {
  if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Voyage returned invalid embedding at index ${index}: expected ${EMBEDDING_DIMENSIONS} dimensions`,
    );
  }
  if (vector.some((v) => typeof v !== 'number' || Number.isNaN(v))) {
    throw new Error(`Voyage returned non-numeric embedding at index ${index}`);
  }
  return vector;
}

function testEmbed(text: string): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const idx = Math.abs(hash) % EMBEDDING_DIMENSIONS;
  vector[idx] = 1;
  return vector;
}

const testEmbedder: Embedder = {
  embedTexts: async (texts) => texts.map((t) => testEmbed(t)),
  embedQuery: async (text) => testEmbed(text),
};

function defaultEmbedder(): Embedder {
  if (env.NODE_ENV === 'test') return testEmbedder;
  return createConfiguredEmbedder();
}

let embedder: Embedder = defaultEmbedder();

export function setEmbedderForTests(next: Embedder | null) {
  if (env.NODE_ENV !== 'test') {
    throw new Error('setEmbedderForTests is only available in test');
  }
  embedder = next ?? testEmbedder;
}

export async function embedTexts(
  texts: string[],
  inputType: EmbedInputType = 'document',
): Promise<number[][]> {
  if (env.NODE_ENV !== 'test') {
    if (env.EMBEDDING_PROVIDER === 'voyage' && !env.VOYAGE_API_KEY) {
      throw new ConfigurationError(
        'VOYAGE_API_KEY is required for embeddings. Add it to server/.env (see ENV.md).',
      );
    }
    if (env.EMBEDDING_PROVIDER === 'openai_compatible' && !env.EMBEDDING_BASE_URL) {
      throw new ConfigurationError(
        'EMBEDDING_BASE_URL is required when EMBEDDING_PROVIDER=openai_compatible.',
      );
    }
  }
  return embedder.embedTexts(texts, inputType);
}

export async function embedQuery(text: string): Promise<number[]> {
  if (env.NODE_ENV !== 'test') {
    if (env.EMBEDDING_PROVIDER === 'voyage' && !env.VOYAGE_API_KEY) {
      throw new ConfigurationError(
        'VOYAGE_API_KEY is required for query embedding. Add it to server/.env (see ENV.md).',
      );
    }
  }
  return embedder.embedQuery(text);
}

export function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

export function validateEmbeddingDimensions(values: number[]): void {
  assertEmbedding(values, 0);
}

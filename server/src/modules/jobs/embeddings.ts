import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  VOYAGE_EMBED_BATCH_SIZE,
} from '@script/shared';
import { ConfigurationError } from '../../common/errors';
import { env, requireVoyageApiKey } from '../../config/env';
import { logger } from '../../lib/logger';

export type EmbedInputType = 'document' | 'query';

export interface Embedder {
  embedTexts(texts: string[], inputType?: EmbedInputType): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function voyageEmbed(texts: string[], inputType: EmbedInputType): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = requireVoyageApiKey();
  const vectors: number[][] = new Array(texts.length);
  for (let start = 0; start < texts.length; start += VOYAGE_EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + VOYAGE_EMBED_BATCH_SIZE);
    let attempt = 0;
    while (true) {
      attempt += 1;
      const response = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: batch,
          model: EMBEDDING_MODEL,
          input_type: inputType,
          output_dimension: EMBEDDING_DIMENSIONS,
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          data: Array<{ embedding: number[]; index: number }>;
        };
        if (!payload.data || payload.data.length !== batch.length) {
          throw new Error(
            `Voyage returned ${payload.data?.length ?? 0} embeddings for batch of ${batch.length}`,
          );
        }
        const sorted = [...payload.data].sort((a, b) => a.index - b.index);
        for (let i = 0; i < sorted.length; i += 1) {
          vectors[start + i] = assertEmbedding(sorted[i]?.embedding, start + i);
        }
        logger.info(
          { batchSize: batch.length, inputType, model: EMBEDDING_MODEL },
          'voyage embeddings batch ok',
        );
        break;
      }
      const body = await response.text();
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= 4) {
        throw new Error(`Voyage embeddings failed: ${response.status} ${body.slice(0, 500)}`);
      }
      const delay = Math.min(8000, 500 * 2 ** (attempt - 1));
      logger.warn(
        { status: response.status, attempt, delay, inputType },
        'voyage embeddings retry',
      );
      await sleep(delay);
    }
  }
  return vectors as number[][];
}

const voyageEmbedder: Embedder = {
  embedTexts: (texts, inputType = 'document') => voyageEmbed(texts, inputType),
  embedQuery: async (text) => {
    const [vector] = await voyageEmbed([text], 'query');
    return assertEmbedding(vector, 0);
  },
};

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

let embedder: Embedder =
  env.NODE_ENV === 'test' && !env.VOYAGE_API_KEY ? testEmbedder : voyageEmbedder;

export function setEmbedderForTests(next: Embedder | null) {
  if (env.NODE_ENV !== 'test') {
    throw new Error('setEmbedderForTests is only available in test');
  }
  embedder = next ?? (env.VOYAGE_API_KEY ? voyageEmbedder : testEmbedder);
}

export async function embedTexts(
  texts: string[],
  inputType: EmbedInputType = 'document',
): Promise<number[][]> {
  if (env.NODE_ENV !== 'test' && !env.VOYAGE_API_KEY) {
    throw new ConfigurationError(
      'VOYAGE_API_KEY is required for embeddings. Add it to server/.env (see ENV.md).',
    );
  }
  return embedder.embedTexts(texts, inputType);
}

export async function embedQuery(text: string): Promise<number[]> {
  if (env.NODE_ENV !== 'test' && !env.VOYAGE_API_KEY) {
    throw new ConfigurationError(
      'VOYAGE_API_KEY is required for query embedding. Add it to server/.env (see ENV.md).',
    );
  }
  return embedder.embedQuery(text);
}

export function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

export function validateEmbeddingDimensions(values: number[]): void {
  assertEmbedding(values, 0);
}

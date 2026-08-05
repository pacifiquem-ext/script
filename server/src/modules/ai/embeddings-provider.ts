import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, VOYAGE_EMBED_BATCH_SIZE } from '@script/shared';
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
      `Embedder returned invalid embedding at index ${index}: expected ${EMBEDDING_DIMENSIONS} dimensions`,
    );
  }
  if (vector.some((v) => typeof v !== 'number' || Number.isNaN(v))) {
    throw new Error(`Embedder returned non-numeric embedding at index ${index}`);
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
        break;
      }
      const body = await response.text();
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= 4) {
        throw new Error(`Voyage embeddings failed: ${response.status} ${body.slice(0, 200)}`);
      }
      await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)));
    }
  }
  return vectors as number[][];
}

async function openAiCompatibleEmbed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const base = env.EMBEDDING_BASE_URL?.replace(/\/$/, '');
  if (!base) {
    throw new ConfigurationError('EMBEDDING_BASE_URL is required for openai_compatible embeddings');
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.EMBEDDING_API_KEY) {
    headers.Authorization = `Bearer ${env.EMBEDDING_API_KEY}`;
  }
  const model = env.EMBEDDING_MODEL ?? 'nomic-embed-text';
  const response = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, input: texts }),
  });
  if (!response.ok) {
    const body = await response.text();
    logger.error(
      { status: response.status, body: body.slice(0, 200) },
      'openai-compatible embed failed',
    );
    throw new Error(`Embeddings failed: ${response.status} ${body.slice(0, 200)}`);
  }
  const payload = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };
  const sorted = [...(payload.data ?? [])].sort((a, b) => a.index - b.index);
  return sorted.map((row, i) => {
    const vec = row.embedding;
    if (vec.length === EMBEDDING_DIMENSIONS) return assertEmbedding(vec, i);
    // Pad/truncate to configured dimensions so pgvector column stays consistent.
    if (vec.length > EMBEDDING_DIMENSIONS) return vec.slice(0, EMBEDDING_DIMENSIONS);
    return [...vec, ...Array.from({ length: EMBEDDING_DIMENSIONS - vec.length }, () => 0)];
  });
}

export function createConfiguredEmbedder(): Embedder {
  if (env.EMBEDDING_PROVIDER === 'openai_compatible') {
    return {
      embedTexts: async (texts) => openAiCompatibleEmbed(texts),
      embedQuery: async (text) => {
        const [v] = await openAiCompatibleEmbed([text]);
        return assertEmbedding(v, 0);
      },
    };
  }
  return {
    embedTexts: (texts, inputType = 'document') => voyageEmbed(texts, inputType),
    embedQuery: async (text) => {
      const [vector] = await voyageEmbed([text], 'query');
      return assertEmbedding(vector, 0);
    },
  };
}

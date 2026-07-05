import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from '@script/shared';
import { env } from '../../config/env';

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!env.VOYAGE_API_KEY) {
    return texts.map((text) => pseudoEmbed(text));
  }
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: texts,
      model: EMBEDDING_MODEL,
      input_type: 'document',
      output_dimension: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Voyage embeddings failed: ${response.status} ${body}`);
  }
  const payload = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };
  return payload.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedQuery(text: string): Promise<number[]> {
  if (!env.VOYAGE_API_KEY) return pseudoEmbed(text);
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: [text],
      model: EMBEDDING_MODEL,
      input_type: 'query',
      output_dimension: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Voyage query embedding failed: ${response.status} ${body}`);
  }
  const payload = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return payload.data[0]!.embedding;
}

function pseudoEmbed(text: string): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  for (let i = 0; i < text.length; i += 1) {
    const idx = text.charCodeAt(i) % EMBEDDING_DIMENSIONS;
    vector[idx] = (vector[idx] ?? 0) + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

export function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

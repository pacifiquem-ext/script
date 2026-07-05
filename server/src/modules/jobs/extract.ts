import mammoth from 'mammoth';
// pdf-parse v2 exports differently across builds; use dynamic require for CJS interop.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (
  buffer: Buffer,
) => Promise<{ text: string; numpages?: number }>;
import { env } from '../../config/env';

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<{ text: string; pageCount: number | null }> {
  const lower = filename.toLowerCase();
  if (mimeType.includes('pdf') || lower.endsWith('.pdf')) {
    const parse =
      typeof pdfParse === 'function'
        ? pdfParse
        : (pdfParse as { default: typeof pdfParse }).default;
    const result = await parse(buffer);
    return { text: result.text?.trim() || '', pageCount: result.numpages ?? null };
  }
  if (
    mimeType.includes('word') ||
    lower.endsWith('.docx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value?.trim() || '', pageCount: null };
  }
  if (
    mimeType.startsWith('text/') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.csv')
  ) {
    return { text: buffer.toString('utf8').trim(), pageCount: null };
  }
  if (env.UNSTRUCTURED_API_KEY && env.UNSTRUCTURED_API_URL) {
    const form = new FormData();
    form.append('files', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
    const response = await fetch(
      `${env.UNSTRUCTURED_API_URL.replace(/\/$/, '')}/general/v0/general`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.UNSTRUCTURED_API_KEY}` },
        body: form,
      },
    );
    if (!response.ok) throw new Error(`Unstructured API failed: ${response.status}`);
    const payload = (await response.json()) as Array<{ text?: string }>;
    return {
      text: payload
        .map((p) => p.text ?? '')
        .join('\n')
        .trim(),
      pageCount: null,
    };
  }
  throw new Error(`Unsupported file type for extraction: ${mimeType || filename}`);
}

export function chunkText(text: string, chunkSize = 1200, overlap = 200): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + chunkSize);
    chunks.push(normalized.slice(start, end));
    if (end >= normalized.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

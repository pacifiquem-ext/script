import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { PDFParse } from 'pdf-parse';
import { CHUNK_OVERLAP_CHARS, CHUNK_SIZE_CHARS, normalizeDocumentText } from '@script/shared';
import { env } from '../../config/env';

export interface TextChunk {
  content: string;
  startOffset: number;
  endOffset: number;
  pageNumber: number | null;
}

async function extractPdfText(buffer: Buffer): Promise<{ text: string; pageCount: number | null }> {
  // pdfjs may transfer TypedArrays to a worker. Node pooled Buffers and parallel
  // getText/getInfo on the same payload trigger DataCloneError on Node 21+.
  const data = new Uint8Array(buffer.byteLength);
  data.set(buffer);
  const parser = new PDFParse({ data });
  try {
    const textResult = await parser.getText();
    const info = await parser.getInfo();
    return {
      text: textResult.text?.trim() || '',
      pageCount: typeof info.total === 'number' ? info.total : null,
    };
  } finally {
    await parser.destroy();
  }
}

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<{ text: string; pageCount: number | null }> {
  const lower = filename.toLowerCase();
  const mime = mimeType.toLowerCase();

  if (mime.includes('pdf') || lower.endsWith('.pdf')) {
    return extractPdfText(buffer);
  }

  if (
    mime.includes('word') ||
    lower.endsWith('.docx') ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value?.trim() || '', pageCount: null };
  }

  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel'
  ) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const parts: string[] = [];
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      parts.push(`# ${name}`);
      parts.push(XLSX.utils.sheet_to_csv(sheet));
    }
    return { text: parts.join('\n').trim(), pageCount: workbook.SheetNames.length || null };
  }

  if (
    mime.startsWith('text/') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.csv')
  ) {
    return { text: buffer.toString('utf8').trim(), pageCount: null };
  }

  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(lower)) {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    try {
      const {
        data: { text },
      } = await worker.recognize(buffer);
      return { text: text?.trim() || '', pageCount: 1 };
    } finally {
      await worker.terminate();
    }
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

/**
 * Character-window chunking with overlap (see docs/chunking.md).
 * Splits on paragraph boundaries when a window end falls near a blank line.
 */
export function chunkText(
  text: string,
  chunkSize = CHUNK_SIZE_CHARS,
  overlap = CHUNK_OVERLAP_CHARS,
): TextChunk[] {
  // Offsets are relative to the same normalized body stored as extractedText.
  const normalized = normalizeDocumentText(text);
  if (!normalized) return [];
  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + chunkSize);
    if (end < normalized.length) {
      const window = normalized.slice(start, end);
      const paraBreak = window.lastIndexOf('\n\n');
      if (paraBreak >= Math.floor(chunkSize * 0.4)) {
        end = start + paraBreak + 2;
      }
    }
    const raw = normalized.slice(start, end);
    const content = raw.trim();
    if (content) {
      const lead = raw.indexOf(content);
      const absStart = start + Math.max(0, lead);
      chunks.push({
        content,
        startOffset: absStart,
        endOffset: absStart + content.length,
        pageNumber: null,
      });
    }
    if (end >= normalized.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

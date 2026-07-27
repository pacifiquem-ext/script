import { describe, expect, it } from 'vitest';
import {
  humanizeIngestionFailure,
  refineCitationRange,
  normalizeDocumentText,
} from '../src/citations';

describe('humanizeIngestionFailure', () => {
  it('rewrites Voyage payment / rate-limit dumps', () => {
    const raw =
      'Voyage embeddings failed: 429 {"detail":"You have not yet added your payment method in the billing page and will have reduced rate limits of 3 RPM and 10K TPM."}';
    expect(humanizeIngestionFailure(raw)).toBe(
      'Processing failed due to low embedding tokens. Buy more credits or contact support.',
    );
  });

  it('rewrites insufficient credits', () => {
    expect(humanizeIngestionFailure('Insufficient credits')).toBe(
      'Processing failed due to low credits. Buy more credits or contact support.',
    );
  });

  it('passes short plain errors through', () => {
    expect(humanizeIngestionFailure('No text could be extracted from document')).toBe(
      'No text could be extracted from document',
    );
  });
});

describe('refineCitationRange', () => {
  const doc = [
    '# File storage',
    '',
    'Intro paragraph about the StorageDriver interface and adapters.',
    '',
    '## Env variables',
    '',
    '```',
    'STORAGE_DRIVER=uploadthing',
    'UPLOADTHING_TOKEN=…',
    'S3_ENDPOINT=http://127.0.0.1:3900',
    '```',
    '',
    'Long trailing notes that should not be highlighted when the model only cites env vars.',
    'More trailing text '.repeat(20),
  ].join('\n');

  it('narrows a large window to the env block when the hint mentions those vars', () => {
    const refined = refineCitationRange(doc, 0, doc.length, 'set STORAGE_DRIVER and UPLOADTHING_TOKEN [4]');
    const mid = doc.slice(refined.startOffset, refined.endOffset);
    expect(mid).toContain('STORAGE_DRIVER');
    expect(mid.length).toBeLessThan(doc.length / 2);
    expect(mid).not.toContain('Long trailing notes that should not');
  });

  it('keeps short ranges intact', () => {
    const refined = refineCitationRange(doc, 0, 20, null);
    expect(refined).toEqual({ startOffset: 0, endOffset: 20 });
  });
});

describe('normalizeDocumentText', () => {
  it('normalizes CRLF and trims', () => {
    expect(normalizeDocumentText('\r\nhello\r\n')).toBe('hello');
  });
});

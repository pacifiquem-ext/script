import { describe, expect, it } from 'vitest';
import type { MessageCitation } from '@script/shared';
import {
  citationContextHint,
  citationFromIndex,
  linkifyCitationMarkers,
  parseCitationHref,
  uniqueSourceChips,
} from '../lib/citations';

const sample: MessageCitation[] = [
  {
    documentId: 'd1',
    documentName: 'api.md',
    chunkId: 'c1',
    position: 0,
    score: 0.9,
    startOffset: 10,
    endOffset: 40,
  },
  {
    documentId: 'd2',
    documentName: 'storage.md',
    chunkId: 'c2',
    position: 1,
    score: 0.8,
    startOffset: 0,
    endOffset: 20,
  },
  {
    documentId: 'd2',
    documentName: 'storage.md',
    chunkId: 'c3',
    position: 2,
    score: 0.95,
    startOffset: 50,
    endOffset: 80,
  },
  {
    documentId: 'd1',
    documentName: 'api.md',
    chunkId: 'c4',
    position: 3,
    score: 0.7,
  },
];

describe('citations helpers', () => {
  it('linkifies [n] without breaking markdown links', () => {
    const input = 'See [1] and [2] plus [docs](https://example.com) and [[ok]].';
    const out = linkifyCitationMarkers(input);
    expect(out).toContain('[1](#cite-1)');
    expect(out).toContain('[2](#cite-2)');
    expect(out).toContain('[docs](https://example.com)');
    expect(out).not.toContain('[#cite-');
  });

  it('resolves citation index and href', () => {
    expect(citationFromIndex(sample, 2)?.documentName).toBe('storage.md');
    expect(citationFromIndex(sample, 99)).toBeNull();
    expect(parseCitationHref('#cite-3')).toBe(3);
    expect(parseCitationHref('citation:3')).toBe(3);
    expect(parseCitationHref('https://x.com')).toBeNull();
  });

  it('dedupes source chips by document', () => {
    const chips = uniqueSourceChips(sample);
    expect(chips).toHaveLength(2);
    expect(chips[0]?.documentName).toBe('api.md');
    expect(chips[0]?.indices).toEqual([1, 4]);
    expect(chips[1]?.documentName).toBe('storage.md');
    expect(chips[1]?.indices).toEqual([2, 3]);
    // best chunk is highest score for storage
    expect(chips[1]?.best.chunkId).toBe('c3');
  });

  it('extracts a local hint around a citation marker', () => {
    const content = 'Intro about storage.\n\nUse `STORAGE_DRIVER=s3` [4] for Garage.\n\nFooter.';
    const hint = citationContextHint(content, 4);
    expect(hint).toContain('STORAGE_DRIVER');
    expect(hint).toContain('[4]');
  });
});

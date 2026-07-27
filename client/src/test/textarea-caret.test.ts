import { describe, expect, it } from 'vitest';
import { splitMentionSegments } from '../lib/textarea-caret';

describe('splitMentionSegments', () => {
  it('highlights known document mentions', () => {
    const parts = splitMentionSegments('See @brief.pdf for context', ['brief.pdf', 'other.txt']);
    expect(parts).toEqual([
      { text: 'See ', mention: false },
      { text: '@brief.pdf', mention: true },
      { text: ' for context', mention: false },
    ]);
  });

  it('prefers the longest matching document name', () => {
    const parts = splitMentionSegments('@report final.pdf done', [
      'report',
      'report final.pdf',
    ]);
    expect(parts[0]).toEqual({ text: '@report final.pdf', mention: true });
  });
});

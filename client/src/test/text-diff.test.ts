import { describe, expect, it } from 'vitest';
import { diffLines, diffStats } from '../lib/text-diff';

describe('diffLines', () => {
  it('marks equal, added, and removed lines', () => {
    const left = 'alpha\nbeta\ngamma';
    const right = 'alpha\nbeta2\ngamma\ndelta';
    const lines = diffLines(left, right);
    const stats = diffStats(lines);
    expect(stats.equal).toBeGreaterThanOrEqual(2);
    expect(stats.removed).toBeGreaterThanOrEqual(1);
    expect(stats.added).toBeGreaterThanOrEqual(1);
    expect(lines.some((l) => l.op === 'remove' && l.text === 'beta')).toBe(true);
    expect(lines.some((l) => l.op === 'add' && l.text === 'beta2')).toBe(true);
    expect(lines.some((l) => l.op === 'add' && l.text === 'delta')).toBe(true);
  });

  it('handles empty sides', () => {
    expect(diffLines('', 'only')).toEqual([
      { op: 'add', leftLine: null, rightLine: 1, text: 'only' },
    ]);
    expect(diffLines('only', '')).toEqual([
      { op: 'remove', leftLine: 1, rightLine: null, text: 'only' },
    ]);
    expect(diffLines('', '')).toEqual([]);
  });
});

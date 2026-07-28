/** Line-oriented diff for version comparison (no third-party dep). */

export type DiffOp = 'equal' | 'add' | 'remove';

export type DiffLine = {
  op: DiffOp;
  leftLine: number | null;
  rightLine: number | null;
  text: string;
};

function splitLines(text: string): string[] {
  if (!text) return [];
  // Preserve empty trailing line only when text ends with newline intentionally as empty content.
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Classic LCS table then backtrack into aligned line ops.
 * Suitable for document extracted text (typically small-to-medium).
 */
export function diffLines(left: string, right: string): DiffLine[] {
  const a = splitLines(left);
  const b = splitLines(right);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i]![j] = dp[i + 1]![j + 1]! + 1;
      else dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let leftNo = 1;
  let rightNo = 1;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'equal', leftLine: leftNo++, rightLine: rightNo++, text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ op: 'remove', leftLine: leftNo++, rightLine: null, text: a[i]! });
      i++;
    } else {
      out.push({ op: 'add', leftLine: null, rightLine: rightNo++, text: b[j]! });
      j++;
    }
  }
  while (i < n) {
    out.push({ op: 'remove', leftLine: leftNo++, rightLine: null, text: a[i]! });
    i++;
  }
  while (j < m) {
    out.push({ op: 'add', leftLine: null, rightLine: rightNo++, text: b[j]! });
    j++;
  }
  return out;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number; equal: number } {
  let added = 0;
  let removed = 0;
  let equal = 0;
  for (const line of lines) {
    if (line.op === 'add') added++;
    else if (line.op === 'remove') removed++;
    else equal++;
  }
  return { added, removed, equal };
}

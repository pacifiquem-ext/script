import { MAX_CITATION_HIGHLIGHT_CHARS } from './constants';

export type OffsetRange = {
  startOffset: number;
  endOffset: number;
};

/**
 * Map raw provider / worker failure strings to a short, user-facing message.
 * Keeps Voyage billing/rate-limit dumps and credit errors out of the Library UI.
 */
export function humanizeIngestionFailure(reason: string | null | undefined): string {
  if (!reason?.trim()) return 'Processing failed';
  const raw = reason.trim();
  const lower = raw.toLowerCase();

  if (
    lower.includes('insufficient credits') ||
    lower.includes('not enough credits') ||
    (lower.includes('credit') && (lower.includes('balance') || lower.includes('cost')))
  ) {
    return 'Processing failed due to low credits. Buy more credits or contact support.';
  }

  if (
    lower.includes('voyage') ||
    lower.includes('embedding') ||
    lower.includes('payment method') ||
    lower.includes('rate limit') ||
    lower.includes('tpm') ||
    lower.includes('rpm') ||
    (lower.includes('429') &&
      (lower.includes('token') || lower.includes('billing') || lower.includes('voyage')))
  ) {
    return 'Processing failed due to low embedding tokens. Buy more credits or contact support.';
  }

  if (lower.includes('configuration') || lower.includes('api key') || lower.includes('api_key')) {
    return 'Processing failed due to a configuration issue. Contact support.';
  }

  // Never surface multi-line provider JSON dumps in product UI.
  if (raw.length > 160 || raw.includes('{') || raw.includes('\n')) {
    return 'Processing failed. Retry later or contact support.';
  }

  return raw;
}

function clampRange(text: string, start: number, end: number): OffsetRange {
  const s = Math.max(0, Math.min(text.length, Math.floor(start)));
  const e = Math.max(s, Math.min(text.length, Math.floor(end)));
  return { startOffset: s, endOffset: e };
}

function paragraphsInWindow(windowText: string): Array<{ relStart: number; relEnd: number }> {
  const parts: Array<{ relStart: number; relEnd: number }> = [];
  const re = /\n{2,}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(windowText)) !== null) {
    if (match.index > last) {
      parts.push({ relStart: last, relEnd: match.index });
    }
    last = match.index + match[0].length;
  }
  if (last < windowText.length) {
    parts.push({ relStart: last, relEnd: windowText.length });
  }
  return parts.filter((p) => windowText.slice(p.relStart, p.relEnd).trim().length > 0);
}

function sentencesInWindow(windowText: string): Array<{ relStart: number; relEnd: number }> {
  const parts: Array<{ relStart: number; relEnd: number }> = [];
  const re = /[.!?\n]+(?:\s+|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(windowText)) !== null) {
    const end = match.index + match[0].length;
    if (end > last) parts.push({ relStart: last, relEnd: end });
    last = end;
  }
  if (last < windowText.length) {
    parts.push({ relStart: last, relEnd: windowText.length });
  }
  return parts.filter((p) => windowText.slice(p.relStart, p.relEnd).trim().length > 0);
}

function scoreSpan(text: string, hintNorm: string | null): number {
  const trimmed = text.trim();
  if (!trimmed) return -1;
  let score = Math.min(trimmed.length, MAX_CITATION_HIGHLIGHT_CHARS);
  // Prefer concrete content over pure headings.
  if (/^#{1,6}\s/.test(trimmed) && trimmed.length < 80) score *= 0.35;
  if (/```|`[A-Z0-9_]+`|[A-Z][A-Z0-9_]{2,}=/.test(trimmed)) score *= 1.4;
  if (hintNorm) {
    const spanNorm = trimmed.toLowerCase().replace(/\s+/g, ' ');
    if (spanNorm.includes(hintNorm.slice(0, Math.min(48, hintNorm.length)))) score *= 2.2;
    const tokens = hintNorm
      .split(' ')
      .filter((t) => t.length > 4)
      .slice(0, 12);
    let hits = 0;
    for (const t of tokens) {
      if (spanNorm.includes(t)) hits += 1;
    }
    if (tokens.length) score *= 1 + hits / tokens.length;
  }
  return score;
}

function findHintMatch(windowText: string, hint: string): OffsetRange | null {
  const candidates: string[] = [];
  const fence = /```[\w-]*\n?([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(hint)) !== null) {
    const body = m[1]?.trim();
    if (body && body.length >= 12) candidates.push(body);
  }
  for (const tick of hint.match(/`([^`\n]{6,120})`/g) ?? []) {
    candidates.push(tick.slice(1, -1));
  }
  for (const line of hint.split('\n')) {
    const t = line.trim();
    if (t.length >= 20 && t.length <= 160 && !t.startsWith('#')) candidates.push(t);
  }
  // Env-style identifiers and assignment snippets the model often quotes.
  for (const token of hint.match(/\b[A-Z][A-Z0-9_]{2,}(?:=\S*)?/g) ?? []) {
    if (token.length >= 6) candidates.push(token);
  }
  // Distinctive multi-word phrases from prose (3–6 words).
  const words = hint
    .replace(/\[(\d+)\]/g, ' ')
    .replace(/[`*_#>-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (let n = 6; n >= 3; n -= 1) {
    for (let i = 0; i <= words.length - n; i += 1) {
      const phrase = words.slice(i, i + n).join(' ');
      if (phrase.length >= 12) candidates.push(phrase);
    }
  }

  const windowLower = windowText.toLowerCase();
  let best: { start: number; end: number; score: number } | null = null;
  for (const c of candidates) {
    const needle = c.trim();
    if (needle.length < 6) continue;
    const idx = windowLower.indexOf(needle.toLowerCase());
    if (idx < 0) continue;
    // Prefer longer matches; boost assignment / SCREAMING_SNAKE tokens.
    let score = Math.min(needle.length, MAX_CITATION_HIGHLIGHT_CHARS);
    if (/^[A-Z][A-Z0-9_]+/.test(needle)) score *= 1.5;
    if (needle.includes('=')) score *= 1.3;
    if (!best || score > best.score) {
      // Expand around the match to a nearby paragraph / code fence when short.
      let start = idx;
      let end = idx + needle.length;
      if (end - start < 80) {
        const before = windowText.lastIndexOf('\n\n', idx);
        const after = windowText.indexOf('\n\n', end);
        const paraStart = before >= 0 ? before + 2 : 0;
        const paraEnd = after >= 0 ? after : windowText.length;
        if (paraEnd - paraStart <= MAX_CITATION_HIGHLIGHT_CHARS * 1.5) {
          start = paraStart;
          end = paraEnd;
        } else {
          start = Math.max(paraStart, idx - 40);
          end = Math.min(paraEnd, idx + MAX_CITATION_HIGHLIGHT_CHARS);
        }
      }
      best = { start, end, score };
    }
  }
  return best ? { startOffset: best.start, endOffset: best.end } : null;
}

/**
 * Narrow a chunk-sized citation range to a readable span (paragraph / sentence / hint match).
 * Offsets are absolute into `fullText`.
 */
export function refineCitationRange(
  fullText: string,
  startOffset: number,
  endOffset: number,
  hint?: string | null,
  maxChars: number = MAX_CITATION_HIGHLIGHT_CHARS,
): OffsetRange {
  const base = clampRange(fullText, startOffset, endOffset);
  const windowText = fullText.slice(base.startOffset, base.endOffset);
  if (!windowText || base.endOffset - base.startOffset <= maxChars) {
    return base;
  }

  const hintText = hint?.trim() || '';
  const hintNorm = hintText ? hintText.toLowerCase().replace(/\s+/g, ' ') : null;
  const relativeMatch = hintText ? findHintMatch(windowText, hintText) : null;
  if (relativeMatch) {
    const abs = clampRange(
      fullText,
      base.startOffset + relativeMatch.startOffset,
      base.startOffset + relativeMatch.endOffset,
    );
    if (abs.endOffset - abs.startOffset <= maxChars * 1.25) return abs;
    // Cap long code fences to maxChars from the match start.
    return clampRange(fullText, abs.startOffset, abs.startOffset + maxChars);
  }

  const units =
    paragraphsInWindow(windowText).length > 1
      ? paragraphsInWindow(windowText)
      : sentencesInWindow(windowText);

  if (!units.length) {
    const mid = Math.floor((base.startOffset + base.endOffset) / 2);
    const half = Math.floor(maxChars / 2);
    return clampRange(fullText, mid - half, mid + half);
  }

  let best = units[0]!;
  let bestScore = -1;
  for (const unit of units) {
    const slice = windowText.slice(unit.relStart, unit.relEnd);
    const score = scoreSpan(slice, hintNorm);
    if (score > bestScore) {
      bestScore = score;
      best = unit;
    }
  }

  let absStart = base.startOffset + best.relStart;
  let absEnd = base.startOffset + best.relEnd;
  // Expand slightly with neighbors if still tiny, without exceeding maxChars.
  if (absEnd - absStart < Math.min(80, maxChars / 2)) {
    const idx = units.indexOf(best);
    if (idx >= 0 && idx + 1 < units.length) {
      const next = units[idx + 1]!;
      const candidateEnd = base.startOffset + next.relEnd;
      if (candidateEnd - absStart <= maxChars) absEnd = candidateEnd;
    }
  }
  if (absEnd - absStart > maxChars) {
    absEnd = absStart + maxChars;
    // Prefer not cutting mid-word when possible.
    const slice = fullText.slice(absStart, absEnd);
    const lastBreak = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
    if (lastBreak > maxChars * 0.55) absEnd = absStart + lastBreak;
  }
  return clampRange(fullText, absStart, absEnd);
}

/**
 * Citation offsets stored relative to chunked text: normalize newlines like the chunker.
 */
export function normalizeDocumentText(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

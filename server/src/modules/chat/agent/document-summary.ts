/** Build a one-line inventory summary from extracted text (no extra LLM call). */
export function buildDocumentSummary(text: string, maxLen = 240): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (cleaned.length <= maxLen) return cleaned;

  const slice = cleaned.slice(0, maxLen);
  const breakAt = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('; '),
  );
  const wordBreak = slice.lastIndexOf(' ');
  const cut = breakAt >= 48 ? breakAt + 1 : wordBreak >= 48 ? wordBreak : maxLen;
  return `${slice.slice(0, cut).trim()}…`;
}

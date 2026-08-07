import type { MemorySourceType, MessageCitation } from '@script/shared';

/** Turn bare [1]/[2] markers into hash links without breaking [label](url). */
export function linkifyCitationMarkers(content: string): string {
  // Hash links survive react-markdown's default URL sanitizer (unknown schemes are stripped).
  return content.replace(/\[(\d+)\](?!\()/g, '[$1](#cite-$1)');
}

export function citationFromIndex(
  citations: MessageCitation[] | undefined,
  index1Based: number,
): MessageCitation | null {
  if (!citations?.length || !Number.isFinite(index1Based)) return null;
  const idx = Math.trunc(index1Based) - 1;
  if (idx < 0 || idx >= citations.length) return null;
  return citations[idx] ?? null;
}

export type SourceChip = {
  sourceType: MemorySourceType;
  label: string;
  href?: string;
  documentId: string;
  documentName: string;
  /** 1-based citation numbers that map to this source */
  indices: number[];
  /** Best (highest score) citation for opening the preview */
  best: MessageCitation;
};

function citationSourceType(citation: MessageCitation): MemorySourceType {
  return citation.sourceType ?? 'document';
}

function sourceIdentity(citation: MessageCitation): string {
  const type = citationSourceType(citation);
  if (type === 'document') return `document:${citation.documentId || citation.documentName}`;
  if (type === 'meeting') return `meeting:${citation.meetingId || citation.documentName}`;
  if (type === 'work_item') {
    return `work_item:${citation.workItemId || citation.documentName}`;
  }
  if (type === 'workflow') return `workflow:${citation.workflowId || citation.documentName}`;
  return `${type}:${citation.documentName || citation.chunkId}`;
}

/** One chip per source identity, preserving first-seen order. */
export function uniqueSourceChips(citations: MessageCitation[]): SourceChip[] {
  const chips: SourceChip[] = [];
  const bySource = new Map<string, SourceChip>();

  citations.forEach((citation, i) => {
    const index = i + 1;
    const key = sourceIdentity(citation);
    const existing = bySource.get(key);
    if (existing) {
      existing.indices.push(index);
      const prev = existing.best.score ?? 0;
      const next = citation.score ?? 0;
      if (next > prev) {
        existing.best = citation;
        if (citation.href) existing.href = citation.href;
      } else if (!existing.href && citation.href) {
        existing.href = citation.href;
      }
      return;
    }
    const chip: SourceChip = {
      sourceType: citationSourceType(citation),
      label: citation.documentName,
      href: citation.href,
      documentId: citation.documentId ?? '',
      documentName: citation.documentName,
      indices: [index],
      best: citation,
    };
    bySource.set(key, chip);
    chips.push(chip);
  });

  return chips;
}

export function parseCitationHref(href: string | undefined): number | null {
  if (!href) return null;
  const trimmed = href.trim();
  const match =
    /^#cite-(\d+)$/i.exec(trimmed) ||
    /^citation:(\d+)$/i.exec(trimmed) ||
    /(?:^|\/)#cite-(\d+)$/i.exec(trimmed);
  if (!match) return null;
  return Number(match[1]);
}

/**
 * Pull a short window of assistant text around citation marker [n]
 * so the document canvas can match env vars / code the model actually quoted.
 */
export function citationContextHint(messageContent: string, index1Based: number): string {
  if (!messageContent || !Number.isFinite(index1Based)) return '';
  const marker = `[${Math.trunc(index1Based)}]`;
  const idx = messageContent.indexOf(marker);
  if (idx < 0) {
    // Fall back to whole message (still helps match distinctive phrases).
    return messageContent.slice(0, 1200);
  }
  const start = Math.max(0, idx - 500);
  const end = Math.min(messageContent.length, idx + marker.length + 280);
  return messageContent.slice(start, end);
}

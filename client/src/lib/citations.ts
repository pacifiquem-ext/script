import type { MessageCitation } from '@script/shared';

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
  documentId: string;
  documentName: string;
  /** 1-based citation numbers that map to this document */
  indices: number[];
  /** Best (highest score) citation for opening the preview */
  best: MessageCitation;
};

/** One chip per document, preserving first-seen order. */
export function uniqueSourceChips(citations: MessageCitation[]): SourceChip[] {
  const chips: SourceChip[] = [];
  const byDoc = new Map<string, SourceChip>();

  citations.forEach((citation, i) => {
    const index = i + 1;
    const existing = byDoc.get(citation.documentId);
    if (existing) {
      existing.indices.push(index);
      const prev = existing.best.score ?? 0;
      const next = citation.score ?? 0;
      if (next > prev) existing.best = citation;
      return;
    }
    const chip: SourceChip = {
      documentId: citation.documentId,
      documentName: citation.documentName,
      indices: [index],
      best: citation,
    };
    byDoc.set(citation.documentId, chip);
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

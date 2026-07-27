import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_CITATION_HIGHLIGHT_CHARS,
  normalizeDocumentText,
  refineCitationRange,
} from '@script/shared';
import { IconClose } from '../../lib/icons';
import { detectPreviewKind, typeBadgeLabel } from '../../lib/file-preview';
import { MarkdownContent } from '../ui/MarkdownContent';
import { LoadingState } from '../ui/LoadingState';
import { EmptyState } from '../ui/EmptyState';

export type TextHighlight = {
  startOffset: number;
  endOffset: number;
  label?: string;
  /** Optional assistant-message context near the citation marker for tighter matching. */
  hint?: string | null;
};

interface Props {
  file: {
    id: string;
    name: string;
    type?: string;
    status?: string;
    mimeType?: string | null;
  };
  content: string | null;
  downloadUrl?: string | null;
  loading?: boolean;
  highlight?: TextHighlight | null;
  onClose: () => void;
  className?: string;
}

const TYPE_COLOR: Record<string, string> = {
  pdf: '#e54d2e',
  doc: '#0070f3',
  docx: '#0070f3',
  md: '#0d9488',
  markdown: '#0d9488',
  txt: '#737373',
  png: '#7c3aed',
  jpg: '#7c3aed',
  jpeg: '#7c3aed',
  gif: '#7c3aed',
  webp: '#7c3aed',
  xlsx: '#15803d',
  xls: '#15803d',
  csv: '#15803d',
};

function DocumentArticle({ children }: { children: React.ReactNode }) {
  return (
    <article className="bg-white rounded-16 border border-neutral-200 p-6 shadow-sm max-w-[800px] mx-auto">
      {children}
    </article>
  );
}

function ProseExtracted({ text }: { text: string }) {
  const looksLikeMarkdown = /(^#{1,6}\s)|(\*\*[^*]+\*\*)|(`{3})|(\n[-*+]\s)/m.test(text);
  if (looksLikeMarkdown) {
    return <MarkdownContent content={text} />;
  }
  return (
    <div className="script-doc-prose max-w-[72ch]">
      {text.split(/\n{2,}/).map((para, i) => (
        <p
          key={i}
          className="text-para-sm text-neutral-800 leading-6 mb-3 last:mb-0 whitespace-pre-wrap"
        >
          {para}
        </p>
      ))}
    </div>
  );
}

function HighlightedExcerpt({ text, highlight }: { text: string; highlight: TextHighlight }) {
  const markRef = useRef<HTMLElement>(null);
  // Match offsets produced by the chunker (newline-normalized, trimmed body).
  const normalized = useMemo(() => normalizeDocumentText(text), [text]);
  const range = useMemo(() => {
    const baseStart = Math.max(0, Math.min(normalized.length, Math.floor(highlight.startOffset)));
    const baseEnd = Math.max(
      baseStart,
      Math.min(normalized.length, Math.floor(highlight.endOffset)),
    );
    if (baseEnd - baseStart <= MAX_CITATION_HIGHLIGHT_CHARS && !highlight.hint) {
      return { startOffset: baseStart, endOffset: baseEnd };
    }
    return refineCitationRange(
      normalized,
      baseStart,
      baseEnd,
      highlight.hint ?? null,
      MAX_CITATION_HIGHLIGHT_CHARS,
    );
  }, [normalized, highlight.startOffset, highlight.endOffset, highlight.hint]);

  const start = range.startOffset;
  const end = range.endOffset;
  const before = normalized.slice(0, start);
  const mid = normalized.slice(start, end);
  const after = normalized.slice(end);

  useEffect(() => {
    markRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [start, end, normalized]);

  if (!mid) {
    return <ProseExtracted text={normalized || text} />;
  }

  return (
    <div className="script-doc-prose max-w-[72ch] text-para-sm text-neutral-800 leading-6 whitespace-pre-wrap">
      {highlight.label ? (
        <p className="text-para-xs text-primary-base font-medium mb-3 not-italic whitespace-normal">
          {highlight.label}
        </p>
      ) : null}
      <span>{before}</span>
      <mark
        ref={markRef}
        className="bg-primary-alpha-16 text-neutral-950 rounded-4 px-0.5 shadow-[inset_0_-2px_0_0_theme(colors.primary.base)]"
      >
        {mid}
      </mark>
      <span>{after}</span>
    </div>
  );
}

function useRemoteText(url: string | null | undefined, enabled: boolean) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled || !url) {
      setText(null);
      setError(null);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);
    setText(null);
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Could not download file for preview.');
        const body = await res.text();
        if (!cancelled) setText(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Preview failed');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, enabled]);

  return { text, error, busy };
}

function DocxPreview({ url, fallbackText }: { url: string; fallbackText: string | null }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    setHtml(null);
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Could not download document for preview.');
        const buffer = await res.arrayBuffer();
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml(
          { arrayBuffer: buffer },
          {
            styleMap: [
              "p[style-name='Title'] => h1:fresh",
              "p[style-name='Heading 1'] => h1:fresh",
              "p[style-name='Heading 2'] => h2:fresh",
              "p[style-name='Heading 3'] => h3:fresh",
            ],
          },
        );
        if (!cancelled) setHtml(result.value || '<p></p>');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Preview failed');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (busy) return <LoadingState label="Rendering Word document…" />;
  if (html) {
    return (
      <div
        className="script-docx-preview bg-white rounded-16 border border-neutral-200 p-6 shadow-sm max-w-[800px] mx-auto"
        // Safe: HTML produced client-side by mammoth from the user's own file
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  if (fallbackText?.trim()) {
    return (
      <DocumentArticle>
        <p className="text-para-xs text-neutral-400 mb-3">
          Styled Word preview unavailable{error ? ` (${error})` : ''}. Showing extracted text.
        </p>
        <ProseExtracted text={fallbackText} />
      </DocumentArticle>
    );
  }
  return (
    <EmptyState
      title="Couldn’t render document"
      description={error ?? 'Open the original file to view it.'}
    />
  );
}

export function DocumentCanvas({
  file,
  content,
  downloadUrl,
  loading,
  highlight,
  onClose,
  className = 'h-full w-full min-h-0',
}: Props) {
  const badge = typeBadgeLabel(file.name, file.mimeType);
  const kind = detectPreviewKind({
    name: file.name,
    mimeType: file.mimeType ?? file.type,
  });
  // Keep original extracted text (including leading whitespace) for offset accuracy.
  const rawContent = content ?? null;
  const readyContent = rawContent?.trim() ? rawContent : null;
  const needsRemoteText =
    !loading && !readyContent && Boolean(downloadUrl) && (kind === 'markdown' || kind === 'text');
  const remote = useRemoteText(downloadUrl, needsRemoteText);
  const textBody = readyContent ?? remote.text ?? null;
  const hasHighlight =
    Boolean(highlight) &&
    highlight != null &&
    Number.isFinite(highlight.startOffset) &&
    Number.isFinite(highlight.endOffset) &&
    highlight.endOffset > highlight.startOffset;

  function renderBody() {
    if (loading || remote.busy) {
      return <LoadingState label="Loading document…" />;
    }

    // Citation jump: always show text with mark when we have offsets + body.
    if (hasHighlight && textBody) {
      return (
        <DocumentArticle>
          <HighlightedExcerpt text={textBody} highlight={highlight!} />
        </DocumentArticle>
      );
    }

    if (kind === 'pdf' && downloadUrl) {
      return (
        <iframe
          title={file.name}
          src={downloadUrl}
          className="w-full h-full min-h-[60vh] rounded-12 border border-neutral-200 bg-white"
        />
      );
    }

    if (kind === 'image' && downloadUrl) {
      return (
        <div className="flex items-center justify-center min-h-[40vh]">
          <img
            src={downloadUrl}
            alt={file.name}
            className="max-w-full max-h-[calc(100vh-120px)] object-contain rounded-12 border border-neutral-200 bg-white"
          />
        </div>
      );
    }

    if (kind === 'docx') {
      if (downloadUrl) {
        return <DocxPreview url={downloadUrl} fallbackText={readyContent} />;
      }
      if (readyContent) {
        return (
          <DocumentArticle>
            <ProseExtracted text={readyContent} />
          </DocumentArticle>
        );
      }
    }

    if (textBody) {
      if (kind === 'markdown') {
        return (
          <DocumentArticle>
            <MarkdownContent content={textBody} />
          </DocumentArticle>
        );
      }
      return (
        <DocumentArticle>
          <ProseExtracted text={textBody} />
        </DocumentArticle>
      );
    }

    if (remote.error) {
      return <EmptyState title="Couldn’t load preview" description={remote.error} />;
    }

    return (
      <EmptyState
        title="No preview yet"
        description={
          file.status && file.status !== 'ready'
            ? 'Wait for ingestion to finish, then open the file again.'
            : 'No preview is available for this file yet.'
        }
      />
    );
  }

  return (
    <div className={`flex flex-col h-full bg-neutral-50 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between p-[16px_20px] border-b border-neutral-200 shrink-0 bg-white gap-3">
        <div className="flex items-center gap-3 overflow-hidden min-w-0">
          <span
            className="shrink-0 px-2 py-1 rounded-6 text-[10px] font-bold tracking-[0.05em] text-white uppercase"
            style={{ background: TYPE_COLOR[badge] || '#737373' }}
          >
            {badge}
          </span>
          <div className="min-w-0">
            <p className="text-label-sm text-neutral-950 truncate">{file.name}</p>
            {file.status && (
              <p className="text-para-xs text-neutral-400 capitalize">{file.status}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {downloadUrl ? (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-para-xs text-primary-base px-2 py-1.5 rounded-8 hover:bg-primary-alpha-10"
            >
              Open original
            </a>
          ) : null}
          <button
            className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 hover:text-neutral-950 hover:bg-neutral-100"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            <IconClose size={18} />
          </button>
        </div>
      </div>
      <div className={`flex-1 overflow-y-auto ${kind === 'pdf' && !hasHighlight ? 'p-0' : 'p-6'}`}>
        {renderBody()}
      </div>
    </div>
  );
}

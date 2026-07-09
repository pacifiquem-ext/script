import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MessageCitation } from '@script/shared';
import { cn } from '../../lib/cn';
import { citationFromIndex, linkifyCitationMarkers, parseCitationHref } from '../../lib/citations';

type Props = {
  content: string;
  className?: string;
  /** Soften density for chat bubbles */
  compact?: boolean;
  citations?: MessageCitation[];
  onCitationClick?: (citation: MessageCitation, index1Based: number) => void;
};

const LINK_CLASS =
  'text-primary-base underline underline-offset-2 decoration-primary-base/40 hover:text-primary-darker hover:decoration-primary-darker transition-colors';

export function MarkdownContent({
  content,
  className,
  compact = false,
  citations,
  onCitationClick,
}: Props) {
  const prepared = useMemo(
    () => (citations?.length ? linkifyCitationMarkers(content) : content),
    [content, citations],
  );

  const components = useMemo(
    () => ({
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1
          className={cn(
            'font-medium text-neutral-950 mt-4 mb-2 first:mt-0',
            compact ? 'text-h6' : 'text-h5',
          )}
        >
          {children}
        </h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2
          className={cn(
            'font-medium text-neutral-950 mt-4 mb-2 first:mt-0',
            compact ? 'text-label-md' : 'text-h6',
          )}
        >
          {children}
        </h2>
      ),
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="text-label-md font-medium text-neutral-950 mt-3 mb-1.5 first:mt-0">
          {children}
        </h3>
      ),
      h4: ({ children }: { children?: React.ReactNode }) => (
        <h4 className="text-label-sm font-medium text-neutral-950 mt-3 mb-1 first:mt-0">
          {children}
        </h4>
      ),
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="text-neutral-800 my-2 first:mt-0 last:mb-0 text-para-sm">{children}</p>
      ),
      ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className="my-2 pl-5 list-disc space-y-1 text-para-sm text-neutral-800">{children}</ul>
      ),
      ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className="my-2 pl-5 list-decimal space-y-1 text-para-sm text-neutral-800">
          {children}
        </ol>
      ),
      li: ({ children }: { children?: React.ReactNode }) => (
        <li className="leading-5 marker:text-neutral-400">{children}</li>
      ),
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
        const citationIndex = parseCitationHref(href);
        if (citationIndex != null) {
          const citation = citationFromIndex(citations, citationIndex);
          if (citation && onCitationClick) {
            return (
              <button
                type="button"
                className={cn(
                  'inline-flex items-center justify-center min-w-[1.35em] px-1 mx-0.5 rounded-4',
                  'text-[11px] font-semibold leading-4 align-super',
                  'bg-primary-alpha-10 text-primary-base border border-primary-base/20',
                  'hover:bg-primary-base hover:text-white hover:border-primary-base',
                  'transition-colors cursor-pointer',
                )}
                onClick={(e) => {
                  e.preventDefault();
                  onCitationClick(citation, citationIndex);
                }}
                title={`${citation.documentName}${
                  citation.score != null ? ` · ${(citation.score * 100).toFixed(0)}%` : ''
                }`}
                aria-label={`Open source ${citationIndex}: ${citation.documentName}`}
              >
                {citationIndex}
              </button>
            );
          }
          return (
            <span className="text-primary-base font-semibold text-[11px] align-super">
              [{citationIndex}]
            </span>
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            {children}
          </a>
        );
      },
      strong: ({ children }: { children?: React.ReactNode }) => (
        <strong className="font-semibold text-neutral-950">{children}</strong>
      ),
      em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <blockquote className="my-3 border-l-2 border-neutral-300 pl-3 text-para-sm text-neutral-600 italic">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-4 border-0 border-t border-neutral-200" />,
      code: ({
        className: codeClass,
        children,
      }: {
        className?: string;
        children?: React.ReactNode;
      }) => {
        const isBlock = Boolean(codeClass?.includes('language-') || String(children).includes('\n'));
        if (isBlock) {
          return (
            <code
              className={cn('font-mono text-[12px] leading-5 text-neutral-900 block', codeClass)}
            >
              {children}
            </code>
          );
        }
        return (
          <code className="font-mono text-[12px] px-1 py-0.5 rounded-4 bg-neutral-100 text-neutral-900">
            {children}
          </code>
        );
      },
      pre: ({ children }: { children?: React.ReactNode }) => (
        <pre className="my-3 p-3 rounded-12 bg-neutral-100 overflow-x-auto text-[12px] leading-5">
          {children}
        </pre>
      ),
      table: ({ children }: { children?: React.ReactNode }) => (
        <div className="my-3 overflow-x-auto rounded-12 border border-neutral-200">
          <table className="w-full text-para-sm border-collapse">{children}</table>
        </div>
      ),
      thead: ({ children }: { children?: React.ReactNode }) => (
        <thead className="bg-neutral-100 text-left">{children}</thead>
      ),
      th: ({ children }: { children?: React.ReactNode }) => (
        <th className="px-3 py-2 text-label-xs text-neutral-700 border-b border-neutral-200">
          {children}
        </th>
      ),
      td: ({ children }: { children?: React.ReactNode }) => (
        <td className="px-3 py-2 text-para-sm text-neutral-800 border-b border-neutral-100 align-top">
          {children}
        </td>
      ),
      img: ({ src, alt }: { src?: string; alt?: string }) => (
        <img
          src={src}
          alt={alt ?? ''}
          className="my-3 max-w-full rounded-12 border border-neutral-200"
        />
      ),
    }),
    [citations, compact, onCitationClick],
  );

  if (!content.trim()) return null;

  return (
    <div className={cn('script-markdown min-w-0 break-words', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {prepared}
      </ReactMarkdown>
    </div>
  );
}

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MessageCitation } from '@script/shared';
import { cn } from '../../lib/cn';
import { citationFromIndex, linkifyCitationMarkers, parseCitationHref } from '../../lib/citations';

type Props = {
  content: string;
  className?: string;
  /** Chat lane: tighter type + uniform block spacing */
  compact?: boolean;
  citations?: MessageCitation[];
  onCitationClick?: (citation: MessageCitation, index1Based: number) => void;
};

/** Shared chat body size — keep in sync with user message bubbles in ChatPage */
export const CHAT_BODY_CLASS = 'font-sans text-[14px] leading-[1.65] text-neutral-800';

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

  const components = useMemo(() => {
    const body = compact ? CHAT_BODY_CLASS : 'font-sans text-[15px] leading-[1.75] text-neutral-800';
    const block = compact ? 'm-0' : 'my-3.5 first:mt-0 last:mb-0';

    return {
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1
          className={cn(
            'font-sans font-semibold tracking-tight text-neutral-950',
            compact ? 'm-0 text-[16px]' : 'mt-6 mb-3 text-[20px] first:mt-0 md:text-[22px]',
          )}
        >
          {children}
        </h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2
          className={cn(
            'font-sans font-semibold tracking-tight text-neutral-950',
            compact ? 'm-0 text-[15px]' : 'mt-5 mb-2.5 text-[17px] first:mt-0 md:text-[18px]',
          )}
        >
          {children}
        </h2>
      ),
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3
          className={cn(
            'font-sans font-semibold text-neutral-950',
            compact ? 'm-0 text-[14px]' : 'mt-4 mb-2 text-[15px] first:mt-0 md:text-[16px]',
          )}
        >
          {children}
        </h3>
      ),
      h4: ({ children }: { children?: React.ReactNode }) => (
        <h4
          className={cn(
            'font-sans font-medium text-neutral-900',
            compact ? 'm-0 text-[14px]' : 'mt-3 mb-1.5 text-[14px] first:mt-0',
          )}
        >
          {children}
        </h4>
      ),
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className={cn(body, block)}>{children}</p>
      ),
      ul: ({ children }: { children?: React.ReactNode }) => (
        <ul
          className={cn(
            body,
            'list-disc pl-5',
            compact ? 'm-0 space-y-1.5' : 'my-3.5 space-y-2 pl-6',
          )}
        >
          {children}
        </ul>
      ),
      ol: ({ children }: { children?: React.ReactNode }) => (
        <ol
          className={cn(
            body,
            'list-decimal pl-5',
            compact ? 'm-0 space-y-1.5' : 'my-3.5 space-y-2 pl-6',
          )}
        >
          {children}
        </ol>
      ),
      li: ({ children }: { children?: React.ReactNode }) => (
        <li className={cn(body, 'marker:text-neutral-400 pl-0.5')}>{children}</li>
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
                  'inline-flex min-w-[1.4em] items-center justify-center rounded-full px-1.5 py-0.5 mx-0.5',
                  'text-[10px] font-semibold leading-none align-baseline',
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
            <span className="text-primary-base font-semibold text-[10px] align-baseline">
              [{citationIndex}]
            </span>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
            {children}
          </a>
        );
      },
      strong: ({ children }: { children?: React.ReactNode }) => (
        <strong className="font-semibold text-neutral-950">{children}</strong>
      ),
      em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <blockquote
          className={cn(
            body,
            'border-l-2 border-primary-base/30 pl-3 italic text-neutral-600',
            compact ? 'm-0 py-0' : 'my-4 py-0.5 pl-4',
          )}
        >
          {children}
        </blockquote>
      ),
      hr: () => (
        <hr
          className={cn(
            'w-full border-0 border-t border-neutral-200',
            compact ? 'm-0' : 'my-5',
          )}
        />
      ),
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
              className={cn(
                'font-mono leading-[1.6] block bg-transparent text-neutral-100',
                compact ? 'text-[12px]' : 'text-[13px] leading-relaxed',
                codeClass,
              )}
            >
              {children}
            </code>
          );
        }
        return (
          <code
            className={cn(
              'font-mono rounded-6 border border-neutral-200/60 bg-neutral-100 px-1 py-0.5 text-neutral-900',
              compact ? 'text-[12px]' : 'text-[13px]',
            )}
          >
            {children}
          </code>
        );
      },
      pre: ({ children }: { children?: React.ReactNode }) => (
        <pre
          className={cn(
            'overflow-x-auto rounded-12 border border-neutral-800 bg-neutral-900 p-3 text-neutral-100',
            '[&_code]:bg-transparent [&_code]:text-neutral-100 [&_code]:p-0',
            compact ? 'm-0 text-[12px] leading-[1.6]' : 'my-4 rounded-14 p-4 text-[13px] leading-relaxed shadow-sm',
          )}
        >
          {children}
        </pre>
      ),
      table: ({ children }: { children?: React.ReactNode }) => (
        <div
          className={cn(
            'overflow-x-auto rounded-12 border border-neutral-200',
            compact ? 'm-0' : 'my-4',
          )}
        >
          <table
            className={cn(
              'w-full border-collapse',
              compact ? 'text-[13px] leading-[1.6]' : 'text-[14px] leading-relaxed',
            )}
          >
            {children}
          </table>
        </div>
      ),
      thead: ({ children }: { children?: React.ReactNode }) => (
        <thead className="bg-neutral-50 text-left">{children}</thead>
      ),
      th: ({ children }: { children?: React.ReactNode }) => (
        <th
          className={cn(
            'border-b border-neutral-200 font-semibold text-neutral-900',
            compact ? 'px-3 py-2 text-[13px]' : 'px-3.5 py-2.5',
          )}
        >
          {children}
        </th>
      ),
      td: ({ children }: { children?: React.ReactNode }) => (
        <td
          className={cn(
            'border-b border-neutral-100 text-neutral-800 align-top',
            compact ? 'px-3 py-2' : 'px-3.5 py-2.5',
          )}
        >
          {children}
        </td>
      ),
      img: ({ src, alt }: { src?: string; alt?: string }) => (
        <img
          src={src}
          alt={alt ?? ''}
          className={cn(
            'max-w-full rounded-12 border border-neutral-200',
            compact ? 'm-0 shadow-none' : 'my-4 shadow-sm',
          )}
        />
      ),
    };
  }, [citations, compact, onCitationClick]);

  if (!content.trim()) return null;

  return (
    <div
      className={cn(
        'script-markdown min-w-0 break-words',
        compact && 'flex flex-col gap-3 [&_li>p]:m-0',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {prepared}
      </ReactMarkdown>
    </div>
  );
}

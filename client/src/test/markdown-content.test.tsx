import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from '../components/ui/MarkdownContent';
import type { MessageCitation } from '@script/shared';

describe('MarkdownContent', () => {
  it('renders headings lists and code without raw markers', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        content={`# Hello\n\nThis is **bold** and a [link](https://example.com).\n\n- one\n- two\n\n\`inline\``}
      />,
    );
    expect(html).toContain('Hello');
    expect(html).toContain('<strong');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('text-primary-base');
    expect(html).not.toContain('**bold**');
    expect(html).not.toContain('# Hello');
  });

  it('renders citation markers as buttons when citations provided', () => {
    const citations: MessageCitation[] = [
      {
        documentId: 'd1',
        documentName: 'api.md',
        chunkId: 'c1',
        position: 0,
        startOffset: 0,
        endOffset: 10,
      },
    ];
    const html = renderToStaticMarkup(
      <MarkdownContent
        content="Answer with proof [1]."
        citations={citations}
        onCitationClick={() => undefined}
      />,
    );
    expect(html).toContain('aria-label="Open source 1: api.md"');
    expect(html).toContain('>1<');
    expect(html).not.toContain('[1]');
  });

  it('uses uniform compact spacing and strips nested list paragraph margins', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        compact
        content={'## Section\n\nFirst paragraph.\n\n- item one\n- item two\n\nSecond paragraph.'}
      />,
    );
    expect(html).toContain('text-[14px]');
    expect(html).toContain('gap-3');
    expect(html).not.toContain('my-3.5');
  });

  it('renders fenced code with light text on the dark pre shell', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        compact
        content={'```ts\nconst secret = \"abc\";\n```\n\n```\nSTORAGE_DRIVER=s3\n```'}
      />,
    );
    expect(html).toContain('bg-neutral-900');
    expect(html).toContain('text-neutral-100');
    expect(html).toContain('language-ts');
    expect(html).toContain('STORAGE_DRIVER=s3');
    // Block code must not force dark text (was unreadable on dark pre)
    expect(html).not.toMatch(/<code[^>]*text-neutral-900[^>]*>[\s\S]*STORAGE_DRIVER/);
  });
});

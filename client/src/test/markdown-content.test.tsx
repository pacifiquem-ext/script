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
      <MarkdownContent content="Answer with proof [1]." citations={citations} onCitationClick={() => undefined} />,
    );
    expect(html).toContain('aria-label="Open source 1: api.md"');
    expect(html).toContain('>1<');
    expect(html).not.toContain('[1]');
  });
});

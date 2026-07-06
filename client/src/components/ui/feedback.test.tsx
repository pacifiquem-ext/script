import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Alert } from './Alert';
import { FieldHint } from './FieldHint';

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
  Toaster: () => null,
}));

describe('Alert', () => {
  it('renders accessible error alert content', () => {
    const html = renderToStaticMarkup(
      <Alert status="error" variant="stroke" title="Failed" description="Nope" />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Failed');
    expect(html).toContain('Nope');
  });
});

describe('FieldHint', () => {
  it('marks error hints with alert role', () => {
    const html = renderToStaticMarkup(
      <FieldHint id="x" error>
        Required
      </FieldHint>,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Required');
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { CompactButton } from '../components/ui/CompactButton';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FieldHint } from '../components/ui/FieldHint';
import { Input } from '../components/ui/Input';
import { LoadingState } from '../components/ui/LoadingState';
import { Toaster } from '../components/ui/Toaster';
import { notify } from '../components/ui/toast-alert';
import { toast, toastDefaults } from '../components/ui/toast';

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
  Toaster: (props: { position?: string }) => <div data-toaster={props.position ?? 'top'} />,
}));

describe('UI primitives render', () => {
  it('renders Button variants and loading', () => {
    const html = renderToStaticMarkup(
      <>
        <Button>Go</Button>
        <Button variant="neutral" mode="stroke" size="sm" leftIcon={<span>*</span>}>
          N
        </Button>
        <Button loading rightIcon={<span>{'>'}</span>}>
          Load
        </Button>
        <Button variant="error" mode="lighter" size="xs">
          Err
        </Button>
        <Button variant="primary" mode="ghost">
          G
        </Button>
      </>,
    );
    expect(html).toContain('Go');
    expect(html).toContain('disabled');
  });

  it('renders Alert, Badge, Banner, FieldHint', () => {
    expect(
      renderToStaticMarkup(
        <Alert status="success" variant="lighter" title="OK" description="done" />,
      ),
    ).toContain('OK');
    expect(
      renderToStaticMarkup(
        <Alert status="error" variant="filled" title="E" onDismiss={() => undefined} compact />,
      ),
    ).toContain('E');
    expect(
      renderToStaticMarkup(
        <Badge variant="success" size="sm" dot>
          New
        </Badge>,
      ),
    ).toContain('New');
    expect(
      renderToStaticMarkup(
        <Banner
          status="information"
          title="Heads up"
          description="info"
          onDismiss={() => undefined}
        />,
      ),
    ).toContain('Heads up');
    expect(renderToStaticMarkup(<FieldHint>hint</FieldHint>)).toContain('hint');
    expect(renderToStaticMarkup(<FieldHint error>bad</FieldHint>)).toContain('role="alert"');
  });

  it('renders Empty/Error/Loading states', () => {
    expect(
      renderToStaticMarkup(
        <EmptyState title="None" description="empty" action={<button type="button">a</button>} />,
      ),
    ).toContain('None');
    expect(
      renderToStaticMarkup(<ErrorState message="Broken" onRetry={() => undefined} />),
    ).toContain('Broken');
    expect(renderToStaticMarkup(<LoadingState label="Wait" />)).toContain('Wait');
  });

  it('renders Input and CompactButton', () => {
    expect(
      renderToStaticMarkup(
        <Input label="Email" name="email" hint="h" error="e" leftIcon={<i />} rightIcon={<i />} />,
      ),
    ).toContain('Email');
    expect(renderToStaticMarkup(<CompactButton aria-label="edit">E</CompactButton>)).toContain('E');
    expect(
      renderToStaticMarkup(
        <CompactButton destructive aria-label="del">
          D
        </CompactButton>,
      ),
    ).toContain('D');
  });

  it('renders Toaster shell', () => {
    expect(renderToStaticMarkup(<Toaster />).length).toBeGreaterThan(0);
  });

  it('exposes notify and toast helpers', () => {
    expect(typeof notify.success).toBe('function');
    expect(typeof notify.error).toBe('function');
    expect(typeof notify.info).toBe('function');
    expect(typeof notify.warning).toBe('function');
    expect(typeof toast.custom).toBe('function');
    expect(toastDefaults.position).toBe('bottom-center');
    notify.success('ok');
    notify.error('bad');
    notify.info('i');
    notify.warning('w');
  });
});

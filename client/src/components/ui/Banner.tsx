import React from 'react';
import { cn } from '../../lib/cn';
import { IconAlert, IconClose, IconInfo, IconSuccess, IconWarning } from '../../lib/icons';
import { Button } from './Button';
import type { AlertStatus } from './Alert';

const rootTone: Record<AlertStatus, string> = {
  error: 'bg-error-lighter text-neutral-950 border-b border-error-light',
  warning: 'bg-warning-lighter text-neutral-950 border-b border-warning-light',
  success: 'bg-success-lighter text-neutral-950 border-b border-success-light',
  information: 'bg-info-lighter text-neutral-950 border-b border-info-light',
  feature: 'bg-primary-alpha-10 text-neutral-950 border-b border-primary-alpha-16',
};

const iconTone: Record<AlertStatus, string> = {
  error: 'text-error-base',
  warning: 'text-warning-base',
  success: 'text-success-base',
  information: 'text-info-base',
  feature: 'text-primary-base',
};

const icons = {
  error: IconAlert,
  warning: IconWarning,
  success: IconSuccess,
  information: IconInfo,
  feature: IconInfo,
} as const;

export function Banner({
  status = 'information',
  title,
  description,
  action,
  onDismiss,
  className,
}: {
  status?: AlertStatus;
  title: string;
  description?: string;
  action?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const Icon = icons[status];
  return (
    <div
      role="status"
      className={cn(
        'flex w-full items-center justify-center gap-3 px-4 py-2.5 text-para-sm',
        rootTone[status],
        className,
      )}
    >
      <span className={cn('shrink-0', iconTone[status])}>
        <Icon size={16} />
      </span>
      <p className="min-w-0 text-center">
        <span className="font-medium">{title}</span>
        {description ? <span className="text-neutral-600"> · {description}</span> : null}
      </p>
      {action}
      {onDismiss ? (
        <Button
          type="button"
          size="xs"
          variant="neutral"
          mode="ghost"
          aria-label="Dismiss banner"
          onClick={onDismiss}
          className="!px-1"
        >
          <IconClose size={14} />
        </Button>
      ) : null}
    </div>
  );
}

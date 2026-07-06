import React from 'react';
import { cn } from '../../lib/cn';
import {
  IconAlert,
  IconClose,
  IconInfo,
  IconSparkles,
  IconSuccess,
  IconWarning,
} from '../../lib/icons';
import { Button } from './Button';

export type AlertStatus = 'error' | 'warning' | 'success' | 'information' | 'feature';
export type AlertVariant = 'filled' | 'light' | 'lighter' | 'stroke';

const statusIcon = {
  error: IconAlert,
  warning: IconWarning,
  success: IconSuccess,
  information: IconInfo,
  feature: IconSparkles,
} as const;

const tone: Record<AlertStatus, Record<AlertVariant, string>> = {
  error: {
    filled: 'bg-error-base text-white',
    light: 'bg-error-light text-neutral-950',
    lighter: 'bg-error-lighter text-neutral-950',
    stroke: 'bg-white text-neutral-950 shadow-[inset_0_0_0_1px_theme(colors.error.light)]',
  },
  warning: {
    filled: 'bg-warning-base text-white',
    light: 'bg-warning-light text-neutral-950',
    lighter: 'bg-warning-lighter text-neutral-950',
    stroke: 'bg-white text-neutral-950 shadow-[inset_0_0_0_1px_theme(colors.warning.light)]',
  },
  success: {
    filled: 'bg-success-base text-white',
    light: 'bg-success-light text-neutral-950',
    lighter: 'bg-success-lighter text-neutral-950',
    stroke: 'bg-white text-neutral-950 shadow-[inset_0_0_0_1px_theme(colors.success.light)]',
  },
  information: {
    filled: 'bg-info-base text-white',
    light: 'bg-info-light text-neutral-950',
    lighter: 'bg-info-lighter text-neutral-950',
    stroke: 'bg-white text-neutral-950 shadow-[inset_0_0_0_1px_theme(colors.info.light)]',
  },
  feature: {
    filled: 'bg-primary-base text-white',
    light: 'bg-primary-alpha-10 text-neutral-950',
    lighter: 'bg-primary-alpha-10 text-neutral-950',
    stroke: 'bg-white text-neutral-950 shadow-[inset_0_0_0_1px_theme(colors.primary.alpha-16)]',
  },
};

const iconTone: Record<AlertStatus, Record<AlertVariant, string>> = {
  error: {
    filled: 'text-white',
    light: 'text-error-base',
    lighter: 'text-error-base',
    stroke: 'text-error-base',
  },
  warning: {
    filled: 'text-white',
    light: 'text-warning-base',
    lighter: 'text-warning-base',
    stroke: 'text-warning-base',
  },
  success: {
    filled: 'text-white',
    light: 'text-success-base',
    lighter: 'text-success-base',
    stroke: 'text-success-base',
  },
  information: {
    filled: 'text-white',
    light: 'text-info-base',
    lighter: 'text-info-base',
    stroke: 'text-info-base',
  },
  feature: {
    filled: 'text-white',
    light: 'text-primary-base',
    lighter: 'text-primary-base',
    stroke: 'text-primary-base',
  },
};

export function Alert({
  status = 'information',
  variant = 'lighter',
  title,
  description,
  action,
  onDismiss,
  className,
  compact = false,
}: {
  status?: AlertStatus;
  variant?: AlertVariant;
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const Icon = statusIcon[status];
  return (
    <div
      role="alert"
      aria-live={status === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'flex w-full gap-3 rounded-12 text-left',
        compact ? 'p-2.5' : 'p-3.5',
        tone[status][variant],
        className,
      )}
    >
      <span className={cn('mt-0.5 shrink-0', iconTone[status][variant])}>
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        {title ? <p className="text-label-sm">{title}</p> : null}
        {description ? <div className={cn('text-para-sm', title ? 'opacity-90' : '')}>{description}</div> : null}
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
      {onDismiss ? (
        <Button
          type="button"
          size="xs"
          variant="neutral"
          mode="ghost"
          className={cn('shrink-0 !px-1', variant === 'filled' ? 'text-white hover:bg-white/10' : '')}
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <IconClose size={14} />
        </Button>
      ) : null}
    </div>
  );
}

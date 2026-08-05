import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'destructive';
type LegacyVariant = 'neutral' | 'error';
type LegacyMode = 'filled' | 'stroke' | 'lighter' | 'ghost';
type Size = 'md' | 'sm' | 'xs';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | LegacyVariant;
  mode?: LegacyMode;
  size?: Size;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  loading?: boolean;
}

const sizeStyles: Record<Size, string> = {
  md: 'h-9 px-[22px] text-sm leading-5',
  sm: 'h-8 px-4 text-xs leading-4',
  xs: 'h-7 px-3 text-xs leading-4',
};

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'border-[var(--color-primary-border)] bg-[var(--color-primary)] text-neutral-0 shadow-button-primary hover:bg-[var(--color-primary-darker)] hover:shadow-button-primary-hover active:bg-[var(--color-primary-dark)]',
  secondary:
    'border-[var(--color-primary)] bg-neutral-0 text-[var(--color-primary)] hover:bg-surface-chip active:bg-primary-alpha-8',
  ghost:
    'border-transparent bg-transparent text-[var(--color-primary)] hover:bg-primary-alpha-8 active:bg-primary-alpha-10',
  subtle:
    'border-transparent bg-surface-chip text-[var(--color-primary)] hover:bg-primary-alpha-16 active:bg-primary-alpha-20',
  destructive:
    'border-destructive-border bg-destructive-base text-neutral-0 shadow-button-destructive hover:bg-destructive-darker hover:shadow-button-destructive-hover active:bg-destructive-dark',
};

const disabledStyles =
  'disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-neutral-200 disabled:text-neutral-400 disabled:shadow-none';

function resolveVariant(variant: ButtonVariant | LegacyVariant, mode: LegacyMode): ButtonVariant {
  if (
    variant === 'primary' ||
    variant === 'secondary' ||
    variant === 'ghost' ||
    variant === 'subtle' ||
    variant === 'destructive'
  ) {
    return variant;
  }

  if (variant === 'error') {
    if (mode === 'ghost') return 'ghost';
    if (mode === 'lighter') return 'subtle';
    return 'destructive';
  }

  if (mode === 'lighter') return 'subtle';
  if (mode === 'ghost') return 'ghost';
  return 'secondary';
}

export function Button({
  variant = 'primary',
  mode = 'filled',
  size = 'md',
  leftIcon,
  rightIcon,
  loading,
  children,
  className = '',
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const resolvedVariant = resolveVariant(variant, mode);
  const baseStyles =
    'inline-flex w-fit items-center justify-center gap-2 whitespace-nowrap rounded-12 border font-medium transition-all duration-200 select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 active:scale-[0.98]';

  return (
    <button
      type={type}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[resolvedVariant]} ${disabledStyles} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="flex h-4 w-4 shrink-0 animate-spin items-center justify-center rounded-full border-2 border-current border-t-transparent" />
      ) : leftIcon ? (
        <span className="flex shrink-0 items-center justify-center">{leftIcon}</span>
      ) : null}
      {children ? <span>{children}</span> : null}
      {!loading && rightIcon ? (
        <span className="flex shrink-0 items-center justify-center">{rightIcon}</span>
      ) : null}
    </button>
  );
}

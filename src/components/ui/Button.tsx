import React from 'react';

type Variant = 'primary' | 'neutral' | 'error';
type Mode = 'filled' | 'stroke' | 'lighter' | 'ghost';
type Size = 'md' | 'sm' | 'xs';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  mode?: Mode;
  size?: Size;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  loading?: boolean;
  as?: 'button' | 'a';
  href?: string;
}

const sizeStyles: Record<Size, string> = {
  md: 'btn--md',
  sm: 'btn--sm',
  xs: 'btn--xs',
};

const variantModeStyles: Record<Variant, Record<Mode, string>> = {
  primary: {
    filled:  'btn--primary-filled',
    stroke:  'btn--primary-stroke',
    lighter: 'btn--primary-lighter',
    ghost:   'btn--primary-ghost',
  },
  neutral: {
    filled:  'btn--neutral-filled',
    stroke:  'btn--neutral-stroke',
    lighter: 'btn--neutral-lighter',
    ghost:   'btn--neutral-ghost',
  },
  error: {
    filled:  'btn--error-filled',
    stroke:  'btn--error-stroke',
    lighter: 'btn--error-lighter',
    ghost:   'btn--error-ghost',
  },
};

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
  ...props
}: ButtonProps) {
  return (
    <button
      className={`btn ${sizeStyles[size]} ${variantModeStyles[variant][mode]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="btn__spinner" />
      ) : leftIcon ? (
        <span className="btn__icon">{leftIcon}</span>
      ) : null}
      {children && <span>{children}</span>}
      {!loading && rightIcon && <span className="btn__icon">{rightIcon}</span>}
    </button>
  );
}

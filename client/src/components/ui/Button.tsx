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
  md: 'h-10 px-4 rounded-10 text-sm leading-5',
  sm: 'h-9 px-3 rounded-8 text-sm leading-5',
  xs: 'h-8 px-2.5 rounded-8 text-xs leading-4',
};

const variantModeStyles: Record<Variant, Record<Mode, string>> = {
  primary: {
    filled:
      'bg-primary-base bg-primary-gradient text-white hover:bg-primary-gradient-hover shadow-sm',
    stroke:
      'bg-white text-primary-base shadow-[inset_0_0_0_1px_theme(colors.neutral.950)] hover:bg-primary-alpha-10',
    lighter:
      'bg-primary-alpha-10 text-primary-base hover:bg-white hover:shadow-[inset_0_0_0_1px_theme(colors.neutral.950)]',
    ghost: 'bg-transparent text-primary-base hover:bg-primary-alpha-10',
  },
  neutral: {
    filled:
      'bg-white text-neutral-950 shadow-xs shadow-[inset_0_0_0_1px_theme(colors.neutral.200)] hover:bg-neutral-50 hover:shadow-sm',
    stroke:
      'bg-transparent text-neutral-950 shadow-[inset_0_0_0_1px_theme(colors.neutral.200)] hover:bg-neutral-50',
    lighter: 'bg-neutral-50 text-neutral-950 hover:bg-neutral-200',
    ghost: 'bg-transparent text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950',
  },
  error: {
    filled: 'bg-error-base text-white hover:bg-[#b91c1c]',
    stroke: 'bg-white text-error-base shadow-[inset_0_0_0_1px_theme(colors.error.base)]',
    lighter: 'bg-error-lighter text-error-base',
    ghost: 'bg-transparent text-error-base',
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
  const baseStyles =
    'inline-flex items-center justify-center gap-2 font-medium tracking-tight cursor-pointer border-none outline-none no-underline transition-all duration-200 whitespace-nowrap select-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantModeStyles[variant][mode]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex items-center justify-center shrink-0" />
      ) : leftIcon ? (
        <span className="flex items-center justify-center shrink-0">{leftIcon}</span>
      ) : null}
      {children && <span>{children}</span>}
      {!loading && rightIcon && (
        <span className="flex items-center justify-center shrink-0">{rightIcon}</span>
      )}
    </button>
  );
}

import React from 'react';

type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info';
type BadgeSize = 'md' | 'sm';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Badge({
  variant = 'neutral',
  size = 'md',
  dot,
  children,
  className = '',
}: BadgeProps) {
  const sizeStyles = {
    md: 'px-2 py-0.5 text-xs leading-4',
    sm: 'px-1.5 py-[1px] text-[11px] leading-4'
  };

  const variantStyles = {
    neutral: 'bg-neutral-50 text-neutral-600 shadow-[inset_0_0_0_1px_theme(colors.neutral.200)]',
    primary: 'bg-neutral-950 text-white',
    success: 'bg-success-lighter text-success-base shadow-[inset_0_0_0_1px_theme(colors.success.light)]',
    warning: 'bg-warning-lighter text-warning-base shadow-[inset_0_0_0_1px_theme(colors.warning.light)]',
    error: 'bg-error-lighter text-error-base shadow-[inset_0_0_0_1px_theme(colors.error.light)]',
    info: 'bg-info-lighter text-info-base shadow-[inset_0_0_0_1px_theme(colors.info.light)]',
  };

  return (
    <span className={`inline-flex items-center gap-1 font-medium rounded-full whitespace-nowrap ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />}
      {children}
    </span>
  );
}

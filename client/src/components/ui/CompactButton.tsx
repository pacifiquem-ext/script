import React from 'react';
import { cn } from '../../lib/cn';

export function CompactButton({
  children,
  className,
  destructive = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-6 border-none bg-transparent p-0 cursor-pointer transition-colors',
        destructive
          ? 'text-neutral-400 hover:bg-error-lighter hover:text-error-base'
          : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-950',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

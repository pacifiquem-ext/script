import React from 'react';
import { cn } from '../../lib/cn';

export function FieldHint({
  id,
  children,
  error = false,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  error?: boolean;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p
      id={id}
      role={error ? 'alert' : undefined}
      className={cn('text-para-xs', error ? 'text-error-base' : 'text-neutral-400', className)}
    >
      {children}
    </p>
  );
}

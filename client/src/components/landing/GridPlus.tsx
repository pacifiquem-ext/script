import React from 'react';

type GridPlusProps = {
  className?: string;
};

export function GridPlus({ className = '' }: GridPlusProps) {
  return (
    <span
      className={`pointer-events-none absolute z-10 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-primary ${className}`}
      aria-hidden="true"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.25" strokeLinecap="square" />
      </svg>
    </span>
  );
}

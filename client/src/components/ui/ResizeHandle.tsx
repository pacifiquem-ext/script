import React from 'react';
import { cn } from '../../lib/cn';
import type { ResizeGrowth } from '../../lib/use-resizable-width';

type ResizeHandleProps = {
  growth: ResizeGrowth;
  onResizeStart: (clientX: number, growth: ResizeGrowth) => void;
  className?: string;
  label?: string;
};

export function ResizeHandle({
  growth,
  onResizeStart,
  className,
  label = 'Resize panel',
}: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        onResizeStart(event.clientX, growth);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onResizeStart(0, growth);
      }}
      className={cn(
        'group relative z-30 w-px shrink-0 cursor-col-resize bg-neutral-200',
        'hover:bg-primary-base/35 active:bg-primary-base/55 transition-colors',
        className,
      )}
    >
      <span className="absolute inset-y-0 -left-1.5 -right-1.5" aria-hidden />
    </div>
  );
}

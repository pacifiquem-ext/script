import React from 'react';
import { cn } from '../../lib/cn';
import type { ResizeGrowth } from '../../lib/use-resizable-width';

const KEYBOARD_STEP = 20;

type ResizeHandleProps = {
  growth: ResizeGrowth;
  onResizeStart: (clientX: number, growth: ResizeGrowth) => void;
  /** Called when keyboard nudges the panel (±step px). */
  onNudge: (delta: number) => void;
  className?: string;
  label?: string;
};

export function ResizeHandle({
  growth,
  onResizeStart,
  onNudge,
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
        const expand = event.key === 'ArrowRight' || event.key === 'ArrowDown';
        const shrink = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
        if (!expand && !shrink) return;
        event.preventDefault();
        const step = expand ? KEYBOARD_STEP : -KEYBOARD_STEP;
        onNudge(growth === 'right' ? step : -step);
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

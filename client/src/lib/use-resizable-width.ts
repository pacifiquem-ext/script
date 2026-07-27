import { useCallback, useEffect, useState } from 'react';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type ResizeGrowth = 'left' | 'right';

export function useResizableWidth({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
}: {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}) {
  const [width, setWidth] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw != null) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) return clamp(parsed, minWidth, maxWidth);
      }
    } catch {
      /* ignore storage errors */
    }
    return defaultWidth;
  });
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      /* ignore storage errors */
    }
  }, [storageKey, width]);

  const beginResize = useCallback(
    (clientX: number, growth: ResizeGrowth) => {
      const startX = clientX;
      const startWidth = width;
      setResizing(true);

      const onMove = (event: PointerEvent) => {
        const delta = event.clientX - startX;
        const next = growth === 'right' ? startWidth + delta : startWidth - delta;
        setWidth(clamp(next, minWidth, maxWidth));
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setResizing(false);
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [maxWidth, minWidth, width],
  );

  return { width, setWidth, beginResize, resizing };
}

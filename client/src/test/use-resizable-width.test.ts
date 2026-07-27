import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResizableWidth } from '../lib/use-resizable-width';

describe('useResizableWidth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  it('uses default width when nothing is stored', () => {
    const { result } = renderHook(() =>
      useResizableWidth({
        storageKey: 'test.panel',
        defaultWidth: 320,
        minWidth: 200,
        maxWidth: 600,
      }),
    );
    expect(result.current.width).toBe(320);
  });

  it('clamps stored width to min/max', () => {
    localStorage.setItem('test.panel', '999');
    const { result } = renderHook(() =>
      useResizableWidth({
        storageKey: 'test.panel',
        defaultWidth: 320,
        minWidth: 200,
        maxWidth: 600,
      }),
    );
    expect(result.current.width).toBe(600);
  });

  it('persists clamped width to localStorage', () => {
    const { result } = renderHook(() =>
      useResizableWidth({
        storageKey: 'test.panel.persist',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 500,
      }),
    );

    act(() => {
      result.current.setWidth(420);
    });

    expect(result.current.width).toBe(420);
    expect(localStorage.getItem('test.panel.persist')).toBe('420');
  });
});

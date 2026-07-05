import React from 'react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex flex-1 items-center justify-center gap-3 p-8 text-neutral-500"
      role="status"
    >
      <div className="w-6 h-6 rounded-full border-2 border-neutral-200 border-t-primary-base animate-spin" />
      <p className="text-para-sm">{label}</p>
    </div>
  );
}

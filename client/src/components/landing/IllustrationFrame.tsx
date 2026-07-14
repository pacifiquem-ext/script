import React from 'react';

type IllustrationFrameProps = {
  className?: string;
  label?: string;
};

export function IllustrationFrame({
  className = '',
  label = 'Illustration',
}: IllustrationFrameProps) {
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-20 border border-neutral-200 bg-[#F0F0F0] ${className}`}
      aria-hidden="true"
    >
      <span className="select-none text-[11px] font-medium tracking-wide text-neutral-400">
        {label}
      </span>
    </div>
  );
}

import React from 'react';

type LandingTitleProps = {
  line1: string;
  line2: string;
  className?: string;
  align?: 'center' | 'left';
};

export function LandingTitle({
  line1,
  line2,
  className = '',
  align = 'center',
}: LandingTitleProps) {
  return (
    <h2
      className={`m-0 ${align === 'center' ? 'text-center' : 'text-left'} ${className}`}
    >
      <span className="block text-[32px] font-medium leading-[110%] text-[#111] md:text-[44px]">
        {line1}
      </span>
      <span className="font-serif mt-1 block text-[32px] font-normal italic leading-[110%] text-primary-selection md:text-[44px]">
        {line2}
      </span>
    </h2>
  );
}

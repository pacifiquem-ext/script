import React from 'react';
import { IllustrationFrame } from './IllustrationFrame';
import { Reveal } from './motion/Reveal';

export function ClearanceSection() {
  return (
    <section id="security" className="bg-[#FBFBFF] px-6 py-24 md:px-12 lg:px-20">
      <div className="mx-auto grid w-full max-w-[1120px] items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <h2 className="m-0 mb-4 text-[36px] font-medium leading-[110%] text-[#111] md:text-[48px]">
            Answers, not leaks.
          </h2>
          <p className="font-serif m-0 mb-6 text-[28px] italic leading-[120%] text-primary-selection md:text-[34px]">
            Clearance decides what the brain will say.
          </p>
          <p className="m-0 mb-6 max-w-md text-[15px] leading-relaxed text-[#555]">
            Workspace-scoped retrieval. Permission-aware answers. The company stays open where it
            should — and closed where it must.
          </p>
          <a
            href="#security"
            className="text-[14px] font-medium text-primary-selection underline-offset-4 hover:underline"
          >
            See how clearance works
          </a>
        </Reveal>

        <Reveal delayMs={120}>
          <IllustrationFrame className="h-[340px] w-full md:h-[400px]" label="Illustration" />
        </Reveal>
      </div>
    </section>
  );
}

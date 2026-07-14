import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { IllustrationFrame } from './IllustrationFrame';
import { Reveal } from './motion/Reveal';
import { Parallax } from './motion/Parallax';

export function DocumentsSection() {
  return (
    <section className="bg-[#FBFBFF] px-6 py-24 md:px-12 lg:px-20">
      <div className="mx-auto grid w-full max-w-[1120px] items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <h2 className="m-0 mb-4 text-[36px] font-medium leading-[110%] text-[#111] md:text-[48px]">
            Everything the company owns.
          </h2>
          <p className="font-serif m-0 mb-6 text-[28px] italic leading-[120%] text-primary-selection md:text-[34px]">
            New and old. Signed and draft. All ingestible.
          </p>
          <p className="m-0 mb-8 max-w-md text-[15px] leading-relaxed text-[#555]">
            The Library is the company&apos;s memory — folders, contracts, decks, and policies ready
            for anyone with clearance to ask.
          </p>
          <Link to="/app/signup">
            <Button type="button">Connect your Library</Button>
          </Link>
        </Reveal>

        <Reveal delayMs={120}>
          <Parallax speed={0.12}>
            <IllustrationFrame className="h-[360px] w-full md:h-[440px]" label="Illustration" />
          </Parallax>
        </Reveal>
      </div>
    </section>
  );
}

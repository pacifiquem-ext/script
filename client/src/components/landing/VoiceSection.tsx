import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { IllustrationFrame } from './IllustrationFrame';
import { Reveal } from './motion/Reveal';

export function VoiceSection() {
  return (
    <section className="bg-[#FBFBFF] px-6 py-24 md:px-12 lg:px-20">
      <div className="mx-auto grid w-full max-w-[1120px] items-center gap-12 lg:grid-cols-2">
        <Reveal delayMs={80}>
          <IllustrationFrame className="h-[320px] w-full md:h-[380px]" label="Illustration" />
        </Reveal>

        <Reveal>
          <span className="mb-4 inline-flex rounded-full bg-surface-chip px-3 py-1 text-[12px] font-medium text-primary-selection">
            Coming soon
          </span>
          <h2 className="m-0 mb-4 text-[36px] font-medium leading-[110%] text-[#111] md:text-[48px]">
            Meetings become memory.
          </h2>
          <p className="m-0 mb-8 max-w-md text-[15px] leading-relaxed text-[#555]">
            Vocal decisions land in the same brain — not a second product. Ask what was said the
            same way you ask what was signed.
          </p>
          <Link to="/app/signup">
            <Button type="button" variant="secondary">
              Notify me when voice lands
            </Button>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

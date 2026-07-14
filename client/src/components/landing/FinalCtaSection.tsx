import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Reveal } from './motion/Reveal';
import { Parallax } from './motion/Parallax';

const TOTAL_BARS = 17;
const CENTER_IDX = Math.floor((TOTAL_BARS - 1) / 2);

function CtaBars() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: TOTAL_BARS }, (_, i) => {
        const dist = Math.abs(i - CENTER_IDX);
        return (
          <div
            key={i}
            className="absolute bottom-0 bg-[linear-gradient(to_top,rgba(96,96,255,0.55)_0%,rgba(251,251,255,0)_100%)]"
            style={{
              left: `${(i * 100) / TOTAL_BARS}%`,
              width: `${100 / TOTAL_BARS}%`,
              height: `${55 + dist * 4}%`,
            }}
          />
        );
      })}
    </div>
  );
}

export function FinalCtaSection() {
  return (
    <section className="relative overflow-hidden bg-[#FBFBFF] px-6 py-28 md:px-12 lg:px-20">
      <Parallax speed={0.15} className="absolute inset-0">
        <CtaBars />
      </Parallax>

      <div className="relative z-[1] mx-auto flex w-full max-w-[900px] flex-col items-center text-center">
        <Reveal>
          <p className="font-serif m-0 mb-8 text-[40px] italic leading-[110%] text-[#111] md:text-[56px] lg:text-[64px]">
            Put the company brain to work.
          </p>
        </Reveal>
        <Reveal delayMs={100}>
          <Link to="/app/signup">
            <Button type="button">Get early access</Button>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

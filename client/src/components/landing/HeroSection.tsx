import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import heroScreenshot from '../../assets/hero-screenshot.png';
import { Parallax } from './motion/Parallax';
import { Reveal } from './motion/Reveal';

const TOTAL_BARS = 23;
const V_STEP = 38;
const CENTER_IDX = Math.floor((TOTAL_BARS - 1) / 2);
const CENTER_TOP = 964;
const BAR_HEIGHT = 480;
const BAR_BOTTOM = CENTER_TOP + BAR_HEIGHT;
const SCREENSHOT_HEIGHT = Math.round(485 * 1.3);

function VBars() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      {Array.from({ length: TOTAL_BARS }, (_, i) => {
        const distFromCenter = Math.abs(i - CENTER_IDX);
        const top = CENTER_TOP - distFromCenter * V_STEP;
        const height = BAR_BOTTOM - top;
        return (
          <div
            key={i}
            className="absolute bg-[linear-gradient(to_bottom,rgba(251,251,255,0.6)_0%,rgba(96,96,255,0.82)_100%)]"
            style={{
              left: `${(i * 100) / TOTAL_BARS}%`,
              top,
              height,
              width: `${100 / TOTAL_BARS}%`,
            }}
          />
        );
      })}
    </div>
  );
}

export function HeroSection() {
  return (
    <section
      id="top"
      className="relative m-0 h-dvh max-h-dvh w-full overflow-hidden bg-[#FBFBFF] pt-[72px]"
    >
      <Parallax speed={0.12} className="absolute inset-0 z-0">
        <VBars />
      </Parallax>

      <div className="relative z-[1] flex h-full flex-col overflow-hidden">
        <div className="flex flex-1 flex-col items-center overflow-hidden px-6 pt-10 text-center md:px-12 md:pt-14 lg:px-20">
          <Reveal>
            <div className="mb-6 inline-flex h-[41px] items-center gap-3 rounded-21 border-2 border-neutral-0 bg-surface-chip px-3.5 py-2.5 shadow-chip">
              <div className="flex" aria-hidden="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <span
                    key={i}
                    className="-ml-1.5 block h-[22px] w-[22px] rounded-full border-2 border-neutral-0 bg-avatar-placeholder first:ml-0"
                  />
                ))}
              </div>
              <span className="text-[13px] text-primary-selection">
                2.4K currently on the waitlist
              </span>
            </div>
          </Reveal>

          <Reveal delayMs={80}>
            <h1 className="m-0 mb-3 max-w-4xl self-stretch text-center text-[48px] font-medium leading-[110%] text-[#000] md:text-[72px] lg:text-[80px]">
              The company brain.
            </h1>
          </Reveal>

          <Reveal delayMs={140}>
            <p className="font-serif m-0 mb-6 max-w-3xl self-stretch text-center text-[36px] font-normal italic leading-[110%] text-primary-selection md:text-[56px] lg:text-[64px]">
              Every document. Every decision. One place to ask.
            </p>
          </Reveal>

          <Reveal delayMs={200}>
            <p className="m-0 mb-8 max-w-xl text-[15px] leading-[1.6] text-[#555]">
              Ingest the company&apos;s truth. Ask anything. Get answers matched to your clearance.
            </p>
          </Reveal>

          <Reveal delayMs={260}>
            <Link to="/app/signup">
              <Button type="button">Get early access</Button>
            </Link>
          </Reveal>

          <Reveal delayMs={320} className="mt-16 w-full max-w-[1158px] shrink-0">
            <Parallax speed={-0.08}>
              <div className="rounded-[17.75px] bg-gradient-to-b from-[#E8E8E8] from-0% via-[#F2F2F2] via-[18%] to-white p-[0.75px] shadow-hero-screenshot">
                <div
                  className="flex w-full overflow-hidden rounded-[17px] border border-white/80 bg-white/75 p-[15px] backdrop-blur-[40px] backdrop-saturate-125"
                  style={{
                    height: SCREENSHOT_HEIGHT,
                    WebkitBackdropFilter: 'blur(40px) saturate(125%)',
                  }}
                >
                  <div className="relative h-full w-full overflow-hidden rounded-[12px] bg-neutral-0">
                    <img
                      src={heroScreenshot}
                      alt="Product preview of the script chat interface"
                      className="block h-full w-full object-cover object-center"
                    />
                  </div>
                </div>
              </div>
            </Parallax>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

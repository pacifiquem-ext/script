import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Reveal } from './motion/Reveal';

const SOURCES = [
  { label: 'Drive', angle: 0 },
  { label: 'Dropbox', angle: 72 },
  { label: 'OneDrive', angle: 144 },
  { label: 'Box', angle: 216 },
  { label: 'URL', angle: 288 },
] as const;

export function IntegrationsSection() {
  return (
    <section id="integrations" className="overflow-hidden bg-[#FBFBFF] px-6 py-24 md:px-12 lg:px-20">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center text-center">
        <Reveal>
          <h2 className="m-0 mb-3 text-[36px] font-medium leading-[110%] text-[#111] md:text-[48px]">
            Plug in the places truth already lives.
          </h2>
          <p className="m-0 mb-12 max-w-xl text-[15px] leading-relaxed text-[#555]">
            Connect once. The Library grows. The brain keeps watching.
          </p>
        </Reveal>

        <Reveal delayMs={100}>
          <div className="relative mb-12 h-[320px] w-[320px] md:h-[420px] md:w-[420px]">
            <div className="landing-orbit absolute inset-0">
              {SOURCES.map((source) => (
                <div
                  key={source.label}
                  className="absolute left-1/2 top-1/2"
                  style={{ transform: `rotate(${source.angle}deg) translateY(-140px)` }}
                >
                  <div className="landing-orbit-item -translate-x-1/2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-20 border border-neutral-200 bg-neutral-0 text-[11px] font-medium text-[#333] shadow-sm md:h-16 md:w-16">
                      {source.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-primary/30 bg-surface-chip shadow-chip md:h-28 md:w-28">
              <span className="block h-7 w-7 rounded-[6px] bg-primary" aria-hidden="true" />
              <span className="mt-1 text-[13px] font-medium text-[#111]">script</span>
            </div>
          </div>
        </Reveal>

        <Reveal delayMs={160}>
          <Link to="/app/signup">
            <Button type="button">Connect your sources</Button>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

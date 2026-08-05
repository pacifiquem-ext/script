import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { GridPlus } from './GridPlus';
import { IllustrationFrame } from './IllustrationFrame';
import { LandingTitle } from './LandingTitle';

const BEATS = [
  {
    id: 'ingest',
    title: 'Ingest',
    body: 'Upload files, connect Drive, Dropbox, OneDrive, Box, or drop in a URL. Later: systems and voice feed the same brain.',
    caption: 'Truth enters the company brain from everywhere it already lives.',
    frameLabel: 'Illustration — Ingest',
  },
  {
    id: 'remember',
    title: 'Remember',
    body: 'script turns documents into lasting memory — versioned, searchable, ready the moment someone asks.',
    caption: 'Every file becomes company memory — not a second silo.',
    frameLabel: 'Illustration — Remember',
  },
  {
    id: 'ask',
    title: 'Ask',
    body: 'Chat with the company brain. Get cited answers from the truth you already own.',
    caption: 'One question. Clearance-aware answers with citations.',
    frameLabel: 'Illustration — Ask',
  },
] as const;

const TRACK_VH = 160;

function useStickyStep(stepCount: number) {
  const trackRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) return;

    const onScroll = () => {
      const track = trackRef.current;
      if (!track) return;

      const rect = track.getBoundingClientRect();
      const travel = track.offsetHeight - window.innerHeight;
      if (travel <= 0) {
        setActive(0);
        return;
      }

      const scrolled = Math.min(Math.max(-rect.top, 0), travel);
      const progress = scrolled / travel;
      const next = Math.min(stepCount - 1, Math.floor(progress * stepCount));
      setActive(next);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [stepCount]);

  return { trackRef, active };
}

export function HowItWorksSection() {
  const { trackRef, active } = useStickyStep(BEATS.length);
  const current = BEATS[active];

  return (
    <section ref={trackRef} className="relative bg-[#FBFBFF]" style={{ height: `${TRACK_VH}vh` }}>
      <div className="sticky top-0 flex h-dvh flex-col overflow-hidden px-6 py-10 md:px-12 lg:px-20">
        <div className="mx-auto flex h-full w-full max-w-[1120px] flex-col">
          <div className="mb-8 shrink-0 text-center md:mb-10">
            <LandingTitle line1="How the brain" line2="works." />
            <p className="mx-auto m-0 mt-3 max-w-xl text-[15px] leading-relaxed text-[#555]">
              Scroll to move through ingest → remember → ask.
            </p>
          </div>

          <div className="grid min-h-0 flex-1 gap-8 lg:grid-cols-2 lg:items-stretch lg:gap-10">
            <div className="relative flex flex-col border-y border-neutral-200">
              <GridPlus className="left-0 top-0" />
              <GridPlus className="left-full top-0" />
              <GridPlus className="left-0 top-1/3" />
              <GridPlus className="left-full top-1/3" />
              <GridPlus className="left-0 top-2/3" />
              <GridPlus className="left-full top-2/3" />
              <GridPlus className="left-0 top-full" />
              <GridPlus className="left-full top-full" />

              <ol className="m-0 grid min-h-0 flex-1 list-none grid-rows-3 p-0">
                {BEATS.map((beat, index) => {
                  const isActive = index === active;
                  const isLast = index === BEATS.length - 1;
                  return (
                    <li
                      key={beat.id}
                      className={`min-h-0 ${isLast ? '' : 'border-b border-neutral-200'}`}
                    >
                      <article
                        className={`flex h-full flex-col justify-center p-5 transition-all duration-400 ease-out md:p-6 ${
                          isActive
                            ? 'bg-neutral-0 shadow-[0_18px_50px_-16px_rgba(0,0,0,0.12)]'
                            : 'bg-transparent'
                        }`}
                      >
                        <h3 className="m-0 mb-2 text-[20px] font-medium text-[#111] md:text-[22px]">
                          {beat.title}
                        </h3>
                        <p className="m-0 text-[14px] leading-relaxed text-[#555]">{beat.body}</p>
                      </article>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="relative hidden min-h-0 flex-col border-y border-neutral-200 lg:flex">
              <GridPlus className="left-0 top-0" />
              <GridPlus className="left-full top-0" />
              <GridPlus className="left-0 top-full" />
              <GridPlus className="left-full top-full" />

              <div className="relative border-b border-neutral-200 px-5 py-4">
                <GridPlus className="left-0 top-full" />
                <GridPlus className="left-full top-full" />
                <p className="font-serif m-0 text-center text-[15px] italic text-[#666]">
                  {current.caption}
                </p>
              </div>

              <div className="relative min-h-0 flex-1 p-4">
                {BEATS.map((beat, index) => (
                  <div
                    key={beat.frameLabel}
                    className={`absolute inset-4 transition-all duration-400 ease-out ${
                      index === active
                        ? 'translate-y-0 opacity-100'
                        : 'pointer-events-none translate-y-2 opacity-0'
                    }`}
                  >
                    <IllustrationFrame className="h-full w-full" label={beat.frameLabel} />
                  </div>
                ))}
              </div>
            </div>

            <div className="relative border-y border-neutral-200 lg:hidden">
              <GridPlus className="left-0 top-0" />
              <GridPlus className="left-full top-0" />
              <GridPlus className="left-0 top-full" />
              <GridPlus className="left-full top-full" />
              <div className="border-b border-neutral-200 px-4 py-3">
                <p className="font-serif m-0 text-center text-[14px] italic text-[#666]">
                  {current.caption}
                </p>
              </div>
              <div className="p-4">
                <IllustrationFrame className="h-[200px] w-full" label={current.frameLabel} />
              </div>
            </div>
          </div>

          <div className="mt-6 flex shrink-0 justify-center">
            <Link to="/app/signup">
              <Button type="button">Get early access</Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

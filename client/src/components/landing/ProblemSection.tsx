import React from 'react';
import { IconCheck, IconClose, IconSparkles } from '../../lib/icons';
import { GridPlus } from './GridPlus';
import { LandingTitle } from './LandingTitle';
import { Reveal } from './motion/Reveal';

const PROBLEM_CARDS = [
  {
    title: 'Scattered truth',
    items: [
      'Answers live in Slack, Drive, and email',
      'Nobody knows which version is real',
      'Decisions disappear into chat history',
    ],
  },
  {
    title: 'Manual hunting',
    items: [
      'Hours spent finding the right PDF',
      '“Who approved this?” goes unanswered',
      'New hires inherit chaos, not context',
    ],
  },
] as const;

const SOLUTION = {
  title: 'The company brain',
  items: [
    'Ask once — get cited answers from company memory',
    'Clearance-aware truth for every role',
    'Documents, systems, and decisions in one place to ask',
  ],
} as const;

export function ProblemSection() {
  return (
    <section id="product" className="relative bg-[#FBFBFF] px-6 py-24 md:px-12 lg:px-20">
      <div className="mx-auto w-full max-w-[1120px]">
        <Reveal className="mb-14 text-center">
          <p className="m-0 mb-4 text-[13px] font-medium tracking-wide text-neutral-400">
            [ the difference ]
          </p>
          <LandingTitle
            className="mb-4"
            line1="Where scattered truth ends,"
            line2="clarity begins"
          />
          <p className="mx-auto m-0 max-w-xl text-[15px] leading-relaxed text-[#555]">
            See how the company brain replaces Slack archaeology with one place to ask.
          </p>
        </Reveal>

        <Reveal delayMs={100}>
          <div className="relative border-y border-neutral-200">
            <GridPlus className="left-0 top-0" />
            <GridPlus className="left-1/3 top-0 max-md:hidden" />
            <GridPlus className="left-2/3 top-0 max-md:hidden" />
            <GridPlus className="left-full top-0" />
            <GridPlus className="left-0 top-full" />
            <GridPlus className="left-1/3 top-full max-md:hidden" />
            <GridPlus className="left-2/3 top-full max-md:hidden" />
            <GridPlus className="left-full top-full" />

            <div className="grid grid-cols-1 md:grid-cols-3">
              {PROBLEM_CARDS.map((card) => (
                <article
                  key={card.title}
                  className="flex flex-col border-b border-neutral-200 p-6 md:border-b-0 md:border-r md:border-neutral-200 md:p-8"
                >
                  <div
                    className="mb-5 flex h-9 w-9 items-center justify-center rounded-10 border border-neutral-200 bg-transparent text-neutral-400"
                    aria-hidden="true"
                  >
                    <IconClose size={16} />
                  </div>
                  <h3 className="m-0 mb-5 text-[18px] font-medium text-[#111]">{card.title}</h3>
                  <ul className="m-0 flex list-none flex-col gap-3 p-0">
                    {card.items.map((item) => (
                      <li key={item} className="flex gap-2 text-[14px] leading-relaxed text-[#777]">
                        <span className="shrink-0 text-neutral-400">-</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}

              <article className="relative flex flex-col overflow-hidden bg-neutral-0 p-6 md:p-8">
                <div
                  className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(96,96,255,0.14)_0%,rgba(96,96,255,0)_70%)]"
                  aria-hidden="true"
                />
                <div
                  className="pointer-events-none absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(96,96,255,0.08)_0%,rgba(96,96,255,0)_70%)]"
                  aria-hidden="true"
                />
                <div className="relative z-[1]">
                  <div
                    className="mb-5 flex h-9 w-9 items-center justify-center rounded-10 bg-primary text-neutral-0"
                    aria-hidden="true"
                  >
                    <IconCheck size={16} className="text-neutral-0" />
                  </div>
                  <h3 className="m-0 mb-5 text-[18px] font-medium text-[#111]">{SOLUTION.title}</h3>
                  <ul className="m-0 flex list-none flex-col gap-3 p-0">
                    {SOLUTION.items.map((item) => (
                      <li
                        key={item}
                        className="flex gap-2.5 text-[14px] leading-relaxed text-[#555]"
                      >
                        <span className="mt-0.5 shrink-0 text-primary" aria-hidden="true">
                          <IconSparkles size={14} />
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

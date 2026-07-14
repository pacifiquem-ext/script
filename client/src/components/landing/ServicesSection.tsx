import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { IllustrationFrame } from './IllustrationFrame';
import { Reveal } from './motion/Reveal';

const CELLS = [
  {
    id: 'ask',
    title: 'Ask anything',
    body: 'Instant answers from the whole Library — with citations you can trust.',
    className: 'md:col-span-2 md:row-span-2',
    frameClassName: 'h-[220px] md:h-[280px]',
    cta: true,
  },
  {
    id: 'ingest',
    title: 'Ingest everything',
    body: 'Old, new, signed, draft. Upload, cloud, or URL — it all becomes memory.',
    className: 'md:col-span-2',
    frameClassName: 'h-[140px]',
  },
  {
    id: 'clearance',
    title: 'Clearance-aware',
    body: 'Answers match what each person is allowed to see.',
    className: 'md:row-span-2',
    frameClassName: 'h-[200px] md:h-full md:min-h-[220px]',
  },
  {
    id: 'truth',
    title: 'One source of truth',
    body: 'Stop hunting Slack, Drive, and email for the real answer.',
    className: '',
    frameClassName: 'h-[120px]',
  },
  {
    id: 'voice',
    title: 'Voice memory',
    body: 'Meetings become searchable truth.',
    className: '',
    frameClassName: 'h-[120px]',
    badge: 'Coming soon',
  },
  {
    id: 'always',
    title: 'Always on',
    body: 'The Library grows. The brain stays current.',
    className: 'md:col-span-2',
    frameClassName: 'h-[140px]',
  },
] as const;

export function ServicesSection() {
  return (
    <section id="services" className="bg-[#FBFBFF] px-6 py-24 md:px-12 lg:px-20">
      <div className="mx-auto w-full max-w-[1120px]">
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="m-0 mb-3 text-[36px] font-medium leading-[110%] text-[#111] md:text-[48px]">
            What the brain does for you.
          </h2>
          <p className="m-0 text-[15px] leading-relaxed text-[#555]">
            Truth in. Answers out. Clearance kept.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:auto-rows-fr">
          {CELLS.map((cell, index) => (
            <Reveal key={cell.id} delayMs={index * 70} className={cell.className}>
              <article className="flex h-full flex-col rounded-20 border border-neutral-200 bg-neutral-0 p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h3 className="m-0 text-[20px] font-medium text-[#111]">{cell.title}</h3>
                  {'badge' in cell && cell.badge ? (
                    <span className="shrink-0 rounded-full bg-surface-chip px-2.5 py-1 text-[11px] font-medium text-primary-selection">
                      {cell.badge}
                    </span>
                  ) : null}
                </div>
                <IllustrationFrame className={`mb-4 w-full ${cell.frameClassName}`} />
                <p className="m-0 text-[14px] leading-relaxed text-[#555]">{cell.body}</p>
                {'cta' in cell && cell.cta ? (
                  <div className="mt-5">
                    <Link to="/app/signup">
                      <Button type="button" size="sm">
                        Ask the brain
                      </Button>
                    </Link>
                  </div>
                ) : null}
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

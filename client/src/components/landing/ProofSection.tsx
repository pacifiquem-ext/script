import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { IllustrationFrame } from './IllustrationFrame';
import { Reveal } from './motion/Reveal';

export function ProofSection() {
  return (
    <section id="proof" className="bg-[#FBFBFF] px-6 py-24 md:px-12 lg:px-20">
      <div className="mx-auto grid w-full max-w-[1120px] items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <div className="mb-6 inline-flex items-center gap-3 rounded-21 border-2 border-neutral-0 bg-surface-chip px-3.5 py-2.5 shadow-chip">
            <div className="flex" aria-hidden="true">
              {Array.from({ length: 4 }, (_, i) => (
                <span
                  key={i}
                  className="-ml-1.5 block h-[22px] w-[22px] rounded-full border-2 border-neutral-0 bg-avatar-placeholder first:ml-0"
                />
              ))}
            </div>
            <span className="text-[13px] text-primary-selection">2.4K on the waitlist</span>
          </div>
          <h2 className="m-0 mb-4 text-[36px] font-medium leading-[110%] text-[#111] md:text-[48px]">
            Built for teams who can&apos;t afford wrong answers.
          </h2>
          <p className="m-0 mb-8 max-w-md text-[15px] leading-relaxed text-[#555]">
            Join the teams turning documents into a living company brain — before everyone else does.
          </p>
          <Link to="/app/signup">
            <Button type="button">Get early access</Button>
          </Link>
        </Reveal>

        <Reveal delayMs={120}>
          <IllustrationFrame className="h-[300px] w-full md:h-[360px]" label="Illustration" />
        </Reveal>
      </div>
    </section>
  );
}

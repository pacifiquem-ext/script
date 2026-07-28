import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { IllustrationFrame } from './IllustrationFrame';
import { Reveal } from './motion/Reveal';

const PROMPTS = [
  {
    q: 'What did we agree in the Q3 vendor contract?',
    a: 'Payment nets 45 days, with a 12% volume discount above 10k units. Renewal auto-extends unless cancelled 30 days prior.',
    cite: 'Vendor_Agreement_Q3.pdf · p.4',
  },
  {
    q: 'Who approved the pricing change?',
    a: 'Maya Chen approved the regional pricing revision on March 12, with finance sign-off attached.',
    cite: 'Pricing_Change_Memo.pdf · p.1',
  },
  {
    q: 'Where is the signed MSA for Acme?',
    a: 'The executed MSA lives in Legal / Customers / Acme — signed copy dated Jan 8.',
    cite: 'Acme_MSA_Signed.pdf · p.12',
  },
] as const;

export function DemoSection() {
  const [active, setActive] = useState(0);
  const current = PROMPTS[active];

  return (
    <section id="ask" className="bg-[#FBFBFF] px-6 py-24 md:px-12 lg:px-20">
      <div className="mx-auto grid w-full max-w-[1120px] gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Reveal>
            <h2 className="m-0 mb-3 text-[36px] font-medium leading-[110%] text-[#111] md:text-[48px]">
              Ask the brain.
            </h2>
            <p className="m-0 mb-8 max-w-lg text-[15px] leading-relaxed text-[#555]">
              Try the kinds of questions your team already asks — answered from the company brain,
              with citations into your Library.
            </p>
          </Reveal>

          <div className="mb-6 flex flex-wrap gap-2">
            {PROMPTS.map((prompt, index) => (
              <Reveal key={prompt.q} delayMs={index * 80}>
                <button
                  type="button"
                  onClick={() => setActive(index)}
                  className={`rounded-12 border px-3 py-2 text-left text-[12px] transition-colors ${
                    active === index
                      ? 'border-primary bg-surface-chip text-primary-selection'
                      : 'border-neutral-200 bg-neutral-0 text-[#555] hover:border-neutral-300'
                  }`}
                >
                  {prompt.q}
                </button>
              </Reveal>
            ))}
          </div>

          <Reveal delayMs={160}>
            <div className="rounded-20 border border-neutral-200 bg-neutral-0 p-6">
              <p className="m-0 mb-4 text-[15px] leading-relaxed text-[#222]">{current.a}</p>
              <span className="inline-flex rounded-full bg-surface-chip px-3 py-1 text-[12px] text-primary-selection">
                {current.cite}
              </span>
            </div>
          </Reveal>

          <Reveal className="mt-8" delayMs={200}>
            <Link to="/app/signup">
              <Button type="button">Get early access</Button>
            </Link>
          </Reveal>
        </div>

        <Reveal delayMs={120}>
          <IllustrationFrame className="h-full min-h-[320px] w-full" label="Illustration" />
        </Reveal>
      </div>
    </section>
  );
}

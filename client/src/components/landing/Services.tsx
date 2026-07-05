import React from 'react';
import { IconFolder, IconSearch, IconChat, IconFile } from '../../lib/icons';

const FEATURES = [
  {
    icon: <IconFolder size={20} />,
    title: 'Centralize Your Documents',
    description:
      'Keep contracts, invoices, and records in one secure place—organized and easy to access.',
  },
  {
    icon: <IconSearch size={20} />,
    title: 'Find Anything Instantly',
    description:
      'Search by name, content, or meaning. No more digging through folders or email threads.',
  },
  {
    icon: <IconChat size={20} />,
    title: 'Ask Questions About Your Files',
    description:
      'Understand documents faster by asking simple questions and getting direct answers.',
  },
  {
    icon: <IconFile size={20} />,
    title: 'Extract Key Information',
    description:
      'Automatically pull important details like dates, amounts, and parties from your documents.',
  },
];

export function Services() {
  return (
    <section className="py-32 bg-white max-sm:py-20" id="services">
      <div className="container">
        <div className="flex flex-col items-center text-center gap-4 mb-16">
          <p className="text-subheading-md text-neutral-400 tracking-[0.08em]">What you can do</p>
          <h2 className="text-h3 max-w-[640px]">
            Everything your team needs
            <br />
            to work with documents
          </h2>
          <p className="text-para-lg max-w-[480px] text-neutral-600">
            Purpose-built for teams that deal with contracts, invoices, and records every day.
          </p>
        </div>

        <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-px bg-neutral-200">
          {FEATURES.map((feat, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 px-8 py-10 bg-white transition-colors duration-200 cursor-default hover:bg-neutral-25 group"
            >
              <div className="flex items-center justify-center w-10 h-10 bg-primary-base text-white rounded-10 shrink-0 transition-transform duration-250 group-hover:-rotate-6 group-hover:scale-110">
                {feat.icon}
              </div>
              <h3 className="text-neutral-950 text-label-lg">{feat.title}</h3>
              <p className="text-neutral-600 leading-[1.6] text-para-sm">{feat.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

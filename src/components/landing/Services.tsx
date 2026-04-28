import React from 'react';
import { IconFolder, IconSearch, IconChat, IconFile } from '../../lib/icons';
import './Services.css';

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
    <section className="services" id="services">
      <div className="container">
        <div className="services__header">
          <p className="text-subheading-md services__eyebrow">What you can do</p>
          <h2 className="text-h3 services__title">
            Everything your team needs
            <br />to work with documents
          </h2>
          <p className="text-para-lg services__sub">
            Purpose-built for teams that deal with contracts, invoices, and records every day.
          </p>
        </div>

        <div className="services__grid">
          {FEATURES.map((feat, i) => (
            <div key={i} className="service-card">
              <div className="service-card__icon">{feat.icon}</div>
              <h3 className="service-card__title text-label-lg">{feat.title}</h3>
              <p className="service-card__desc text-para-sm">{feat.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

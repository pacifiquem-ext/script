import React from 'react';
import { IconArrowRight, IconPlay } from '../../lib/icons';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import './Hero.css';

export function Hero() {
  return (
    <section className="hero">
      <div className="hero__grid" aria-hidden />

      <div className="container hero__content">
        <div className="hero__eyebrow">
          <Badge variant="neutral" dot>
            Now in early access
          </Badge>
        </div>

        <h1 className="hero__headline text-h1">
          Find and understand your
          <br />
          <span className="hero__headline-accent">documents in seconds.</span>
        </h1>

        <p className="hero__sub text-para-lg">
          Stop searching through folders, emails, and spreadsheets.
          Upload your documents and get instant answers, summaries,
          and key details&mdash;when you need them.
        </p>

        <div className="hero__cta">
          <Button
            size="md"
            rightIcon={<IconArrowRight size={16} />}
            onClick={() => (window.location.href = '/app/login')}
          >
            Get Started
          </Button>
        </div>
      </div>

      {/* Video showcase */}
      <div className="container hero__showcase-wrap" id="showcase">
        <div className="hero__showcase">
          <div className="hero__showcase-inner">
            <div className="hero__browser-bar">
              <div className="hero__browser-dots">
                <span /><span /><span />
              </div>
              <div className="hero__browser-url">
                <span className="text-para-xs" style={{ color: 'var(--text-soft-400)' }}>app.script.ai/documents</span>
              </div>
            </div>

            <div className="hero__app-preview">
              <img
                src="https://images.pexels.com/photos/7688336/pexels-photo-7688336.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
                alt="Script document workspace"
                className="hero__app-img"
              />
              <div className="hero__app-overlay">
                <button className="hero__play-btn" aria-label="Watch demo">
                  <IconPlay size={24} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

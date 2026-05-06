import React from 'react';
import { Link } from 'react-router-dom';

const FOOTER_LINKS = [
  { label: 'Features', href: '/#services' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Contact', href: '/contact' },
  { label: 'Privacy', href: '/privacy' },
];

const WORDMARK = 'script'.split('');

export function Footer() {
  return (
    <footer className="bg-white relative">
      <div className="container flex flex-col items-center text-center gap-8 pt-20 pb-8 max-sm:pt-12">
        <div className="flex flex-col items-center gap-3">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <span className="w-7 h-7 bg-primary-gradient rounded-8 relative after:absolute after:inset-[5px] after:border-2 after:border-white after:rounded-[3px] after:border-b-0 after:border-r-0 shrink-0" />
            <span className="text-[18px] font-semibold text-neutral-950 tracking-[-0.02em]">Script</span>
          </Link>
          <p className="text-neutral-400 max-w-[300px] text-para-md">
            Built for teams that work with documents every day.
          </p>
        </div>

        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-1 max-sm:gap-x-4">
          {FOOTER_LINKS.map(link => (
            <Link key={link.label} to={link.href} className="text-neutral-600 no-underline py-1 transition-colors hover:text-neutral-950 text-para-sm">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-9 h-9 text-neutral-400 rounded-8 border border-neutral-200 transition-all duration-200 hover:text-neutral-950 hover:bg-neutral-50 hover:border-neutral-300 hover:-rotate-6 hover:scale-110" aria-label="Twitter">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="transition-transform duration-200">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.734l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
            </svg>
          </a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-9 h-9 text-neutral-400 rounded-8 border border-neutral-200 transition-all duration-200 hover:text-neutral-950 hover:bg-neutral-50 hover:border-neutral-300 hover:-rotate-6 hover:scale-110" aria-label="GitHub">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="transition-transform duration-200">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
          </a>
        </div>

        <div className="w-full h-px bg-neutral-200" />

        <div className="pb-2">
          <p className="text-neutral-400 text-para-xs">
            &copy; {new Date().getFullYear()} Script. All rights reserved.
          </p>
        </div>
      </div>

      {/* Large stroke wordmark — 30% submerged (70% visible) */}
      <div className="flex justify-center leading-none overflow-hidden h-[clamp(63px,13.3vw,168px)] px-4 pointer-events-auto select-none" aria-hidden>
        {WORDMARK.map((letter, i) => (
          <span 
            key={i} 
            className="inline-block font-bold tracking-[-0.04em] leading-none text-transparent cursor-default origin-bottom transition-all duration-250 ease-in-out hover:text-transparent hover:scale-105 hover:-translate-y-1"
            style={{ 
              fontSize: 'clamp(90px, 19vw, 240px)', 
              WebkitTextStroke: '1.5px var(--text-disabled-300, #d4d4d4)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.webkitTextStrokeColor = '#00b258'}
            onMouseLeave={(e) => e.currentTarget.style.webkitTextStrokeColor = '#d4d4d4'}
          >
            {letter}
          </span>
        ))}
      </div>
    </footer>
  );
}

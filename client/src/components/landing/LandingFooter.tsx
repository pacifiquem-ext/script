import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Parallax } from './motion/Parallax';

const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '#product', label: 'Product' },
      { href: '#services', label: 'Services' },
      { href: '#integrations', label: 'Integrations' },
      { href: '#ask', label: 'Ask the brain' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '#proof', label: 'Waitlist' },
      { href: '#security', label: 'Security' },
      { href: 'mailto:hello@script.app', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '#security', label: 'Privacy' },
      { href: '#security', label: 'Clearance' },
    ],
  },
] as const;

export function LandingFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-neutral-200 bg-[#FBFBFF]">
      <div className="mx-auto w-full max-w-[1280px] px-6 pb-10 pt-16 md:px-12 lg:px-20">
        <div className="mb-14 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2.5">
              <span className="block h-7 w-7 rounded-[6px] bg-primary" aria-hidden="true" />
              <span className="text-[18px] font-medium text-[#111]">script</span>
            </div>
            <p className="m-0 max-w-sm text-[14px] leading-relaxed text-[#555]">
              The company brain. Documents, systems, and decisions — one place to ask.
            </p>
          </div>
          <Link to="/app/signup">
            <Button type="button">Get early access</Button>
          </Link>
        </div>

        <div className="mb-16 grid grid-cols-2 gap-10 md:grid-cols-3">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="mb-4 text-[12px] font-medium uppercase tracking-[0.08em] text-neutral-400">
                {column.title}
              </p>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}`}>
                    <a
                      href={link.href}
                      className="text-[14px] text-[#333] transition-colors hover:text-primary"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mb-10 flex flex-col gap-3 border-t border-neutral-200 pt-6 text-[12px] text-neutral-500 md:flex-row md:items-center md:justify-between">
          <p className="m-0">
            Answers match clearance. Workspace-scoped. Built for truth, not leaks.
          </p>
          <p className="m-0">© {new Date().getFullYear()} script</p>
        </div>
      </div>

      <div className="pointer-events-none relative h-[140px] overflow-hidden md:h-[180px] lg:h-[220px]">
        <Parallax speed={0.08} className="absolute inset-x-0 bottom-[-18%]">
          <p
            className="m-0 select-none whitespace-nowrap text-center font-medium leading-none text-black/[0.06]"
            style={{ fontSize: 'clamp(5rem, 18vw, 14rem)' }}
            aria-hidden="true"
          >
            script
          </p>
        </Parallax>
      </div>
    </footer>
  );
}

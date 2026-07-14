import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';

const NAV_LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#services', label: 'Services' },
  { href: '#integrations', label: 'Integrations' },
  { href: '#security', label: 'Security' },
] as const;

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-neutral-200/80 bg-[#FBFBFF]/80 backdrop-blur-xl'
          : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex h-[72px] w-full max-w-[1280px] items-center justify-between px-6 md:px-12 lg:px-20">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="block h-7 w-7 rounded-[6px] bg-primary" aria-hidden="true" />
          <span className="text-[18px] font-medium text-[#111]">script</span>
        </a>

        <ul className="m-0 hidden list-none items-center gap-7 p-0 md:flex" role="list">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-[13px] font-medium text-[#555] no-underline transition-colors hover:text-[#111]"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link to="/app/login">
            <Button type="button" variant="ghost" size="sm">
              Log in
            </Button>
          </Link>
          <Link to="/app/signup">
            <Button type="button" size="sm">
              Get early access
            </Button>
          </Link>
        </div>
      </nav>
    </header>
  );
}

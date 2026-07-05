import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IconMenu, IconClose, IconArrowRight } from '../../lib/icons';
import { Button } from '../ui/Button';

const NAV_LINKS = [
  { label: 'Features', href: '/#services' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/pricing' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isLanding = location.pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${
        scrolled || !isLanding
          ? 'bg-white/90 backdrop-blur-md shadow-[0_1px_0_theme(colors.neutral.200)]'
          : 'bg-transparent'
      }`}
    >
      <div className="container flex items-center h-[60px] gap-8">
        <Link to="/" className="flex items-center gap-2 no-underline shrink-0">
          <span className="w-7 h-7 bg-primary-base rounded-8 relative after:absolute after:inset-[5px] after:border-2 after:border-white after:rounded-[3px] after:border-b-0 after:border-r-0" />
          <span className="text-[18px] font-semibold text-neutral-950 tracking-[-0.02em]">
            Script
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 flex-1">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="px-2.5 py-1.5 text-neutral-600 rounded-8 transition-colors hover:text-neutral-950 hover:bg-neutral-50 no-underline text-label-sm"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2 shrink-0">
          <Link
            to="/app/login"
            className="px-2.5 py-1.5 text-neutral-600 rounded-8 transition-colors hover:text-neutral-950 hover:bg-neutral-50 no-underline text-label-sm"
          >
            Sign in
          </Link>
          <Button
            size="sm"
            rightIcon={<IconArrowRight size={16} />}
            onClick={() => (window.location.href = '/app/login')}
          >
            Get started
          </Button>
        </div>

        <button
          className="md:hidden flex bg-transparent border-none cursor-pointer text-neutral-950 p-1.5 rounded-8 ml-auto transition-colors hover:bg-neutral-50"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <IconClose size={20} /> : <IconMenu size={20} />}
        </button>
      </div>

      <div
        className={`md:hidden flex flex-col p-4 pb-6 gap-1 bg-white/95 backdrop-blur-md border-t border-neutral-200 transition-all duration-200 ${menuOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none absolute w-full'}`}
      >
        {NAV_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="px-3 py-2.5 text-neutral-600 rounded-8 transition-colors no-underline hover:text-neutral-950 hover:bg-neutral-50 text-label-md"
          >
            {link.label}
          </a>
        ))}
        <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-neutral-200">
          <Link
            to="/app/login"
            className="flex items-center justify-center h-10 px-4 rounded-10 text-sm font-medium bg-transparent text-neutral-950 shadow-[inset_0_0_0_1px_theme(colors.neutral.200)] hover:bg-neutral-50 transition-colors w-full"
          >
            Sign in
          </Link>
          <Link
            to="/app/login"
            className="flex items-center justify-center h-10 px-4 rounded-10 text-sm font-medium bg-primary-gradient text-white hover:bg-primary-gradient-hover shadow-sm transition-all w-full"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

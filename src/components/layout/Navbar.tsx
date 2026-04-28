import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IconMenu, IconClose, IconArrowRight } from '../../lib/icons';
import { Button } from '../ui/Button';
import './Navbar.css';

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

  useEffect(() => { setMenuOpen(false); }, [location]);

  return (
    <header className={`navbar ${scrolled ? 'navbar--scrolled' : ''} ${isLanding ? 'navbar--landing' : ''}`}>
      <div className="container navbar__inner">
        <Link to="/" className="navbar__logo">
          <span className="navbar__logo-mark" />
          <span className="navbar__logo-text">Script</span>
        </Link>

        <nav className="navbar__links">
          {NAV_LINKS.map(link => (
            <a key={link.label} href={link.href} className="navbar__link text-label-sm">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="navbar__actions">
          <Link to="/app/login" className="navbar__action-link text-label-sm">Sign in</Link>
          <Button
            size="sm"
            rightIcon={<IconArrowRight size={16} />}
            onClick={() => (window.location.href = '/app/login')}
          >
            Get started
          </Button>
        </div>

        <button className="navbar__mobile-toggle" onClick={() => setMenuOpen(v => !v)} aria-label="Toggle menu">
          {menuOpen ? <IconClose size={20} /> : <IconMenu size={20} />}
        </button>
      </div>

      <div className={`navbar__mobile-menu ${menuOpen ? 'navbar__mobile-menu--open' : ''}`}>
        {NAV_LINKS.map(link => (
          <a key={link.label} href={link.href} className="navbar__mobile-link text-label-md">
            {link.label}
          </a>
        ))}
        <div className="navbar__mobile-actions">
          <Link to="/app/login" className="btn btn--md btn--neutral-stroke" style={{ width: '100%', justifyContent: 'center' }}>
            Sign in
          </Link>
          <Link to="/app/login" className="btn btn--md btn--primary-filled" style={{ width: '100%', justifyContent: 'center' }}>
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

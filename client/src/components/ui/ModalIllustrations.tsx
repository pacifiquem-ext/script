import React from 'react';

/** Compact modal illustrations — primary-tinted, reusable across action modals. */

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-[88px] w-full max-w-[200px] items-center justify-center">
      {children}
    </div>
  );
}

export function ModalIllustrationFolder() {
  return (
    <Frame>
      <svg width="92" height="72" viewBox="0 0 92 72" fill="none" aria-hidden>
        <path
          d="M12 22c0-4.4 3.6-8 8-8h16l6 7h30c4.4 0 8 3.6 8 8v29c0 4.4-3.6 8-8 8H20c-4.4 0-8-3.6-8-8V22Z"
          fill="url(#mf)"
        />
        <path
          d="M18 28h56c2.2 0 4 1.8 4 4v24c0 3.3-2.7 6-6 6H20c-3.3 0-6-2.7-6-6V32c0-2.2 1.8-4 4-4Z"
          fill="#fff"
          fillOpacity="0.55"
        />
        <defs>
          <linearGradient id="mf" x1="12" y1="14" x2="80" y2="66" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8B8BFF" />
            <stop offset="1" stopColor="#6060FF" />
          </linearGradient>
        </defs>
      </svg>
    </Frame>
  );
}

export function ModalIllustrationLink() {
  return (
    <Frame>
      <svg width="88" height="72" viewBox="0 0 88 72" fill="none" aria-hidden>
        <rect x="18" y="14" width="52" height="44" rx="12" fill="url(#ml)" />
        <path
          d="M34 36h20M39 31l-6 5 6 5M49 31l6 5-6 5"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="ml" x1="18" y1="14" x2="70" y2="58" gradientUnits="userSpaceOnUse">
            <stop stopColor="#9A9AFF" />
            <stop offset="1" stopColor="#4B4BED" />
          </linearGradient>
        </defs>
      </svg>
    </Frame>
  );
}

export function ModalIllustrationRename() {
  return (
    <Frame>
      <svg width="88" height="72" viewBox="0 0 88 72" fill="none" aria-hidden>
        <rect x="20" y="12" width="40" height="48" rx="10" fill="url(#mr)" />
        <path d="M30 28h20M30 36h16M30 44h12" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        <path
          d="M52 40l12-12 5 5-12 12-6 1 1-6Z"
          fill="#fff"
          stroke="#6060FF"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="mr" x1="20" y1="12" x2="60" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8B8BFF" />
            <stop offset="1" stopColor="#3A3AD4" />
          </linearGradient>
        </defs>
      </svg>
    </Frame>
  );
}

export function ModalIllustrationDelete() {
  return (
    <Frame>
      <svg width="80" height="72" viewBox="0 0 80 72" fill="none" aria-hidden>
        <rect x="22" y="20" width="36" height="40" rx="10" fill="url(#md)" />
        <path d="M28 20V18c0-3.3 2.7-6 6-6h12c3.3 0 6 2.7 6 6v2" stroke="#fff" strokeWidth="2.2" />
        <path d="M30 32v18M40 32v18M50 32v18" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M18 20h44" stroke="#FF7A7A" strokeWidth="3" strokeLinecap="round" />
        <defs>
          <linearGradient id="md" x1="22" y1="20" x2="58" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF8B8B" />
            <stop offset="1" stopColor="#E53E3E" />
          </linearGradient>
        </defs>
      </svg>
    </Frame>
  );
}

export function ModalIllustrationMove() {
  return (
    <Frame>
      <svg width="96" height="72" viewBox="0 0 96 72" fill="none" aria-hidden>
        <rect x="10" y="18" width="34" height="36" rx="10" fill="#C7C7F5" />
        <rect x="52" y="18" width="34" height="36" rx="10" fill="url(#mm)" />
        <path
          d="M40 36h16M50 30l8 6-8 6"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="mm" x1="52" y1="18" x2="86" y2="54" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8B8BFF" />
            <stop offset="1" stopColor="#6060FF" />
          </linearGradient>
        </defs>
      </svg>
    </Frame>
  );
}

export function ModalIllustrationAdd() {
  return (
    <Frame>
      <svg width="92" height="72" viewBox="0 0 92 72" fill="none" aria-hidden>
        <rect x="14" y="16" width="40" height="40" rx="12" fill="url(#ma)" />
        <circle cx="62" cy="44" r="16" fill="#fff" stroke="#6060FF" strokeWidth="2" />
        <path d="M62 37v14M55 44h14" stroke="#6060FF" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M26 36h16M34 28v16" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        <defs>
          <linearGradient id="ma" x1="14" y1="16" x2="54" y2="56" gradientUnits="userSpaceOnUse">
            <stop stopColor="#9A9AFF" />
            <stop offset="1" stopColor="#4B4BED" />
          </linearGradient>
        </defs>
      </svg>
    </Frame>
  );
}

import React, { useEffect, useState } from 'react';

export function Navigation() {
  const [currentPath, setCurrentPath] = useState(() => {
    const hash = window.location.hash.slice(1);
    return hash || '/equipment';
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      setCurrentPath(hash || '/equipment');
      setOpen(false); // close mobile menu after navigation
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (path: string) => {
    window.location.hash = path;
  };

  const isActive = (path: string) => currentPath === path;

  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className="sticky top-0 z-50 bg-[#940000] text-white border-b border-black/20"
    >
      {/* Top bar */}
      <div className="mx-auto max-w-6xl px-3 sm:px-4 md:px-6">
        <div className="flex h-14 items-center gap-3 sm:gap-4 md:gap-6">
          {/* Brand */}
          <a
            href="#/equipment"
            className="flex items-center gap-2 min-w-0"
            onClick={(e) => {
              e.preventDefault();
              navigate('/equipment');
            }}
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.png`} // put file in /public/logo.png
              alt="PCG Ballistics Logo"
              className="h-7 w-7 shrink-0 object-contain"
            />
            <span className="truncate text-base font-semibold sm:text-lg md:text-xl">
              Long Range DOPE Calculator
            </span>
          </a>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Desktop buttons */}
          <div className="hidden md:flex items-center gap-1">
            <NavButton
              label="Equipment"
              active={isActive('/equipment')}
              onClick={() => navigate('/equipment')}
            />
            <NavButton
              label="Calculator"
              active={isActive('/calculator')}
              onClick={() => navigate('/calculator')}
            />
            <NavButton
              label="Add Group"
              active={isActive('/log')}
              onClick={() => navigate('/log')}
            />
            <NavButton
              label="Sessions & DOPE"
              active={isActive('/dope')}
              onClick={() => navigate('/dope')}
            />
          </div>

          {/* Mobile menu toggle */}
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            {/* simple hamburger icon */}
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu (collapsible) */}
      <div
        className={`md:hidden overflow-x-auto border-t border-white/10 ${
          open ? 'block' : 'hidden'
        }`}
      >
        <div className="mx-auto max-w-6xl px-3 sm:px-4 md:px-6 py-2 flex gap-2">
          <MobileButton
            label="Equipment"
            active={isActive('/equipment')}
            onClick={() => navigate('/equipment')}
          />
          <MobileButton
            label="Calculator"
            active={isActive('/calculator')}
            onClick={() => navigate('/calculator')}
          />
          <MobileButton
            label="Add Group"
            active={isActive('/log')}
            onClick={() => navigate('/log')}
          />
          <MobileButton
            label="Sessions & DOPE"
            active={isActive('/dope')}
            onClick={() => navigate('/dope')}
          />
        </div>
      </div>
    </nav>
  );
}

/* --- Small presentational helpers --- */

function NavButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm rounded-md transition-colors
        ${active ? 'bg-white text-[#940000] font-semibold' : 'hover:bg-white/10'}
      `}
    >
      {label}
    </button>
  );
}

function MobileButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-md px-3 py-2 text-sm
        ${active ? 'bg-white text-[#940000] font-semibold' : 'bg-white/10'}
      `}
    >
      {label}
    </button>
  );
}

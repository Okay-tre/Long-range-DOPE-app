import React, { useEffect, useState } from 'react';

export function Navigation() {
  const [currentPath, setCurrentPath] = useState(() => {
    const hash = window.location.hash.slice(1);
    return hash || '/equipment';
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setCurrentPath(window.location.hash.slice(1) || '/equipment');
      setOpen(false);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (path: string) => {
    window.location.hash = path;
  };

  const isActive = (path: string) => currentPath === path;

  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className="sticky top-0 z-50 border-b bg-[#940000] text-white"
    >
      <div className="mx-auto max-w-6xl px-3 sm:px-4 md:px-6">
        <div className="flex h-14 items-center gap-3 sm:gap-4 md:gap-6">
          {/* Logo + Title */}
          <a
            href="#/equipment"
            className="flex min-w-0 items-center gap-2"
            onClick={(e) => {
              e.preventDefault();
              navigate('/equipment');
            }}
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.png`} // ensure file exists at /public/logo.png
              alt="PCG Ballistics Logo"
              className="h-7 w-7 shrink-0 object-contain"
            />
            <span className="truncate text-base font-semibold sm:text-lg md:text-xl">
              Long Range DOPE Calculator
            </span>
          </a>

          <div className="flex-1" />

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            <NavButton label="Equipment" active={isActive('/equipment')} onClick={() => navigate('/equipment')} />
            <NavButton label="Calculator" active={isActive('/calculator')} onClick={() => navigate('/calculator')} />
            <NavButton label="Add Group" active={isActive('/log')} onClick={() => navigate('/log')} />
            <NavButton label="Sessions & DOPE" active={isActive('/dope')} onClick={() => navigate('/dope')} />
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`md:hidden border-t border-white/10 ${open ? 'block' : 'hidden'}`}>
        <div className="mx-auto max-w-6xl px-3 sm:px-4 md:px-6 py-2 flex gap-2 overflow-x-auto">
          <MobileButton label="Equipment" active={isActive('/equipment')} onClick={() => navigate('/equipment')} />
          <MobileButton label="Calculator" active={isActive('/calculator')} onClick={() => navigate('/calculator')} />
          <MobileButton label="Add Group" active={isActive('/log')} onClick={() => navigate('/log')} />
          <MobileButton label="Sessions & DOPE" active={isActive('/dope')} onClick={() => navigate('/dope')} />
        </div>
      </div>
    </nav>
  );
}

/* ---------------- helpers ---------------- */

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
      className={`rounded-md px-3 py-2 text-sm transition-colors
        ${active ? 'bg-white text-[#940000] font-semibold' : 'text-white hover:bg-white/10'}
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
        ${active ? 'bg-white text-[#940000] font-semibold' : 'text-white bg-white/10'}
      `}
    >
      {label}
    </button>
  );
}

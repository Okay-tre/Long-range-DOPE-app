import React, { useState, useEffect } from 'react';
import logoImage from '@/assets/logo.png';

export function Navigation() {
  const [currentPath, setCurrentPath] = useState(() => {
    const hash = window.location.hash.slice(1);
    return hash || '/equipment';
  });

  useEffect(() => {
    // Update currentPath when hash changes
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      setCurrentPath(hash || '/equipment');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (path: string) => {
    window.location.hash = path;
  };

  const isActive = (path: string) => currentPath === path;

  return (
    <nav className="ballistics-header border-b">
      <div className="container max-w-6xl mx-auto px-4 py-3">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            // no import for the logo
            <img src="/logo.png" alt="PCG Ballistics Logo" className="w-8 h-8 object-contain" />
            <h1 className="text-xl font-semibold text-white">
              Long Range DOPE Calculator
            </h1>
          </div>
          <div className="flex space-x-1">
            <button
              onClick={() => navigate('/equipment')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                isActive('/equipment')
                  ? 'bg-white text-[#940000] font-semibold'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              Equipment
            </button>
            <button
              onClick={() => navigate('/calculator')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                isActive('/calculator')
                  ? 'bg-white text-[#940000] font-semibold'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              Calculator
            </button>
            <button
              onClick={() => navigate('/log')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                isActive('/log')
                  ? 'bg-white text-[#940000] font-semibold'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              Add Group
            </button>
            <button
              onClick={() => navigate('/dope')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                isActive('/dope')
                  ? 'bg-white text-[#940000] font-semibold'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              Sessions & DOPE
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

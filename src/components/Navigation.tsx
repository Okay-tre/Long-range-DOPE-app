import React, { useState } from "react";

const pages = [
  { path: "/equipment", label: "Equipment" },
  { path: "/calc", label: "Ballistic Calculator" },
  { path: "/log", label: "Log" },
  { path: "/dope", label: "DOPE" },
];

export default function Navigation() {
  const [currentPath, setCurrentPath] = useState(
    () => window.location.hash.slice(1) || "/equipment"
  );

  const navigate = (path: string) => {
    window.location.hash = path;
    setCurrentPath(path);
  };

  return (
    <nav className="bg-red-700 text-white shadow">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <img
            src={`${import.meta.env.BASE_URL}logo-bullet.png`}
            alt="Logo"
            className="h-8 w-8"
          />
          <span className="font-bold text-lg">PCG Ballistics</span>
        </div>

        {/* Navigation links */}
        <div className="flex gap-2">
          {pages.map((page) => {
            const isActive = currentPath === page.path;
            return (
              <button
                key={page.path}
                onClick={() => navigate(page.path)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white text-red-700 border border-red-700"
                    : "bg-red-800 hover:bg-red-900 text-white"
                }`}
              >
                {page.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

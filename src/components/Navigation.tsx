// src/components/Navigation.tsx
import React, { useEffect, useState } from "react";

const TAB = (href: string, label: string, currentPath: string) => {
  const active = currentPath === href;
  return (
    <a
      key={href}
      href={`#${href}`}
      className={[
        "px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition",
        active
          ? "bg-white text-red-700 shadow"
          : "text-white/90 hover:text-white hover:bg-red-600/60"
      ].join(" ")}
    >
      {label}
    </a>
  );
};

export default function Navigation() {
  const [currentPath, setCurrentPath] = useState(() => window.location.hash.slice(1) || "/equipment");

  useEffect(() => {
    const h = () => setCurrentPath(window.location.hash.slice(1) || "/equipment");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-red-700 text-white border-b border-red-800">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 py-2 flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}logo-bullet.png`} alt="PCG Ballistics" className="w-7 h-7 object-contain shrink-0" />
        <div className="font-semibold tracking-wide">PCG Ballistics</div>
        <nav className="ml-auto flex items-center gap-2">
          {TAB("/equipment", "Equipment", currentPath)}
          {TAB("/calc", "Calculator", currentPath)}
          {TAB("/log", "Log", currentPath)}
          {TAB("/dope", "DOPE", currentPath)}
        </nav>
      </div>
    </header>
  );
}

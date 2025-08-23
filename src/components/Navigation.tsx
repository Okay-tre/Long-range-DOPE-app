// src/components/Navigation.tsx
import React, { useEffect, useState } from "react";
import logo from "../assets/logo-bullet.png"; // keep or remove if you don't have it

const TAB = (href: string, label: string, currentPath: string) => {
  const isActive = currentPath === href;
  return (
    <a
      href={`#${href}`}
      className={[
        "px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition",
        // active: white pill w/ red text, hover subtle
        isActive
          ? "bg-white text-[#8b0000]"
          : "text-white/95 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      {label}
    </a>
  );
};

export default function Navigation() {
  const [currentPath, setCurrentPath] = useState(
    () => (window.location.hash.slice(1) || "/calc")
  );

  useEffect(() => {
    const onHash = () => setCurrentPath(window.location.hash.slice(1) || "/calc");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <nav className="bg-[#8b0000] text-white">
      <div className="mx-auto max-w-6xl px-3 sm:px-4">
        <div className="h-14 flex items-center justify-between gap-3">
          {/* Left: logo + title */}
          <div className="flex items-center gap-3 min-w-0">
            {logo ? (
              <img
                src={logo}
                alt="PCG Ballistics"
                className="w-8 h-8 object-contain shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/20" />
            )}
            <span className="truncate font-semibold">
              Long Range DOPE Calculator
            </span>
          </div>

          {/* Right: tabs */}
          <div className="flex items-center gap-1 sm:gap-2">
            {TAB("/equipment", "Equipment", currentPath)}
            {TAB("/calc", "Calculator", currentPath)}
            {TAB("/log", "Add Group", currentPath)}
            {TAB("/dope", "Sessions & DOPE", currentPath)}
          </div>
        </div>
      </div>
    </nav>
  );
}

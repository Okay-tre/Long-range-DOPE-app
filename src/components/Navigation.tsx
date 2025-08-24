import React, { useEffect, useState } from "react";

const Tab = (href: string, label: string, currentPath: string) => {
  const active = currentPath === href;
  return (
    <a
      key={href}
      href={`#${href}`}
      aria-current={active ? "page" : undefined}
      // Inline style guarantees the red text even if a global rule tries to override it
      style={active ? { color: "var(--color-header-background)" } : undefined}
      className={[
        "px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition",
        active
          // “!” forces Tailwind to output with !important so it beats header’s inherited white
          ? "bg-white !text-[var(--color-header-background)] shadow"
          : "text-white/90 hover:text-white hover:bg-white/10"
      ].join(" ")}
    >
      {label}
    </a>
  );
};

export default function Navigation() {
  const [currentPath, setCurrentPath] = useState(
    () => window.location.hash.slice(1) || "/equipment"
  );

  useEffect(() => {
    const h = () => setCurrentPath(window.location.hash.slice(1) || "/equipment");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);

  return (
    <header className="ballistics-header sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 py-2 flex items-center gap-3">
        <img
          src={`${import.meta.env.BASE_URL}logo-bullet.png`}
          alt="PCG Ballistics"
          className="w-7 h-7 object-contain shrink-0"
        />
        <div className="font-semibold tracking-wide">PCG Ballistics</div>
        <nav className="ml-auto flex items-center gap-2">
          {Tab("/equipment", "Equipment", currentPath)}
          {Tab("/calc", "Calculator", currentPath)}
          {Tab("/log", "Log", currentPath)}
          {Tab("/dope", "DOPE", currentPath)}
        </nav>
      </div>
    </header>
  );
}

import React, { useEffect, useState } from "react";

type NavRoute = { path: string; label: string; component?: React.ReactNode };

export default function Navigation({ routes }: { routes: NavRoute[] }) {
  const [currentPath, setCurrentPath] = useState(
    () => window.location.hash.slice(1) || routes[0]?.path || "/equipment"
  );

  useEffect(() => {
    const onHash = () => setCurrentPath(window.location.hash.slice(1) || routes[0]?.path || "/equipment");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [routes]);

  const TAB = (href: string, label: string) => {
    const isActive = currentPath === href;
    return (
      <a
        key={href}
        href={`#${href}`}
        className={[
          "px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition",
          // active: white pill w/ red text; inactive: darker red button w/ white text
          isActive
            ? "bg-white text-red-700"
            : "bg-red-700 text-white hover:bg-red-800",
        ].join(" ")}
      >
        {label}
      </a>
    );
  };

  return (
    <header className="sticky top-0 z-40">
      <div className="w-full bg-red-600 text-white border-b border-red-700/60">
        <nav className="container mx-auto flex items-center gap-2 px-3 py-2">
          <a href="#/equipment" className="flex items-center gap-2 shrink-0">
            {/* Works with public/logo-bullet.png */}
            <img
              src={`${import.meta.env.BASE_URL}logo-bullet.png`}
              alt="PCG Ballistics"
              className="w-6 h-6 object-contain"
            />
            <span className="hidden sm:inline font-semibold">PCG Ballistics</span>
          </a>
          <div className="ml-auto flex flex-wrap gap-2">
            {routes.map((r) => TAB(r.path, r.label))}
          </div>
        </nav>
      </div>
    </header>
  );
}

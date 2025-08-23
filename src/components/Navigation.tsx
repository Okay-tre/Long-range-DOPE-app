import React, { useEffect, useState } from "react";

export default function Navigation() {
  const [currentPath, setCurrentPath] = useState(
    () => window.location.hash.slice(1) || "/calc"
  );

  useEffect(() => {
    const onHash = () => setCurrentPath(window.location.hash.slice(1) || "/calc");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (path: string) => (window.location.hash = path);
  const isActive = (path: string) => currentPath === path;

  // Serve from public/ with Vite base (works on GH Pages)
  const logoSrc = `${import.meta.env.BASE_URL}logo-bullet.png`;

  return (
    <nav className="w-full bg-[#8B0000] text-white sticky top-0 z-50 shadow">
      <div className="max-w-6xl mx-auto px-3 sm:px-4">
        <div className="h-12 flex items-center justify-between gap-3">
          {/* Brand */}
          <button
            onClick={() => navigate("/calc")}
            className="flex items-center gap-2 shrink-0"
          >
            <img
              src={logoSrc}
              alt="PCG Ballistics"
              className="h-6 w-6 object-contain"
              onError={(e) => {
                // graceful fallback if logo missing
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <span className="font-semibold tracking-tight">
              Long Range DOPE Calculator
            </span>
          </button>

          {/* Tabs */}
          <div className="flex items-center gap-1">
            {[
              { href: "/equipment", label: "Equipment" },
              { href: "/calc", label: "Calculator" },
              { href: "/log", label: "Add Group" },
              { href: "/dope", label: "Sessions & DOPE" },
            ].map((t) => (
              <button
                key={t.href}
                onClick={() => navigate(t.href)}
                className={[
                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                  isActive(t.href)
                    ? "bg-white text-[#8B0000] font-semibold"
                    : "text-white/90 hover:bg-white/10"
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}

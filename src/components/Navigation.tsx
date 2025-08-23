import React, { useEffect, useState } from "react";

// NOTE: put your logo at public/logo.png (already works in GH Pages too)
const logoUrl = "/Long-range-DOPE-app/logo.png"; // keeps working on Pages since base is set

export default function Navigation() {
  const [currentPath, setCurrentPath] = useState(
    () => window.location.hash.slice(1) || "/equipment"
  );

  useEffect(() => {
    const onHash = () => setCurrentPath(window.location.hash.slice(1) || "/equipment");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (path: string) => {
    if (window.location.hash.slice(1) !== path) {
      window.location.hash = path;
    }
  };

  const isActive = (path: string) => currentPath === path;

  return (
    <nav className="sticky top-0 z-50 bg-[#940000] text-white shadow">
      <div className="mx-auto max-w-6xl px-3 sm:px-4">
        <div className="flex h-12 sm:h-14 items-center justify-between gap-3">
          {/* left: brand */}
          <button
            onClick={() => navigate("/equipment")}
            className="flex items-center gap-2 shrink-0 focus:outline-none"
          >
            {/* no import needed for this image */}
            <img
              src={logoUrl}
              alt="PCG Ballistics"
              className="h-7 w-7 object-contain"
              onError={(e) => {
                // hides the broken icon if /logo.png missing
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <span className="hidden sm:block text-sm sm:text-base font-semibold">
              Long Range DOPE Calculator
            </span>
          </button>

          {/* right: nav buttons - horizontally scrollable on small screens */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-end">
              <div className="flex gap-1 overflow-x-auto no-scrollbar">
                <NavBtn
                  label="Equipment"
                  active={isActive("/equipment")}
                  onClick={() => navigate("/equipment")}
                />
                <NavBtn
                  label="Calculator"
                  active={isActive("/calc")}
                  onClick={() => navigate("/calc")}
                />
                <NavBtn
                  label="Add Group"
                  active={isActive("/log")}
                  onClick={() => navigate("/log")}
                />
                <NavBtn
                  label="Sessions & DOPE"
                  active={isActive("/dope")}
                  onClick={() => navigate("/dope")}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavBtn({
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
      className={[
        "px-3 sm:px-4 h-8 sm:h-9 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "bg-white text-[#940000]"
          : "text-white/90 hover:bg-white/15"
      ].join(" ")}
    >
      {label}
    </button>
  );
}

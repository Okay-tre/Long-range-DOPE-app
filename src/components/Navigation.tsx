import React, { useState, useEffect } from "react";
import logo from "../assets/logo-bullet.png"; // or your current logo path

export default function Navigation() {
  const [currentPath, setCurrentPath] = useState(
    () => window.location.hash.slice(1) || "/equipment"
  );

  useEffect(() => {
    const onHash = () => setCurrentPath(window.location.hash.slice(1) || "/equipment");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (path: string) => (window.location.hash = path);
  const isActive = (p: string) => currentPath === p;

  return (
    <nav className="sticky top-0 z-50 bg-[#940000] text-white border-b border-[#7a0000]">
      <div className="mx-auto max-w-6xl px-3">
        <div className="flex items-center justify-between py-2">
          {/* Left: logo + title */}
          <button
            className="flex items-center gap-2 shrink-0"
            onClick={() => navigate("/equipment")}
            aria-label="Go to Equipment"
          >
            {/* Hide the image if your asset isn’t set up yet */}
            {logo ? <img src={logo} className="h-8 w-8" alt="PCG Ballistics" /> : null}
            <span className="font-semibold text-lg">Long Range DOPE Calculator</span>
          </button>

          {/* Right: tabs (wrap on small screens) */}
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => navigate("/equipment")}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                isActive("/equipment")
                  ? "bg-white text-[#940000] font-semibold"
                  : "text-white hover:bg-white/10"
              }`}
            >
              Equipment
            </button>
            <button
              onClick={() => navigate("/calc")}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                isActive("/calc")
                  ? "bg-white text-[#940000] font-semibold"
                  : "text-white hover:bg-white/10"
              }`}
            >
              Calculator
            </button>
            <button
              onClick={() => navigate("/log")}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                isActive("/log")
                  ? "bg-white text-[#940000] font-semibold"
                  : "text-white hover:bg-white/10"
              }`}
            >
              Add Group
            </button>
            <button
              onClick={() => navigate("/dope")}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                isActive("/dope")
                  ? "bg-white text-[#940000] font-semibold"
                  : "text-white hover:bg-white/10"
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

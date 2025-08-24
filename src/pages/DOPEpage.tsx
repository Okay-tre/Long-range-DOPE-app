// src/pages/DOPEpage.tsx
import React, { useMemo, useState } from "react";
import { useApp } from "../contexts/AppContext";
import { SessionManager } from "../components/SessionManager";
import { PDFExport } from "../components/PDFExport";
import { StorageManager } from "../components/StorageManager";
import { EquipmentManager } from "../components/EquipmentManager";
import { toast } from "sonner@2.0.3";
import type { Entry } from "../lib/appState";
import { solveTrajectory } from "../lib/calcEngine";

/* small UI */
const KV = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between bg-card px-2 py-1 border">
    <span className="text-xs">{k}</span>
    <span className="font-mono text-xs">{v}</span>
  </div>
);

/* helpers */
const round10 = (x: number) => Math.round(x * 10) / 10;
const fmtElev = (mil: number, moa: number, units: "MIL" | "MOA") => {
  const v = units === "MIL" ? mil : moa;
  if (!Number.isFinite(v) || Math.abs(v) < 0.05) return "0.0";
  return `${v > 0 ? "U" : "D"}${Math.abs(v).toFixed(1)}`;
};

type DOPEEntry = {
  range: number;
  elevationMil: number;
  elevationMoa: number;
  actualEntries: number;
  confidence: "high" | "medium" | "low";
};

function buildRow(rangeM: number, profile: {
  V0: number; BC: number; model: "G1"|"G7"|"noDrag";
  y0Cm: number; zeroDistanceM: number;
  tempC: number; humidity: number; windSpeed: number; windDir: number;
}) {
  const env = { temperatureC: profile.tempC, humidityPct: profile.humidity };
  const t = solveTrajectory({
    bc: profile.BC,
    model: profile.model,
    muzzleV: profile.V0,
    bulletWeightGr:  profile.model ?  profile.V0 /* unused but required in some sigs */ :  profile.V0,
    zeroDistanceM: profile.zeroDistanceM,
    scopeHeightMm: profile.y0Cm * 10,
    rangeM,
    env,
    wind: { speed: profile.windSpeed, directionDeg: profile.windDir }
  });

  let mil = Number.isFinite(t.holdMil) ? t.holdMil : 0;
  let moa = Number.isFinite(t.holdMoa) ? t.holdMoa : mil * 3.437746;

  if (Math.abs(mil) < 1e-6 && Math.abs(rangeM - profile.zeroDistanceM) > 0.5) {
    const tz = solveTrajectory({
      bc: profile.BC,
      model: profile.model,
      muzzleV: profile.V0,
      bulletWeightGr: profile.V0,
      zeroDistanceM: profile.zeroDistanceM,
      scopeHeightMm: profile.y0Cm * 10,
      rangeM: profile.zeroDistanceM,
      env,
      wind: { speed: profile.windSpeed, directionDeg: profile.windDir }
    });
    const extraDrop = (t.drop ?? 0) - (tz.drop ?? 0);
    mil = (extraDrop / Math.max(rangeM, 1)) * 1000;
    moa = mil * 3.437746;
  }

  return {
    range: Math.round(rangeM),
    elevationMil: round10(mil),
    elevationMoa: round10(moa),
    actualEntries: 0,
    confidence: Math.abs(rangeM - profile.zeroDistanceM) <= 1 ? "high" : "medium"
  } as DOPEEntry;
}

export function DOPEPage() {
  const { state, setState, navigate } = useApp();
  const { session, entries, calculator } = state;

  // ensure a session exists
  if (!session) {
    const s = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), title: "Default Session", place: "" };
    setState({ ...state, session: s });
    return <div className="p-6 text-center text-muted-foreground">Initializing session…</div>;
  }

  const [sortBy, setSortBy] = useState<"date" | "range">("date");
  const [filterRange, setFilterRange] = useState({ min: "", max: "" });
  const [filterNotes, setFilterNotes] = useState("");
  const [showStorageManager, setShowStorageManager] = useState(false);

  const filtered = entries
    .filter(e => (!filterRange.min || e.rangeM >= Number(filterRange.min)) && (!filterRange.max || e.rangeM <= Number(filterRange.max)))
    .filter(e => !filterNotes || (e.notes || "").toLowerCase().includes(filterNotes.toLowerCase()))
    .sort((a,b) => sortBy === "date" ? (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : (a.rangeM - b.rangeM));

  // Build a profile from entries, or fall back to current calculator so the page still works.
  const profile = useMemo(() => {
    if (filtered.length) {
      const avg = <T extends number>(xs: T[], d: T) => {
        const ys = xs.filter((n) => Number.isFinite(n)) as number[];
        return (ys.length ? ys.reduce((a,b)=>a+b,0)/ys.length : d) as T;
      };
      const models = filtered.map(e=>e.model);
      const most = models.sort((a,b)=>models.filter(x=>x===a).length - models.filter(x=>x===b).length).pop() ?? "G7";
      return {
        V0: avg(filtered.map(e=>e.V0), 800),
        BC: avg(filtered.map(e=>e.bcUsed ?? 0.25), 0.25),
        model: most as "G1"|"G7"|"noDrag",
        y0Cm: filtered[0].y0Cm ?? 3.5,
        zeroDistanceM: avg(filtered.map(e=>e.zeroDistanceM ?? 100), 100),
        tempC: avg(filtered.map(e=>e.temperature), 15),
        humidity: avg(filtered.map(e=>e.humidity), 50),
        windSpeed: avg(filtered.map(e=>e.windSpeed), 0),
        windDir: avg(filtered.map(e=>e.windDirection), 0),
      };
    }
    // fallback from calculator
    return {
      V0: state.calculator.V0 ?? 800,
      BC: state.calculator.bc ?? 0.25,
      model: (state.calculator.model ?? "G7") as "G1"|"G7"|"noDrag",
      y0Cm: state.calculator.y0Cm ?? 3.5,
      zeroDistanceM: state.calculator.zeroDistanceM ?? 100,
      tempC: state.calculator.temperature ?? 15,
      humidity: state.calculator.humidity ?? 50,
      windSpeed: state.calculator.windSpeed ?? 0,
      windDir: state.calculator.windDirection ?? 0,
    };
  }, [filtered, state.calculator]);

  // ranges to show
  const dopeRows: DOPEEntry[] = useMemo(() => {
    const step = 50;
    const maxR = Math.max(500, Math.ceil(((filtered.length ? Math.max(...filtered.map(e=>e.rangeM)) : 300))/step)*step);
    const set = new Set<number>();
    set.add(Math.round(profile.zeroDistanceM));
    for (let r = step; r <= maxR; r += step) set.add(r);
    if (filtered.length) filtered.forEach(e=>set.add(Math.round(e.rangeM)));
    return Array.from(set).sort((a,b)=>a-b).map(r => buildRow(r, profile));
  }, [filtered, profile]);

  return (
    <div className="container max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">DOPE (Data On Previous Engagement)</h2>
        <button onClick={() => setShowStorageManager(s=>!s)} className="px-3 py-1 bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80">
          {showStorageManager ? "Hide" : "Show"} Storage Manager
        </button>
      </div>

      {showStorageManager && (
        <div className="space-y-4">
          <StorageManager />
          <EquipmentManager />
        </div>
      )}

      {/* Session controls */}
      <div className="p-3 border bg-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0"><SessionManager compact showNewSession={false} /></div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => navigate("/log")} className="px-3 py-1 bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80">Add Entry</button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="p-3 border bg-card space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium">Sort by:</label>
            <select value={sortBy} onChange={(e)=>setSortBy(e.target.value as any)} className="w-full px-2 py-1 border">
              <option value="date">Date (newest first)</option>
              <option value="range">Range (ascending)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Range filter:</label>
            <div className="flex gap-1">
              <input type="number" placeholder="Min" value={filterRange.min} onChange={(e)=>setFilterRange({...filterRange, min: e.target.value})} className="w-full px-2 py-1 border" />
              <input type="number" placeholder="Max" value={filterRange.max} onChange={(e)=>setFilterRange({...filterRange, max: e.target.value})} className="w-full px-2 py-1 border" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Notes filter:</label>
            <input type="text" placeholder="Search notes..." value={filterNotes} onChange={(e)=>setFilterNotes(e.target.value)} className="w-full px-2 py-1 border" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <PDFExport entries={filtered} session={session} />
        </div>
      </div>

      {/* Table */}
      <div className="border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Range</th>
                <th className="px-3 py-2 text-left">Firearm</th>
                <th className="px-3 py-2 text-left">Ammo</th>
                <th className="px-3 py-2 text-left">Elevation ({calculator.scopeUnits})</th>
                <th className="px-3 py-2 text-left">Windage ({calculator.scopeUnits})</th>
                <th className="px-3 py-2 text-left">Group</th>
                <th className="px-3 py-2 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    No entries yet — showing a calculated DOPE table from your current calculator values below.
                    <div className="mt-2">
                      <button onClick={() => navigate("/log")} className="text-primary hover:underline">Add your first entry</button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const elevMil = e.actualAdjMil?.up ?? 0;
                  const elevMoa = e.actualAdjMoa?.up ?? 0;
                  const windMil = e.actualAdjMil?.right ?? 0;
                  const windMoa = e.actualAdjMoa?.right ?? 0;
                  const windText = calculator.scopeUnits === "MIL"
                    ? (Math.abs(windMil) < 0.05 ? "0.0" : `${windMil > 0 ? "L" : "R"}${Math.abs(windMil).toFixed(1)}`)
                    : (Math.abs(windMoa) < 0.05 ? "0.0" : `${windMoa > 0 ? "L" : "R"}${Math.abs(windMoa).toFixed(1)}`);
                  return (
                    <tr key={e.id} className="border-t hover:bg-muted/50">
                      <td className="px-3 py-2">{new Date(e.createdAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2 font-mono">{e.rangeM}m</td>
                      <td className="px-3 py-2">{e.firearmName || "N/A"}</td>
                      <td className="px-3 py-2">{e.ammoName || "N/A"}</td>
                      <td className="px-3 py-2 font-mono">{fmtElev(elevMil, elevMoa, calculator.scopeUnits)}</td>
                      <td className="px-3 py-2 font-mono">{windText}</td>
                      <td className="px-3 py-2">{e.groupSizeCm ? `${e.groupSizeCm}cm` : "N/A"}</td>
                      <td className="px-3 py-2">{e.notes || "N/A"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Always show a DOPE card (from entries or from calculator fallback) */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold">DOPE (Calculated)</h3>
        <div className="border p-4 bg-card">
          <div className="mb-4 p-3 bg-muted">
            <div className="text-sm font-medium mb-2">Ballistic Profile</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <KV k="V₀" v={`${Math.round(profile.V0)} m/s`} />
              <KV k="BC" v={profile.BC.toFixed(3)} />
              <KV k="Model" v={profile.model} />
              <KV k="Zero" v={`${profile.zeroDistanceM}m`} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="border px-2 py-1 text-left">Range (m)</th>
                  <th className="border px-2 py-1 text-left">Elevation ({calculator.scopeUnits})</th>
                  <th className="border px-2 py-1 text-left">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {dopeRows.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                    <td className="border px-2 py-1 font-mono">{r.range}</td>
                    <td className="border px-2 py-1 font-mono">{fmtElev(r.elevationMil, r.elevationMoa, calculator.scopeUnits)}</td>
                    <td className={`border px-2 py-1 ${r.confidence === "high" ? "text-green-600" : r.confidence === "medium" ? "text-yellow-600" : "text-red-600"}`}>
                      {r.confidence}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

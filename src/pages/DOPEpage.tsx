// src/pages/DOPEpage.tsx
import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import {
  deleteEntry,
  deleteSession,
  exportJSON,
  exportSessionJSON,
  importEntriesJSON,
} from "./dope.handlers";
import { SessionManager } from "../components/SessionManager";
import { PDFExport } from "../components/PDFExport";
import { StorageManager } from "../components/StorageManager";
import { EquipmentManager } from "../components/EquipmentManager";
import { toast } from "sonner@2.0.3";
import type { Entry } from "../lib/appState";
import { solveTrajectory } from "../lib/calcEngine";

/* ---------------- Small UI bit ---------------- */
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between bg-card px-2 py-1 border">
      <span className="text-xs">{k}</span>
      <span className="font-mono text-xs">{v}</span>
    </div>
  );
}

/* ---------------- Local types ---------------- */
type ModelKind = "G1" | "G7" | "noDrag";

type TableRow =
  | {
      type: "session";
      sessionId: string;
      sessionTitle: string;
      sessionPlace: string;
      sessionStarted: string;
      rangeM?: number;
      bulletInfo?: string;
      firearmName?: string;
      humidity?: number;
      windSpeed?: number;
      windDirection?: number;
    }
  | { type: "entry"; entry: Entry };

interface DOPEEntry {
  range: number;
  elevationMil: number;
  elevationMoa: number;
  isCalculated: boolean;
  actualEntries: number;
  confidence: "high" | "medium" | "low";
}

interface BallisticProfile {
  V0: number;
  BC: number;
  model: ModelKind;
  bulletWeightGr: number;
  scopeHeightMm: number; // mm
  zeroDistanceM: number;
  temperatureC: number;
  humidityPct: number;
  windSpeed: number;
  windDirectionDeg: number;
}

/* ---------------- Utils ---------------- */
const round10 = (x: number) => Math.round(x * 10) / 10;
const safe = (n: any, fb = 0) => (Number.isFinite(n) ? Number(n) : fb);

const mostCommon = <T,>(xs: T[], fb: T): T => {
  if (!xs.length) return fb;
  const m = new Map<T, number>();
  xs.forEach((x) => m.set(x, (m.get(x) || 0) + 1));
  let best = fb;
  let score = -1;
  m.forEach((v, k) => {
    if (v > score) {
      score = v;
      best = k;
    }
  });
  return best;
};

const avg = (xs: number[], fb = 0) => {
  const ys = xs.filter((n) => Number.isFinite(n));
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : fb;
};

function groupEntriesByRifleAmmo(entries: Entry[]): Map<string, Entry[]> {
  const g = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = `${e.firearmName || "Unknown Rifle"}_${e.ammoName || "Unknown Ammo"}_${
      e.bulletWeightGr || 0
    }gr`;
    if (!g.has(key)) g.set(key, []);
    g.get(key)!.push(e);
  }
  return g;
}

function profileFromEntries(entries: Entry[]): BallisticProfile {
  if (!entries.length) {
    // should not be called when empty; we have a calculator fallback elsewhere
    return {
      V0: 800,
      BC: 0.25,
      model: "G7",
      bulletWeightGr: 175,
      scopeHeightMm: 35,
      zeroDistanceM: 100,
      temperatureC: 15,
      humidityPct: 50,
      windSpeed: 0,
      windDirectionDeg: 0,
    };
  }

  return {
    V0: avg(entries.map((e) => e.V0), 800),
    BC: avg(entries.map((e) => safe(e.bcUsed, 0.25)), 0.25),
    model: mostCommon<ModelKind>(entries.map((e) => e.model as ModelKind), "G7"),
    bulletWeightGr: safe(entries[0].bulletWeightGr, 175),
    scopeHeightMm: safe(entries[0].y0Cm, 3.5) * 10,
    zeroDistanceM: avg(
      entries.map((e) => safe(e.zeroDistanceM, Number.NaN)),
      100
    ),
    temperatureC: avg(entries.map((e) => e.temperature), 15),
    humidityPct: avg(entries.map((e) => e.humidity), 50),
    windSpeed: avg(entries.map((e) => e.windSpeed), 0),
    windDirectionDeg: avg(entries.map((e) => e.windDirection), 0),
  };
}

function profileFromCalculator(state: ReturnType<typeof useApp>["state"]): BallisticProfile {
  const c = state.calculator;
  return {
    V0: safe(c.V0, 800),
    BC: safe(c.bc, 0.25),
    model: (c.model as ModelKind) || "G7",
    bulletWeightGr: safe(c.bulletWeightGr, 175),
    scopeHeightMm: safe(c.y0Cm, 3.5) * 10,
    zeroDistanceM: safe(c.zeroDistanceM, 100),
    temperatureC: safe(c.temperature, 15),
    humidityPct: safe(c.humidity, 50),
    windSpeed: safe(c.windSpeed, 0),
    windDirectionDeg: safe(c.windDirection, 0),
  };
}

function makeRangeCounts(entries: Entry[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of entries) m.set(e.rangeM, (m.get(e.rangeM) || 0) + 1);
  return m;
}

function buildRow(rangeM: number, p: BallisticProfile): DOPEEntry {
  const t = solveTrajectory({
    bc: p.BC,
    model: p.model,
    muzzleV: p.V0,
    bulletWeightGr: p.bulletWeightGr,
    zeroDistanceM: p.zeroDistanceM,
    scopeHeightMm: p.scopeHeightMm,
    rangeM,
    env: { temperatureC: p.temperatureC, humidityPct: p.humidityPct },
    wind: { speed: p.windSpeed, directionDeg: p.windDirectionDeg },
  });

  let mil = safe(t.holdMil, 0);
  let moa = safe(t.holdMoa, mil * 3.437746);

  // If hold returned 0 away from zero distance, compute by differential drop
  if (Math.abs(mil) < 1e-6 && Math.abs(rangeM - p.zeroDistanceM) > 0.5) {
    const atZero = solveTrajectory({
      bc: p.BC,
      model: p.model,
      muzzleV: p.V0,
      bulletWeightGr: p.bulletWeightGr,
      zeroDistanceM: p.zeroDistanceM,
      scopeHeightMm: p.scopeHeightMm,
      rangeM: p.zeroDistanceM,
      env: { temperatureC: p.temperatureC, humidityPct: p.humidityPct },
      wind: { speed: p.windSpeed, directionDeg: p.windDirectionDeg },
    });
    const dDrop = safe(t.drop, 0) - safe(atZero.drop, 0);
    mil = (dDrop / Math.max(rangeM, 1)) * 1000;
    moa = mil * 3.437746;
  }

  return {
    range: Math.round(rangeM),
    elevationMil: round10(mil),
    elevationMoa: round10(moa),
    isCalculated: true,
    actualEntries: 0,
    confidence: "medium",
  };
}

function generateDOPETable(entries: Entry[], p: BallisticProfile): DOPEEntry[] {
  const counts = makeRangeCounts(entries);
  const actual = Array.from(counts.keys()).sort((a, b) => a - b);
  const maxActual = actual.length ? Math.max(...actual) : 300;
  const step = maxActual <= 100 ? 10 : 50;
  const maxOut = Math.max(500, Math.ceil(maxActual / step) * step);

  const want = new Set<number>();
  want.add(Math.round(p.zeroDistanceM));
  for (let r = step; r <= maxOut; r += step) want.add(r);
  actual.forEach((r) => want.add(Math.round(r)));

  const rows = Array.from(want)
    .sort((a, b) => a - b)
    .map((r) => buildRow(r, p));

  // annotate with confidence & counts
  for (const row of rows) {
    row.actualEntries = counts.get(row.range) || 0;
    const nearest = actual.reduce(
      (m, a) => Math.min(m, Math.abs(a - row.range)),
      Number.POSITIVE_INFINITY
    );
    if (Math.abs(row.range - p.zeroDistanceM) <= 1) row.confidence = "high";
    else if (!Number.isFinite(nearest)) row.confidence = "low";
    else if (nearest <= step / 2) row.confidence = "high";
    else if (nearest <= step) row.confidence = "medium";
    else row.confidence = "low";
  }
  return rows;
}

function formatElevation(mil: number, moa: number, units: "MIL" | "MOA") {
  const v = units === "MIL" ? mil : moa;
  if (Math.abs(v) < 0.05) return "0.0";
  const dir = v > 0 ? "U" : "D";
  return `${dir}${Math.abs(v).toFixed(1)}`;
}
const confColor = (c: DOPEEntry["confidence"]) =>
  c === "high" ? "text-green-600" : c === "medium" ? "text-yellow-600" : "text-red-600";
const confIcon = (c: DOPEEntry["confidence"]) => (c === "high" ? "●" : c === "medium" ? "◐" : "○");

/* ---------------- Page ---------------- */
export function DOPEPage() {
  const { state, setState, navigate } = useApp();
  const { session, entries, calculator } = state;

  const [sortBy, setSortBy] = useState<"date" | "range">("date");
  const [filterRange, setFilterRange] = useState({ min: "", max: "" });
  const [filterNotes, setFilterNotes] = useState("");
  const [showSessionHeaders, setShowSessionHeaders] = useState(true);
  const [showDOPECards, setShowDOPECards] = useState(false);
  const [showStorageManager, setShowStorageManager] = useState(false);

  // Ensure session exists
  if (!session) {
    const s = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      title: "Default Session",
      place: "",
    };
    setState({ ...state, session: s });
    return (
      <div className="container max-w-7xl mx-auto p-4">
        <div className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">Initializing session...</p>
        </div>
      </div>
    );
  }

  // Filter/sort entries
  const filteredEntries = entries
    .filter((e) => {
      const okMin = !filterRange.min || e.rangeM >= Number(filterRange.min);
      const okMax = !filterRange.max || e.rangeM <= Number(filterRange.max);
      const okNotes =
        !filterNotes || (e.notes || "").toLowerCase().includes(filterNotes.toLowerCase());
      return okMin && okMax && okNotes;
    })
    .sort((a, b) =>
      sortBy === "date"
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : a.rangeM - b.rangeM
    );

  // Build table rows with (optional) session headers
  const tableRows: TableRow[] = (() => {
    if (!showSessionHeaders) return filteredEntries.map((entry) => ({ type: "entry", entry }));
    const rows: TableRow[] = [];
    const bySession = new Map<string, Entry[]>();
    filteredEntries.forEach((e) => {
      if (!bySession.has(e.sessionId)) bySession.set(e.sessionId, []);
      bySession.get(e.sessionId)!.push(e);
    });
    for (const [sid, ses] of bySession) {
      if (!ses.length) continue;
      const isCurrent = sid === session.id;
      const sInfo = isCurrent
        ? session
        : { id: sid, title: `Session ${sid.slice(0, 8)}`, place: "", startedAt: ses[0].createdAt };
      const first = ses[0];
      const bulletInfo = first.bulletWeightGr
        ? `${first.ammoName || "Unknown"} ${first.bulletWeightGr}gr`
        : first.ammoName || "Unknown";
      rows.push({
        type: "session",
        sessionId: sid,
        sessionTitle: sInfo.title,
        sessionPlace: sInfo.place || "",
        sessionStarted: sInfo.startedAt,
        rangeM: first.rangeM,
        bulletInfo,
        firearmName: first.firearmName,
        humidity: first.humidity,
        windSpeed: first.windSpeed,
        windDirection: first.windDirection,
      });
      ses.forEach((e) => rows.push({ type: "entry", entry: e }));
    }
    return rows;
  })();

  /* ----- DOPE cards: from data groups OR fallback to current calculator ----- */
  const dopeCards = (() => {
    const groups = groupEntriesByRifleAmmo(filteredEntries);
    const cards = Array.from(groups.values())
      .filter((g) => g.length)
      .map((group) => {
        const first = group[0];
        const p = profileFromEntries(group);
        const ranges = Array.from(new Set(group.map((e) => e.rangeM))).sort((a, b) => a - b);
        const dope = generateDOPETable(group, p);
        return {
          rifleName: first.firearmName || "Unknown Rifle",
          ammoName: first.ammoName || "Unknown Ammo",
          bulletWeight: first.bulletWeightGr || 0,
          minRange: ranges[0] ?? 100,
          maxRange: ranges[ranges.length - 1] ?? 300,
          dataPointCount: ranges.length,
          ballisticProfile: p,
          dopeTable: dope,
        };
      });

    if (cards.length === 0) {
      // Fallback: synthesize one DOPE card from calculator state so the page isn’t empty
      const p = profileFromCalculator(state);
      const dope = generateDOPETable([], p);
      cards.push({
        rifleName: state.calculator.firearmName || "Current Setup",
        ammoName: state.calculator.ammoName || "Current Load",
        bulletWeight: p.bulletWeightGr,
        minRange: dope[0]?.range ?? 100,
        maxRange: dope[dope.length - 1]?.range ?? 500,
        dataPointCount: 0,
        ballisticProfile: p,
        dopeTable: dope,
      });
    }

    return cards.sort((a, b) => a.rifleName.localeCompare(b.rifleName));
  })();

  /* ----- actions ----- */
  const handleDeleteSession = () => {
    if (confirm("Delete current session? This will create a new default session but keep all entries.")) {
      deleteSession(state, setState);
      toast.success("Session deleted, new session created");
    }
  };
  const handleDeleteEntry = (id: string) => {
    if (confirm("Delete this entry?")) {
      deleteEntry(state, setState, id);
      toast.success("Entry deleted");
    }
  };
  const handleExportJSON = () => {
    const json = exportJSON(filteredEntries);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeTitle = session.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const dateString = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `dope-entries-${safeTitle}-${dateString}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Entries exported to JSON");
  };
  const handleExportSession = () => {
    const json = exportSessionJSON(entries, session);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeTitle = session.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const dateString = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `session-${safeTitle}-${dateString}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Session data exported to JSON");
  };
  const handleImportJSON = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const replace = confirm(
          ["How would you like to import this data?", "", "OK = Replace all current entries", "Cancel = Merge (add)"].join(
            "\n"
          )
        );
        const result = importEntriesJSON(state, setState, text, replace ? "replace" : "merge");
        if (result.errors.length) {
          const msg =
            `Import completed with errors:\n` +
            result.errors.slice(0, 5).join("\n") +
            (result.errors.length > 5 ? `\n...and ${result.errors.length - 5} more` : "");
          toast.error(msg, { duration: 8000 });
        }
        if (result.imported > 0) {
          toast.success(
            `Imported ${result.imported} entries${
              result.errors.length ? ` (${result.errors.length} errors)` : ""
            }`
          );
        } else {
          toast.error("No valid entries found");
        }
      } catch {
        toast.error("Import failed");
      }
    };
    input.click();
  };

  /* ----- render ----- */
  return (
    <div className="container max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">DOPE (Data On Previous Engagement)</h2>
        <button
          onClick={() => setShowStorageManager(!showStorageManager)}
          className="px-3 py-1 bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80"
        >
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
          <div className="flex-1 min-w-0">
            <SessionManager compact showNewSession={false} />
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => navigate("/log")}
              className="px-3 py-1 bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80"
            >
              Add Entry
            </button>
            <button
              onClick={handleDeleteSession}
              className="px-3 py-1 bg-destructive text-destructive-foreground text-sm hover:bg-destructive/90"
            >
              Delete Session
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="p-3 border bg-card space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "date" | "range")}
              className="w-full px-2 py-1 border"
            >
              <option value="date">Date (newest first)</option>
              <option value="range">Range (ascending)</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Range filter:</label>
            <div className="flex gap-1">
              <input
                type="number"
                placeholder="Min"
                value={filterRange.min}
                onChange={(e) => setFilterRange({ ...filterRange, min: e.target.value })}
                className="w-full px-2 py-1 border"
              />
              <input
                type="number"
                placeholder="Max"
                value={filterRange.max}
                onChange={(e) => setFilterRange({ ...filterRange, max: e.target.value })}
                className="w-full px-2 py-1 border"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Notes filter:</label>
            <input
              type="text"
              placeholder="Search notes..."
              value={filterNotes}
              onChange={(e) => setFilterNotes(e.target.value)}
              className="w-full px-2 py-1 border"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showSessionHeaders}
              onChange={(e) => setShowSessionHeaders(e.target.checked)}
            />
            <span className="text-sm">Show session headers</span>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={handleExportJSON} className="px-3 py-1 bg-primary text-primary-foreground text-sm hover:bg-primary/90">
            Export JSON
          </button>
          <button onClick={handleExportSession} className="px-3 py-1 bg-primary text-primary-foreground text-sm hover:bg-primary/90">
            Export Session
          </button>
          <button onClick={handleImportJSON} className="px-3 py-1 bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80">
            Import JSON
          </button>
          <PDFExport entries={filteredEntries} session={session} />
        </div>
      </div>

      {/* Entries Table */}
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
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    No entries yet.{" "}
                    <button onClick={() => navigate("/log")} className="text-primary hover:underline">
                      Add your first entry
                    </button>
                    . You can still view a DOPE card generated from your current calculator settings below.
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => {
                  if (row.type === "session") {
                    return (
                      <tr key={`session-${row.sessionId}`} className="dope-session-header">
                        <td colSpan={9}>
                          <div className="session-info">
                            <div className="session-title">{row.sessionTitle}</div>
                            {row.sessionPlace && <div className="session-meta">@ {row.sessionPlace}</div>}
                            <div className="session-meta">{new Date(row.sessionStarted).toLocaleDateString()}</div>
                            {row.firearmName && <div className="session-meta">{row.firearmName}</div>}
                            {row.bulletInfo && <div className="session-meta">{row.bulletInfo}</div>}
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  const e = row.entry;
                  const elevMil = e.actualAdjMil?.up ?? 0;
                  const elevMoa = e.actualAdjMoa?.up ?? 0;
                  const windMil = e.actualAdjMil?.right ?? 0;
                  const windMoa = e.actualAdjMoa?.right ?? 0;

                  const windText =
                    calculator.scopeUnits === "MIL"
                      ? Math.abs(windMil) < 0.05
                        ? "0.0"
                        : `${windMil > 0 ? "L" : "R"}${Math.abs(windMil).toFixed(1)}`
                      : Math.abs(windMoa) < 0.05
                      ? "0.0"
                      : `${windMoa > 0 ? "L" : "R"}${Math.abs(windMoa).toFixed(1)}`;

                  return (
                    <tr key={e.id} className="border-t hover:bg-muted/50">
                      <td className="px-3 py-2">{new Date(e.createdAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2 font-mono">{e.rangeM}m</td>
                      <td className="px-3 py-2">{e.firearmName || "N/A"}</td>
                      <td className="px-3 py-2">{e.ammoName || "N/A"}</td>
                      <td className="px-3 py-2 font-mono">{formatElevation(elevMil, elevMoa, calculator.scopeUnits)}</td>
                      <td className="px-3 py-2 font-mono">{windText}</td>
                      <td className="px-3 py-2">{e.groupSizeCm ? `${e.groupSizeCm}cm` : "N/A"}</td>
                      <td className="px-3 py-2">{e.notes || "N/A"}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleDeleteEntry(e.id)}
                          className="text-destructive hover:text-destructive/80 text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toggle DOPE cards */}
      <div className="flex justify-center">
        <button
          onClick={() => setShowDOPECards((s) => !s)}
          className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
        >
          {showDOPECards ? "Hide DOPE Card" : "Show DOPE Card"}
        </button>
      </div>

      {showDOPECards && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold">DOPE Cards</h3>
          {dopeCards.map((card, idx) => (
            <div key={idx} className="border p-4 bg-card">
              <div className="mb-4">
                <h4 className="font-semibold text-lg">{card.rifleName}</h4>
                <p className="text-sm text-muted-foreground">
                  {card.ammoName} • {card.bulletWeight}gr •{" "}
                  {card.dataPointCount} range{card.dataPointCount !== 1 ? "s" : ""} • {card.minRange}m –{" "}
                  {card.maxRange}m
                </p>
              </div>

              {/* Ballistic Profile */}
              <div className="mb-4 p-3 bg-muted">
                <div className="text-sm font-medium mb-2">Ballistic Profile</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <KV k="V₀" v={`${Math.round(card.ballisticProfile.V0)} m/s`} />
                  <KV k="BC" v={card.ballisticProfile.BC.toFixed(3)} />
                  <KV k="Model" v={card.ballisticProfile.model} />
                  <KV k="Zero" v={`${card.ballisticProfile.zeroDistanceM}m`} />
                </div>
              </div>

              {/* DOPE table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border px-2 py-1 text-left">Range (m)</th>
                      <th className="border px-2 py-1 text-left">Elevation ({calculator.scopeUnits})</th>
                      <th className="border px-2 py-1 text-left">Confidence</th>
                      <th className="border px-2 py-1 text-left">Data Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.dopeTable.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        <td className="border px-2 py-1 font-mono">{row.range}</td>
                        <td className="border px-2 py-1 font-mono">
                          {formatElevation(row.elevationMil, row.elevationMoa, calculator.scopeUnits)}
                        </td>
                        <td className={`border px-2 py-1 ${confColor(row.confidence)}`}>
                          <span className="flex items-center gap-1">
                            <span>{confIcon(row.confidence)}</span>
                            <span>{row.confidence}</span>
                          </span>
                        </td>
                        <td className="border px-2 py-1">{row.actualEntries > 0 ? row.actualEntries : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

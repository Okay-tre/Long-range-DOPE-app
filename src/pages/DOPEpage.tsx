import React, { useMemo, useState } from "react";
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

/* ---------- tiny UI helper ---------- */
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between bg-card px-2 py-1 border">
      <span className="text-xs">{k}</span>
      <span className="font-mono text-xs">{v}</span>
    </div>
  );
}

/* ---------- page-local types ---------- */
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
  | {
      type: "entry";
      entry: Entry;
    };

interface DOPEEntry {
  range: number;
  elevationMil: number;
  elevationMoa: number;
  windageMil: number;
  windageMoa: number;
  isCalculated: boolean;
  actualEntries: number;
  confidence: "high" | "medium" | "low";
}

interface BallisticProfile {
  V0: number;
  BC: number;
  model: "G1" | "G7" | "noDrag";
  bulletWeightGr: number;
  y0Cm: number;
  zeroDistanceM: number;
  avgTemperature: number;
  avgHumidity: number;
  avgWindSpeed: number;
  avgWindDirection: number;
}

/* ---------- utils ---------- */
const roundToBallistic = (x: number) => Math.round(x * 10) / 10;

function mostCommon<T>(arr: T[], fallback: T): T {
  if (!arr.length) return fallback;
  const counts = new Map<T, number>();
  for (const x of arr) counts.set(x, (counts.get(x) || 0) + 1);
  let best = fallback;
  let bestN = -1;
  counts.forEach((n, x) => {
    if (n > bestN) {
      bestN = n;
      best = x;
    }
  });
  return best;
}

function safeAvg(nums: number[], fallback = 0) {
  const xs = nums.filter((n) => Number.isFinite(n));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback;
}

function groupEntriesByRifleAmmo(entries: Entry[]): Map<string, Entry[]> {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = `${e.firearmName || "Unknown Rifle"}_${e.ammoName || "Unknown Ammo"}_${e.bulletWeightGr || 0}gr`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}

function getConfidenceColorClass(level: "high" | "medium" | "low") {
  switch (level) {
    case "high":
      return "text-green-600";
    case "medium":
      return "text-yellow-600";
    default:
      return "text-red-600";
  }
}
function getConfidenceIcon(level: "high" | "medium" | "low") {
  switch (level) {
    case "high":
      return "●";
    case "medium":
      return "◐";
    default:
      return "○";
  }
}

function formatElevation(mil: number, moa: number, units: "MIL" | "MOA") {
  const val = units === "MIL" ? mil : moa;
  if (Math.abs(val) < 0.05) return "0.0";
  return `${val > 0 ? "U" : "D"}${Math.abs(val).toFixed(1)}`;
}

/* ---------- build a profile from entries OR from calculator as fallback ---------- */
function profileFromEntries(entries: Entry[]): BallisticProfile | null {
  if (!entries.length) return null;
  return {
    V0: safeAvg(entries.map((e) => e.V0), 800),
    BC: safeAvg(entries.map((e) => e.bcUsed ?? 0.25), 0.25),
    model: mostCommon(entries.map((e) => e.model as any), "G7"),
    bulletWeightGr: entries[0].bulletWeightGr ?? 175,
    y0Cm: entries[0].y0Cm ?? 3.5,
    zeroDistanceM: safeAvg(entries.map((e) => e.zeroDistanceM ?? 100), 100),
    avgTemperature: safeAvg(entries.map((e) => e.temperature), 15),
    avgHumidity: safeAvg(entries.map((e) => e.humidity), 50),
    avgWindSpeed: safeAvg(entries.map((e) => e.windSpeed), 0),
    avgWindDirection: safeAvg(entries.map((e) => e.windDirection), 0),
  };
}

function profileFromCalculator(state: ReturnType<typeof useApp>["state"]): BallisticProfile {
  const c = state.calculator;
  // defensively default everything
  return {
    V0: Number.isFinite(c.V0) ? c.V0 : 800,
    BC: Number.isFinite(c.bc) ? c.bc : 0.25,
    model: (c.model as any) || "G7",
    bulletWeightGr: Number.isFinite(c.bulletWeightGr) ? c.bulletWeightGr : 175,
    y0Cm: Number.isFinite(c.y0Cm) ? c.y0Cm : 3.5,
    zeroDistanceM: Number.isFinite(c.zeroDistanceM) ? c.zeroDistanceM : 100,
    avgTemperature: Number.isFinite(c.temperature) ? c.temperature : 15,
    avgHumidity: Number.isFinite(c.humidity) ? c.humidity : 50,
    avgWindSpeed: Number.isFinite(c.windSpeed) ? c.windSpeed : 0,
    avgWindDirection: Number.isFinite(c.windDirection) ? c.windDirection : 0,
  };
}

/* ---------- DOPE generation using solveTrajectory (works with no entries) ---------- */
function buildDOPERow(rangeM: number, profile: BallisticProfile): DOPEEntry {
  const env = {
    temperatureC: profile.avgTemperature ?? 15,
    humidityPct: profile.avgHumidity ?? 50,
  };

  const shot = solveTrajectory({
    bc: profile.BC,
    model: profile.model,
    muzzleV: profile.V0,
    bulletWeightGr: profile.bulletWeightGr,
    zeroDistanceM: profile.zeroDistanceM,
    scopeHeightMm: profile.y0Cm * 10,
    rangeM,
    env,
    wind: { speed: profile.avgWindSpeed ?? 0, directionDeg: profile.avgWindDirection ?? 0 },
  });

  let elevationMil = Number.isFinite(shot.holdMil) ? shot.holdMil : 0;
  let elevationMoa = Number.isFinite(shot.holdMoa) ? shot.holdMoa : elevationMil * 3.437746;

  // Fallback: derive angular hold from drop differential vs zero if solver didn’t provide holds
  if (Math.abs(elevationMil) < 1e-6 && Math.abs(rangeM - profile.zeroDistanceM) > 0.5) {
    const atZero = solveTrajectory({
      bc: profile.BC,
      model: profile.model,
      muzzleV: profile.V0,
      bulletWeightGr: profile.bulletWeightGr,
      zeroDistanceM: profile.zeroDistanceM,
      scopeHeightMm: profile.y0Cm * 10,
      rangeM: profile.zeroDistanceM,
      env,
      wind: { speed: profile.avgWindSpeed ?? 0, directionDeg: profile.avgWindDirection ?? 0 },
    });
    const extraDropM = (shot.drop ?? 0) - (atZero.drop ?? 0);
    elevationMil = (extraDropM / Math.max(rangeM, 1)) * 1000;
    elevationMoa = elevationMil * 3.437746;
  }

  return {
    range: Math.round(rangeM),
    elevationMil: roundToBallistic(elevationMil),
    elevationMoa: roundToBallistic(elevationMoa),
    windageMil: 0,
    windageMoa: 0,
    isCalculated: true,
    actualEntries: 0,
    confidence: Math.abs(rangeM - profile.zeroDistanceM) <= 1 ? "high" : "medium",
  };
}

function generateDOPETable(entries: Entry[], profile: BallisticProfile): DOPEEntry[] {
  // summarize “actual” counts per range (for confidence & counts)
  const counts = new Map<number, number>();
  for (const e of entries) counts.set(e.rangeM, (counts.get(e.rangeM) || 0) + 1);

  const actualRanges = Array.from(counts.keys()).sort((a, b) => a - b);
  const maxActual = actualRanges.length ? Math.max(...actualRanges) : 300;
  const step = maxActual <= 100 ? 10 : 50;
  const maxOut = Math.max(500, Math.ceil(maxActual / step) * step);

  const wanted = new Set<number>();
  wanted.add(Math.round(profile.zeroDistanceM));
  for (let r = step; r <= maxOut; r += step) wanted.add(r);
  for (const r of actualRanges) wanted.add(Math.round(r));

  const rows = Array.from(wanted)
    .sort((a, b) => a - b)
    .map((r) => buildDOPERow(r, profile));

  // fill counts & refine confidence by proximity to actual data
  for (const row of rows) {
    row.actualEntries = counts.get(row.range) || 0;
    if (row.actualEntries > 0) row.confidence = "high";
    else {
      // nearest distance to an actual range
      const near =
        actualRanges.length > 0
          ? actualRanges.reduce((m, v) => Math.min(m, Math.abs(v - row.range)), Infinity)
          : Infinity;
      if (near <= step / 2) row.confidence = "high";
      else if (near <= step) row.confidence = "medium";
      else row.confidence = "low";
    }
  }

  return rows;
}

/* ---------- Page ---------- */

export function DOPEPage() {
  const { state, setState, navigate } = useApp();
  const { session, entries, calculator } = state;

  const [sortBy, setSortBy] = useState<"date" | "range">("date");
  const [filterRange, setFilterRange] = useState({ min: "", max: "" });
  const [filterNotes, setFilterNotes] = useState("");
  const [showSessionHeaders, setShowSessionHeaders] = useState(true);
  const [showDOPECards, setShowDOPECards] = useState(false);
  const [showStorageManager, setShowStorageManager] = useState(false);

  // Ensure a session exists
  if (!session) {
    const defaultSession = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      title: "Default Session",
      place: "",
    };
    setState({ ...state, session: defaultSession });
    return (
      <div className="container max-w-7xl mx-auto p-4">
        <div className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">Initializing session...</p>
        </div>
      </div>
    );
  }

  // Filters/sorting
  const filteredEntries = entries
    .filter((e) => {
      const inMin = !filterRange.min || e.rangeM >= Number(filterRange.min);
      const inMax = !filterRange.max || e.rangeM <= Number(filterRange.max);
      const notesOk = !filterNotes || (e.notes || "").toLowerCase().includes(filterNotes.toLowerCase());
      return inMin && inMax && notesOk;
    })
    .sort((a, b) => (sortBy === "date" ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() : a.rangeM - b.rangeM));

  // Build table rows with (optional) session headers
  const tableRows: TableRow[] = useMemo(() => {
    if (!showSessionHeaders) return filteredEntries.map((entry) => ({ type: "entry", entry }));
    const rows: TableRow[] = [];
    const bySession = new Map<string, Entry[]>();
    for (const e of filteredEntries) {
      if (!bySession.has(e.sessionId)) bySession.set(e.sessionId, []);
      bySession.get(e.sessionId)!.push(e);
    }
    for (const [sessionId, sesEntries] of bySession) {
      if (!sesEntries.length) continue;
      const isCurrent = sessionId === session.id;
      const sInfo = isCurrent
        ? session
        : {
            id: sessionId,
            title: `Session ${sessionId.slice(0, 8)}`,
            place: "",
            startedAt: sesEntries[0].createdAt,
          };
      const first = sesEntries[0];
      const bulletInfo = first.bulletWeightGr
        ? `${first.ammoName || "Unknown"} ${first.bulletWeightGr}gr`
        : first.ammoName || "Unknown";
      rows.push({
        type: "session",
        sessionId,
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
      for (const e of sesEntries) rows.push({ type: "entry", entry: e });
    }
    return rows;
  }, [filteredEntries, showSessionHeaders, session]);

  // DOPE cards: if no entries at all, we still build one from current calculator
  const dopeCards = useMemo(() => {
    const cards: Array<{
      rifleName: string;
      ammoName: string;
      bulletWeight: number;
      minRange: number;
      maxRange: number;
      dataPointCount: number;
      ballisticProfile: BallisticProfile;
      dopeTable: DOPEEntry[];
    }> = [];

    if (filteredEntries.length === 0) {
      // Fallback: synthesize from calculator
      const profile = profileFromCalculator(state);
      const synthetic: Entry[] = []; // none -> counts are 0
      const dope = generateDOPETable(synthetic, profile);
      cards.push({
        rifleName: state.calculator.firearmName || "Rifle",
        ammoName: state.calculator.ammoName || "Ammo",
        bulletWeight: state.calculator.bulletWeightGr || 0,
        minRange: profile.zeroDistanceM,
        maxRange: dope[dope.length - 1]?.range ?? Math.max(500, profile.zeroDistanceM + 400),
        dataPointCount: 0,
        ballisticProfile: profile,
        dopeTable: dope,
      });
      return cards;
    }

    const groups = groupEntriesByRifleAmmo(filteredEntries);
    for (const group of groups.values()) {
      const profile = profileFromEntries(group) ?? profileFromCalculator(state);
      const ranges = Array.from(new Set(group.map((e) => e.rangeM))).sort((a, b) => a - b);
      const dope = generateDOPETable(group, profile);
      const first = group[0];
      cards.push({
        rifleName: first.firearmName || "Unknown Rifle",
        ammoName: first.ammoName || "Unknown Ammo",
        bulletWeight: first.bulletWeightGr || 0,
        minRange: ranges[0] ?? profile.zeroDistanceM,
        maxRange: ranges[ranges.length - 1] ?? Math.max(500, profile.zeroDistanceM + 400),
        dataPointCount: ranges.length,
        ballisticProfile: profile,
        dopeTable: dope,
      });
    }
    return cards.sort((a, b) => a.rifleName.localeCompare(b.rifleName));
  }, [filteredEntries, state]);

  /* ---------- actions ---------- */
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
    const safeTitle = state.session!.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
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
    const safeTitle = state.session!.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
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
        const shouldReplace = confirm("OK = Replace all current entries\nCancel = Merge (add)");
        const result = importEntriesJSON(state, setState, text, shouldReplace ? "replace" : "merge");
        if (result.errors.length) {
          toast.error(
            `Import completed with errors:\n${result.errors.slice(0, 5).join("\n")}${
              result.errors.length > 5 ? `\n...and ${result.errors.length - 5} more` : ""
            }`,
            { duration: 8000 }
          );
        }
        if (result.imported > 0) toast.success(`Imported ${result.imported} entries`);
        else toast.error("No valid entries found");
      } catch {
        toast.error("Import failed");
      }
    };
    input.click();
  };

  /* ---------- render ---------- */
  return (
    <div className="container max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">DOPE (Data On Previous Engagement)</h2>
        <button
          onClick={() => setShowStorageManager((v) => !v)}
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
                    {" "}or{" "}
                    <button
                      onClick={() => setShowDOPECards(true)}
                      className="text-primary hover:underline"
                    >
                      generate a DOPE card from current calculator
                    </button>
                    .
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
                      <td className="px-3 py-2 font-mono">
                        {formatElevation(elevMil, elevMoa, calculator.scopeUnits)}
                      </td>
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

      {/* DOPE cards toggle */}
      <div className="flex justify-center">
        <button
          onClick={() => setShowDOPECards((s) => !s)}
          className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
        >
          {showDOPECards ? "Hide DOPE Card" : "Show DOPE Card"}
        </button>
      </div>

      {/* DOPE cards */}
      {showDOPECards && dopeCards.length > 0 && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold">DOPE Cards</h3>
          {dopeCards.map((card, idx) => (
            <div key={idx} className="border p-4 bg-card">
              <div className="mb-4">
                <h4 className="font-semibold text-lg">{card.rifleName}</h4>
                <p className="text-sm text-muted-foreground">
                  {card.ammoName} • {card.bulletWeight}gr • {card.dataPointCount} range
                  {card.dataPointCount !== 1 ? "s" : ""} • {card.minRange}m - {card.maxRange}m
                </p>
              </div>

              <div className="mb-4 p-3 bg-muted">
                <div className="text-sm font-medium mb-2">Ballistic Profile</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <KV k="V₀" v={`${Math.round(card.ballisticProfile.V0)} m/s`} />
                  <KV k="BC" v={card.ballisticProfile.BC.toFixed(3)} />
                  <KV k="Model" v={card.ballisticProfile.model} />
                  <KV k="Zero" v={`${card.ballisticProfile.zeroDistanceM}m`} />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border px-2 py-1 text-left">Range (m)</th>
                      <th className="border px-2 py-1 text-left">Elevation ({state.calculator.scopeUnits})</th>
                      <th className="border px-2 py-1 text-left">Confidence</th>
                      <th className="border px-2 py-1 text-left">Data Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.dopeTable.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        <td className="border px-2 py-1 font-mono">{row.range}</td>
                        <td className="border px-2 py-1 font-mono">
                          {formatElevation(row.elevationMil, row.elevationMoa, state.calculator.scopeUnits)}
                        </td>
                        <td className={`border px-2 py-1 ${getConfidenceColorClass(row.confidence)}`}>
                          <span className="flex items-center gap-1">
                            <span>{getConfidenceIcon(row.confidence)}</span>
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

/* Export default too so either import style works */
export default DOPEPage;

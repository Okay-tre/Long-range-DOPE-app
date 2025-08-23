import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import {
  newSession,
  updateSession,
  deleteSession,
  deleteEntry,
  exportJSON,
  importEntriesJSON,
  exportSessionJSON,
} from "./dope.handlers";
import { SessionManager } from "../components/SessionManager";
import { PDFExport } from "../components/PDFExport";
import { StorageManager } from "../components/StorageManager";
import { EquipmentManager } from "../components/EquipmentManager";
import { toast } from "sonner@2.0.3";
import type { Entry } from "../lib/appState";
import { solveTrajectory } from "../lib/calcEngine";

/* ---------------- UI bits ---------------- */

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between bg-card px-2 py-1 border">
      <span className="text-xs">{k}</span>
      <span className="font-mono text-xs">{v}</span>
    </div>
  );
}

/* ---------------- Types used only in this page ---------------- */

interface SessionHeaderRow {
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

interface EntryRow {
  type: "entry";
  entry: Entry;
}

type TableRow = SessionHeaderRow | EntryRow;

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
  y0Cm: number; // scope height
  zeroDistanceM: number;
  avgTemperature: number;
  avgHumidity: number;
  avgWindSpeed: number;
  avgWindDirection: number;
  // optional pressure/alt for engines that accept them; harmless if ignored
  pressurehPa?: number;
  altitudeM?: number;
}

/* ---------------- Helpers: grouping & profiles ---------------- */

function groupEntriesByRifleAmmo(entries: Entry[]): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>();
  entries.forEach((e) => {
    const key = `${e.firearmName || "Unknown Rifle"}_${e.ammoName || "Unknown Ammo"}_${e.bulletWeightGr || 0}gr`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  });
  return groups;
}

function mostCommon<T>(arr: T[], fallback: T): T {
  if (!arr.length) return fallback;
  const counts = new Map<T, number>();
  arr.forEach((x) => counts.set(x, (counts.get(x) || 0) + 1));
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

function safeAvg(arr: number[], fallback = 0): number {
  const xs = arr.filter((n) => Number.isFinite(n));
  if (!xs.length) return fallback;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function calculateBallisticProfile(entries: Entry[]): BallisticProfile {
  const V0 = safeAvg(entries.map((e) => e.V0), 800);
  const BC = safeAvg(entries.map((e) => e.bcUsed ?? 0.25), 0.25);
  const model = mostCommon(entries.map((e) => e.model), "G7") as BallisticProfile["model"];
  const bulletWeightGr = entries[0]?.bulletWeightGr ?? 175;
  const y0Cm = entries[0]?.y0Cm ?? 3.5;
  const zeroDistanceM = safeAvg(
    entries.map((e) => (e.zeroDistanceM ?? 100)),
    100
  );

  const avgTemperature = safeAvg(entries.map((e) => e.temperature), 15);
  const avgHumidity = safeAvg(entries.map((e) => e.humidity), 50);
  const avgWindSpeed = safeAvg(entries.map((e) => e.windSpeed), 0);
  const avgWindDirection = safeAvg(entries.map((e) => e.windDirection), 0);

  return {
    V0,
    BC,
    model,
    bulletWeightGr,
    y0Cm,
    zeroDistanceM,
    avgTemperature,
    avgHumidity,
    avgWindSpeed,
    avgWindDirection,
  };
}

function roundToBallistic(x: number): number {
  return Math.round(x * 10) / 10;
}

function makeRangeAverages(entries: Entry[]) {
  // summary of how many actual entries exist at each range (for confidence display)
  const map = new Map<number, { count: number }>();
  for (const e of entries) {
    const m = map.get(e.rangeM) || { count: 0 };
    m.count += 1;
    map.set(e.rangeM, m);
  }
  return map;
}

/* ---------------- Core: compute “pure” ballistic DOPE rows ---------------- */

function buildDOPERow(rangeM: number, profile: BallisticProfile): DOPEEntry {
  // We ask the physics engine for the hold at this range relative to the profile.zeroDistanceM.
  // The engine should be already modeling zero offset internally; if it doesn’t, a simple
  // difference between holds at (rangeM) and (zeroDistanceM) will still produce the same result.
  const env = {
    temperatureC: profile.avgTemperature,
    humidityPct: profile.avgHumidity,
    // optional fields (ignored by engine if not supported):
    pressurehPa: profile.pressurehPa,
    altitudeM: profile.altitudeM,
  };

  // Primary solve at the requested range
  const t = solveTrajectory({
    bc: profile.BC,
    model: profile.model,
    muzzleV: profile.V0,
    bulletWeightGr: profile.bulletWeightGr,
    zeroDistanceM: profile.zeroDistanceM,
    scopeHeightMm: profile.y0Cm * 10,
    rangeM,
    env,
    wind: { speed: profile.avgWindSpeed, directionDeg: profile.avgWindDirection },
  });

  // If your solveTrajectory already returns “holdMil / holdMoa relative to zero”, we’re done.
  // If not, we compute a differential vs zero here as a fallback:
  let elevationMil = Number.isFinite(t.holdMil) ? t.holdMil : 0;
  let elevationMoa = Number.isFinite(t.holdMoa) ? t.holdMoa : elevationMil * 3.437746;

  // Fallback path: compute difference vs zero range if holds look suspiciously 0
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
      wind: { speed: profile.avgWindSpeed, directionDeg: profile.avgWindDirection },
    });
    // Convert drop differential to angular
    const extraDropM = (t.drop ?? 0) - (atZero.drop ?? 0);
    elevationMil = (extraDropM / Math.max(rangeM, 1)) * 1000;
    elevationMoa = elevationMil * 3.437746;
  }

  return {
    range: Math.round(rangeM),
    elevationMil: roundToBallistic(elevationMil),
    elevationMoa: roundToBallistic(elevationMoa),
    windageMil: 0, // keep zero in DOPE table; wind is session/day-specific
    windageMoa: 0,
    isCalculated: true,
    actualEntries: 0, // filled later
    confidence: "medium", // refined later
  };
}

function generateDOPETable(allEntries: Entry[]): DOPEEntry[] {
  if (!allEntries.length) return [];
  const profile = calculateBallisticProfile(allEntries);
  const rangeCounts = makeRangeAverages(allEntries);

  const actualRanges = Array.from(rangeCounts.keys()).sort((a, b) => a - b);
  const maxActual = actualRanges.length ? Math.max(...actualRanges) : 300;
  const minActual = actualRanges.length ? Math.min(...actualRanges) : 50;

  const step = maxActual <= 100 ? 10 : 50;
  const maxOut = Math.max(500, Math.ceil(maxActual / step) * step);

  const wantedRanges = new Set<number>();
  wantedRanges.add(Math.round(profile.zeroDistanceM));
  for (let r = step; r <= maxOut; r += step) wantedRanges.add(r);
  // ensure we include “odd” actual shot distances as well
  for (const r of actualRanges) wantedRanges.add(Math.round(r));

  const rows = Array.from(wantedRanges)
    .sort((a, b) => a - b)
    .map((r) => buildDOPERow(r, profile));

  // fill “actualEntries” and confidence by proximity to real data
  const sortedActual = actualRanges.sort((a, b) => a - b);
  for (const row of rows) {
    // data points at exactly same range:
    row.actualEntries = rangeCounts.get(row.range)?.count ?? 0;

    // confidence from nearest actual range:
    let near = Infinity;
    for (const rr of sortedActual) near = Math.min(near, Math.abs(rr - row.range));
    if (Math.abs(row.range - profile.zeroDistanceM) <= 1) row.confidence = "high";
    else if (!Number.isFinite(near)) row.confidence = "low";
    else if (near <= step / 2) row.confidence = "high";
    else if (near <= step) row.confidence = "medium";
    else row.confidence = "low";
  }

  return rows;
}

function formatElevation(mil: number, moa: number, units: "MIL" | "MOA"): string {
  const val = units === "MIL" ? mil : moa;
  if (Math.abs(val) < 0.05) return "0.0";
  const dir = val > 0 ? "U" : "D";
  return `${dir}${Math.abs(val).toFixed(1)}`;
}

function getConfidenceColor(c: "high" | "medium" | "low") {
  switch (c) {
    case "high":
      return "text-green-600";
    case "medium":
      return "text-yellow-600";
    default:
      return "text-red-600";
  }
}

function getConfidenceIcon(c: "high" | "medium" | "low") {
  switch (c) {
    case "high":
      return "●";
    case "medium":
      return "◐";
    default:
      return "○";
  }
}

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

  const filteredEntries = entries
    .filter((entry) => {
      const inMin = !filterRange.min || entry.rangeM >= Number(filterRange.min);
      const inMax = !filterRange.max || entry.rangeM <= Number(filterRange.max);
      const notesOk = !filterNotes || (entry.notes || "").toLowerCase().includes(filterNotes.toLowerCase());
      return inMin && inMax && notesOk;
    })
    .sort((a, b) => {
      if (sortBy === "date") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return a.rangeM - b.rangeM;
    });

  function createTableRows(): TableRow[] {
    if (!showSessionHeaders) {
      return filteredEntries.map((entry) => ({ type: "entry", entry }));
    }
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
  }

  const tableRows = createTableRows();

  // DOPE cards (one per rifle+ammo group)
  const dopeCards = (() => {
    const groups = groupEntriesByRifleAmmo(filteredEntries);
    return Array.from(groups.values())
      .filter((g) => g.length)
      .map((group) => {
        const first = group[0];
        const profile = calculateBallisticProfile(group);
        const ranges = Array.from(new Set(group.map((e) => e.rangeM))).sort((a, b) => a - b);
        const dope = generateDOPETable(group);

        return {
          rifleName: first.firearmName || "Unknown Rifle",
          ammoName: first.ammoName || "Unknown Ammo",
          bulletWeight: first.bulletWeightGr || 0,
          minRange: ranges[0] ?? 100,
          maxRange: ranges[ranges.length - 1] ?? 300,
          dataPointCount: ranges.length,
          ballisticProfile: profile,
          dopeTable: dope,
        };
      })
      .sort((a, b) => a.rifleName.localeCompare(b.rifleName));
  })();

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
        const shouldReplace = confirm(
          ["How would you like to import this data?", "", "OK = Replace all current entries", "Cancel = Merge (add)"].join(
            "\n"
          )
        );
        const result = importEntriesJSON(state, setState, text, shouldReplace ? "replace" : "merge");
        if (result.errors.length) {
          const msg =
            `Import completed with errors:\n` +
            result.errors.slice(0, 5).join("\n") +
            (result.errors.length > 5 ? `\n...and ${result.errors.length - 5} more` : "");
          toast.error(msg, { duration: 8000 });
        }
        if (result.imported > 0) {
          toast.success(`Imported ${result.imported} entries${result.errors.length ? ` (${result.errors.length} errors)` : ""}`);
        } else {
          toast.error("No valid entries found");
        }
      } catch (err) {
        console.error(err);
        toast.error(`Import failed`);
      }
    };
    input.click();
  };

  const getConfidenceColor = getConfidenceColor; // alias for template readability

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
                    No entries found.{" "}
                    <button onClick={() => navigate("/log")} className="text-primary hover:underline">
                      Add your first entry
                    </button>
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
                  } else {
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
                  }
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toggle DOPE cards */}
      {filteredEntries.length > 0 && (
        <div className="flex justify-center">
          <button
            onClick={() => setShowDOPECards((s) => !s)}
            className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            {showDOPECards ? "Hide DOPE Card" : "Show DOPE Card"}
          </button>
        </div>
      )}

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
                        <td className={`border px-2 py-1 ${getConfidenceColor(row.confidence)}`}>
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

import React, { useMemo, useState } from "react";
import { useApp } from "../contexts/AppContext";
import { SessionManager } from "../components/SessionManager";
import { StorageManager } from "../components/StorageManager";
import { PDFExport } from "../components/PDFExport";
import { toast } from "sonner@2.0.3";
import {
  buildProfile,
  generateDOPE,
  groupEntriesByRifleAmmo,
  type DOPEEntryRow,
} from "./dope.handlers";
import {
  deleteEntry,
  deleteSession,
  exportJSON,
  exportSessionJSON,
  importEntriesJSON,
} from "./dope.handlers"; // if your old handlers also live here keep these; otherwise keep the ones you actually need

import type { Entry } from "../lib/appState";

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between bg-card px-2 py-1 border">
      <span className="text-xs">{k}</span>
      <span className="font-mono text-xs">{v}</span>
    </div>
  );
}

const fmtElev = (mil: number, moa: number, units: "MIL" | "MOA") => {
  const v = units === "MIL" ? mil : moa;
  if (!Number.isFinite(v) || Math.abs(v) < 0.05) return "0.0";
  return `${v > 0 ? "U" : "D"}${Math.abs(v).toFixed(1)}`;
};
const confColor = (c: "high" | "medium" | "low") =>
  c === "high" ? "text-green-600" : c === "medium" ? "text-yellow-600" : "text-red-600";
const confIcon = (c: "high" | "medium" | "low") => (c === "high" ? "●" : c === "medium" ? "◐" : "○");

export function DOPEPage() {
  const { state, setState, navigate } = useApp();
  const { session, entries, calculator } = state;

  const [sortBy, setSortBy] = useState<"date" | "range">("date");
  const [filterRange, setFilterRange] = useState({ min: "", max: "" });
  const [filterNotes, setFilterNotes] = useState("");
  const [showSessionHeaders, setShowSessionHeaders] = useState(true);
  const [showStorageManager, setShowStorageManager] = useState(false);
  const [showCards, setShowCards] = useState(false);

  // ensure session
  if (!session) {
    const s = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), title: "Default Session", place: "" };
    setState({ ...state, session: s });
    return <div className="container max-w-7xl mx-auto p-4">Initializing…</div>;
  }

  // filters/sorting
  const filtered = useMemo(() => {
    const list = entries.filter((e) => {
      const inMin = !filterRange.min || e.rangeM >= Number(filterRange.min);
      const inMax = !filterRange.max || e.rangeM <= Number(filterRange.max);
      const notesOK = !filterNotes || (e.notes || "").toLowerCase().includes(filterNotes.toLowerCase());
      return inMin && inMax && notesOK;
    });
    list.sort((a, b) =>
      sortBy === "date"
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : a.rangeM - b.rangeM
    );
    return list;
  }, [entries, filterRange, filterNotes, sortBy]);

  // table rows with optional session headers
  const rows = useMemo(() => {
    if (!showSessionHeaders) return filtered.map((entry) => ({ type: "entry" as const, entry }));
    const bySession = new Map<string, Entry[]>();
    filtered.forEach((e) => {
      if (!bySession.has(e.sessionId)) bySession.set(e.sessionId, []);
      bySession.get(e.sessionId)!.push(e);
    });
    const out: Array<any> = [];
    for (const [sid, list] of bySession) {
      if (!list.length) continue;
      const isCurrent = sid === session.id;
      const sInfo = isCurrent
        ? session
        : { id: sid, title: `Session ${sid.slice(0, 8)}`, place: "", startedAt: list[0].createdAt };

      const first = list[0];
      out.push({
        type: "session",
        sessionId: sid,
        sessionTitle: sInfo.title,
        sessionPlace: sInfo.place || "",
        sessionStarted: sInfo.startedAt,
        firearmName: first.firearmName,
        bulletInfo: first.bulletWeightGr
          ? `${first.ammoName || "Unknown"} ${first.bulletWeightGr}gr`
          : first.ammoName || "Unknown",
      });
      list.forEach((e) => out.push({ type: "entry", entry: e }));
    }
    return out;
  }, [filtered, session, showSessionHeaders]);

  // ballistic DOPE (safe)
  const dopeTable: DOPEEntryRow[] = useMemo(() => generateDOPE(filtered), [filtered]);

  // export/import/delete helpers – use your existing dope.handlers for these if preferred
  const onExportJSON = () => {
    const json = exportJSON(filtered);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = session.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const date = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `dope-entries-${safe}-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Entries exported");
  };

  const onExportSession = () => {
    const json = exportSessionJSON(entries, session);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = session.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const date = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `session-${safe}-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Session exported");
  };

  const onImportJSON = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const replace = confirm("OK = Replace all current entries\nCancel = Merge (add)");
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
            `Imported ${result.imported} entries${result.errors.length ? ` (${result.errors.length} errors)` : ""}`
          );
        } else {
          toast.error("No valid entries found");
        }
      } catch (err) {
        console.error(err);
        toast.error("Import failed");
      }
    };
    input.click();
  };

  const onDeleteSession = () => {
    if (confirm("Delete current session? This will create a new default session but keep all entries.")) {
      deleteSession(state, setState);
      toast.success("Session deleted, new session created");
    }
  };
  const onDeleteEntry = (id: string) => {
    if (confirm("Delete this entry?")) {
      deleteEntry(state, setState, id);
      toast.success("Entry deleted");
    }
  };

  const empty = filtered.length === 0;

  return (
    <div className="container max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">DOPE (Data On Previous Engagement)</h2>
        <button
          onClick={() => setShowStorageManager((s) => !s)}
          className="px-3 py-1 bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80"
        >
          {showStorageManager ? "Hide" : "Show"} Storage Manager
        </button>
      </div>

      {showStorageManager && (
        <div className="space-y-4">
          <StorageManager />
        </div>
      )}

      {/* Session controls */}
      <div className="p-3 border bg-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <SessionManager compact showNewSession={false} />
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => navigate("/log")} className="px-3 py-1 bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80">
              Add Entry
            </button>
            <button onClick={onDeleteSession} className="px-3 py-1 bg-destructive text-destructive-foreground text-sm hover:bg-destructive/90">
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
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "date" | "range")} className="w-full px-2 py-1 border">
              <option value="date">Date (newest first)</option>
              <option value="range">Range (ascending)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Range filter:</label>
            <div className="flex gap-1">
              <input type="number" placeholder="Min" value={filterRange.min} onChange={(e) => setFilterRange({ ...filterRange, min: e.target.value })} className="w-full px-2 py-1 border" />
              <input type="number" placeholder="Max" value={filterRange.max} onChange={(e) => setFilterRange({ ...filterRange, max: e.target.value })} className="w-full px-2 py-1 border" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Notes filter:</label>
            <input type="text" placeholder="Search notes..." value={filterNotes} onChange={(e) => setFilterNotes(e.target.value)} className="w-full px-2 py-1 border" />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showSessionHeaders} onChange={(e) => setShowSessionHeaders(e.target.checked)} />
            <span className="text-sm">Show session headers</span>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={onExportJSON} className="px-3 py-1 bg-primary text-primary-foreground text-sm hover:bg-primary/90">Export JSON</button>
          <button onClick={onExportSession} className="px-3 py-1 bg-primary text-primary-foreground text-sm hover:bg-primary/90">Export Session</button>
          <button onClick={onImportJSON} className="px-3 py-1 bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80">Import JSON</button>
          <PDFExport entries={filtered} session={session} />
        </div>
      </div>

      {/* Empty state */}
      {empty && (
        <div className="border p-6 bg-muted/40">
          <h3 className="font-semibold mb-2">No entries yet</h3>
          <p className="text-sm text-muted-foreground">
            Add your first group on the <button className="underline" onClick={() => navigate("/log")}>Log</button> page.
            A baseline DOPE table is shown below using defaults so you can still print something today.
          </p>
        </div>
      )}

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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No entries found.</td>
                </tr>
              ) : (
                rows.map((row: any) => {
                  if (row.type === "session") {
                    return (
                      <tr key={`s-${row.sessionId}`} className="dope-session-header">
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
                  const e: Entry = row.entry;
                  const elevMil = e.actualAdjMil?.up ?? 0;
                  const elevMoa = e.actualAdjMoa?.up ?? 0;
                  const windMil = e.actualAdjMil?.right ?? 0;
                  const windMoa = e.actualAdjMoa?.right ?? 0;

                  const windText =
                    calculator.scopeUnits === "MIL"
                      ? Math.abs(windMil) < 0.05 ? "0.0" : `${windMil > 0 ? "L" : "R"}${Math.abs(windMil).toFixed(1)}`
                      : Math.abs(windMoa) < 0.05 ? "0.0" : `${windMoa > 0 ? "L" : "R"}${Math.abs(windMoa).toFixed(1)}`;

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
                      <td className="px-3 py-2">
                        <button onClick={() => onDeleteEntry(e.id)} className="text-destructive hover:text-destructive/80 text-xs">
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

      {/* DOPE (calculated) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Ballistic DOPE (calculated)</h3>
          {!empty && (
            <button className="px-3 py-1 bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80" onClick={() => setShowCards(s => !s)}>
              {showCards ? "Hide Cards" : "Show Cards"}
            </button>
          )}
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
              {dopeTable.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                  <td className="border px-2 py-1 font-mono">{row.range}</td>
                  <td className="border px-2 py-1 font-mono">{fmtElev(row.elevationMil, row.elevationMoa, calculator.scopeUnits)}</td>
                  <td className={`border px-2 py-1 ${confColor(row.confidence)}`}>
                    <span className="flex items-center gap-1">
                      <span>{confIcon(row.confidence)}</span>
                      <span>{row.confidence}</span>
                    </span>
                  </td>
                  <td className="border px-2 py-1">{row.actualEntries || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default DOPEPage;

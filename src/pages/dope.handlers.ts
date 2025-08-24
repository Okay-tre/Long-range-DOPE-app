/* ------------------------------------------------------------------
   Session & entry helpers (lightweight + safe defaults)
   These mirror the names your components import.
-------------------------------------------------------------------*/

// Types are intentionally loose to avoid coupling to AppContext internals.
type AnyState = any;
type SetState = (s: any) => void;

export function newSession(
  state: AnyState,
  setState: SetState,
  title?: string,
  place?: string
) {
  const s = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    title: title?.trim() || "New Session",
    place: place?.trim() || "",
  };
  setState({ ...state, session: s });
  return s;
}

export function updateSession(
  state: AnyState,
  setState: SetState,
  patch: Partial<{ title: string; place: string; startedAt: string }>
) {
  if (!state?.session) return;
  setState({ ...state, session: { ...state.session, ...patch } });
}

export function deleteSession(state: AnyState, setState: SetState) {
  const s = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    title: "Default Session",
    place: "",
  };
  setState({ ...state, session: s });
}

export function deleteEntry(state: AnyState, setState: SetState, id: string) {
  const next = (state?.entries ?? []).filter((e: any) => e.id !== id);
  setState({ ...state, entries: next });
}

/* ---------------- export/import helpers ---------------- */

export function exportJSON(entries: any[]): string {
  return JSON.stringify(entries ?? [], null, 2);
}

export function exportSessionJSON(entries: any[], session: any): string {
  return JSON.stringify({ session, entries: entries ?? [] }, null, 2);
}

export function importEntriesJSON(
  state: AnyState,
  setState: SetState,
  jsonText: string,
  mode: "merge" | "replace" = "merge"
): { imported: number; errors: string[] } {
  const errors: string[] = [];
  let incoming: any[] = [];

  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      incoming = parsed;
    } else if (parsed && Array.isArray(parsed.entries)) {
      incoming = parsed.entries;
    } else {
      errors.push("JSON must be an array of entries or { entries: [] }");
    }
  } catch (e) {
    errors.push("Invalid JSON");
  }

  // Very light validation — keep what looks like an entry
  incoming = incoming.filter((e) => {
    const ok = e && typeof e === "object" && typeof e.id === "string";
    if (!ok) errors.push("Skipped malformed entry");
    return ok;
  });

  if (mode === "replace") {
    setState({ ...state, entries: incoming });
  } else {
    const existingById = new Map((state?.entries ?? []).map((e: any) => [e.id, e]));
    for (const e of incoming) existingById.set(e.id, e);
    setState({ ...state, entries: Array.from(existingById.values()) });
  }

  return { imported: incoming.length, errors };
}

// ---------------- DOPE helpers (safe & decoupled) ----------------

import { solveTrajectory } from "../lib/calcEngine";

// Keep types loose to avoid coupling/breaking builds if appState changes
type Entry = any;

export type DOPEEntryRow = {
  range: number;
  elevationMil: number;
  elevationMoa: number;
  windageMil: number;
  windageMoa: number;
  isCalculated: boolean;
  actualEntries: number;
  confidence: "high" | "medium" | "low";
};

export type BallisticProfile = {
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
};

// ------- small utils

const round1 = (x: number) => Math.round(x * 10) / 10;
const avg = (xs: any[], def = 0) => {
  const v = xs.filter((n) => Number.isFinite(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : def;
};
const mostCommon = <T,>(xs: T[], def: T): T => {
  if (!xs.length) return def;
  const m = new Map<T, number>();
  xs.forEach((x) => m.set(x, (m.get(x) || 0) + 1));
  let best = def,
    n = -1;
  for (const [k, v] of m) if (v > n) (n = v), (best = k);
  return best;
};

// ------- grouping

export function groupEntriesByRifleAmmo(entries: Entry[]): Map<string, Entry[]> {
  const g = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = `${e.firearmName || "Unknown Rifle"}_${e.ammoName || "Unknown Ammo"}_${e.bulletWeightGr || 0}gr`;
    if (!g.has(key)) g.set(key, []);
    g.get(key)!.push(e);
  }
  return g;
}

// ------- profile builder (NO reliance on zeroEnv to avoid undefined errors)

export function buildProfile(entries: Entry[]): BallisticProfile {
  const V0 = avg(entries.map((e) => e?.V0), 800);
  const BC = avg(entries.map((e) => e?.bcUsed ?? e?.bc), 0.25);
  const model = mostCommon(entries.map((e) => e?.model).filter(Boolean), "G7") as BallisticProfile["model"];
  const bulletWeightGr = entries[0]?.bulletWeightGr ?? 175;
  const y0Cm = (entries[0]?.y0Cm ?? (entries[0]?.scopeHeightMm ?? 35) / 10) || 3.5;
  const zeroDistanceM = avg(entries.map((e) => e?.zeroDistanceM), 100);

  // use direct fields with safe defaults; do NOT read e.zeroEnv?.temperatureC to avoid crashes
  const avgTemperature = avg(entries.map((e) => e?.temperature), 15);
  const avgHumidity = avg(entries.map((e) => e?.humidity), 50);
  const avgWindSpeed = avg(entries.map((e) => e?.windSpeed), 0);
  const avgWindDirection = avg(entries.map((e) => e?.windDirection), 0);

  return {
    V0,
    BC: Number.isFinite(BC) && BC > 0 ? BC : 0.25,
    model: (model || "G7") as BallisticProfile["model"],
    bulletWeightGr,
    y0Cm,
    zeroDistanceM,
    avgTemperature,
    avgHumidity,
    avgWindSpeed,
    avgWindDirection,
  };
}

// ------- single row (uses solveTrajectory with ultra-safe env)

function makeRow(rangeM: number, p: BallisticProfile): DOPEEntryRow {
  // Safe environment shape; calcEngine can ignore unknown fields.
  const env = {
    temperatureC: Number.isFinite(p.avgTemperature) ? p.avgTemperature : 15,
    humidityPct: Number.isFinite(p.avgHumidity) ? p.avgHumidity : 50,
  };

  let mil = 0;
  let moa = 0;

  try {
    const t = solveTrajectory({
      bc: p.BC,
      model: p.model,
      muzzleV: p.V0,
      bulletWeightGr: p.bulletWeightGr,
      zeroDistanceM: p.zeroDistanceM,
      scopeHeightMm: p.y0Cm * 10,
      rangeM,
      env,
      wind: { speed: p.avgWindSpeed || 0, directionDeg: p.avgWindDirection || 0 },
    });

    // Preferred: engine returns holdMil/holdMoa relative to zero
    if (Number.isFinite(t?.holdMil)) mil = t.holdMil;
    else if (Number.isFinite(t?.drop)) mil = (t.drop / Math.max(rangeM, 1)) * 1000;

    if (Number.isFinite(t?.holdMoa)) moa = t.holdMoa;
    else moa = mil * 3.437746;
  } catch {
    // very rough fallback: Δdrop using vacuum-time estimate
    const g = 9.81;
    const tR = rangeM / p.V0;
    const tZ = p.zeroDistanceM / p.V0;
    const d = 0.5 * g * (tR * tR - tZ * tZ);
    mil = (d / Math.max(rangeM, 1)) * 1000;
    moa = mil * 3.437746;
  }

  return {
    range: Math.round(rangeM),
    elevationMil: round1(mil),
    elevationMoa: round1(moa),
    windageMil: 0,
    windageMoa: 0,
    isCalculated: true,
    actualEntries: 0,
    confidence: "medium",
  };
}

// ------- generate table

export function generateDOPE(entries: Entry[]): DOPEEntryRow[] {
  if (!entries?.length) {
    // produce a minimal table from defaults so the page renders even with no data
    const p = buildProfile([]);
    const step = 50;
    const max = 500;
    const ranges = new Set<number>([p.zeroDistanceM || 100]);
    for (let r = step; r <= max; r += step) ranges.add(r);
    return Array.from(ranges)
      .sort((a, b) => a - b)
      .map((r) => makeRow(r, p));
  }

  const p = buildProfile(entries);

  // count actual entries per range for confidence
  const counts = new Map<number, number>();
  for (const e of entries) counts.set(e.rangeM, (counts.get(e.rangeM) || 0) + 1);

  const actualRanges = Array.from(counts.keys()).sort((a, b) => a - b);
  const maxActual = actualRanges.length ? Math.max(...actualRanges) : 300;
  const step = maxActual <= 100 ? 10 : 50;
  const maxOut = Math.max(500, Math.ceil(maxActual / step) * step);

  const wanted = new Set<number>([Math.round(p.zeroDistanceM || 100)]);
  for (let r = step; r <= maxOut; r += step) wanted.add(r);
  actualRanges.forEach((r) => wanted.add(Math.round(r)));

  const rows = Array.from(wanted)
    .sort((a, b) => a - b)
    .map((r) => makeRow(r, p));

  // annotate counts + confidence
  for (const row of rows) {
    row.actualEntries = counts.get(row.range) || 0;
    let nearest = Infinity;
    for (const r of actualRanges) nearest = Math.min(nearest, Math.abs(r - row.range));
    if (Math.abs(row.range - p.zeroDistanceM) <= 1) row.confidence = "high";
    else if (!Number.isFinite(nearest)) row.confidence = "low";
    else if (nearest <= step / 2) row.confidence = "high";
    else if (nearest <= step) row.confidence = "medium";
    else row.confidence = "low";
  }

  return rows;
}

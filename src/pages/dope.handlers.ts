// Safe DOPE helpers that never assume zeroEnv exists
import type { Entry } from "../lib/appState";
import { solveTrajectory } from "../lib/calcEngine";

export type ModelKind = "G1" | "G7" | "noDrag";

export interface BallisticProfile {
  V0: number;
  BC: number;
  model: ModelKind;
  bulletWeightGr: number;
  y0Cm: number;          // scope height over bore (cm)
  zeroDistanceM: number;
  avgTemperature: number;
  avgHumidity: number;
  avgWindSpeed: number;
  avgWindDirection: number;
}

export interface DOPEEntryRow {
  range: number;
  elevationMil: number;
  elevationMoa: number;
  isCalculated: boolean;
  actualEntries: number;
  confidence: "high" | "medium" | "low";
}

/* ---------------- generic utils ---------------- */

const round10 = (x: number) => Math.round(x * 10) / 10;

function safeAvg(arr: Array<number | undefined>, fallback = 0) {
  const xs = arr.filter((n): n is number => Number.isFinite(n as number));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback;
}

function mostCommon<T>(arr: T[], fallback: T): T {
  if (!arr.length) return fallback;
  const m = new Map<T, number>();
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
  let best = fallback, bestN = -1;
  m.forEach((n, k) => { if (n > bestN) { bestN = n; best = k; } });
  return best;
}

/* ---------------- public helpers ---------------- */

export function groupEntriesByRifleAmmo(entries: Entry[]): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = `${e.firearmName || "Unknown Rifle"}_${e.ammoName || "Unknown Ammo"}_${e.bulletWeightGr || 0}gr`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return groups;
}

export function buildProfile(entries: Entry[]): BallisticProfile {
  const V0 = safeAvg(entries.map(e => e.V0), 800);
  const BC = safeAvg(entries.map(e => e.bcUsed), 0.25);
  const model = mostCommon<ModelKind>(
    entries.map(e => (e.model as ModelKind) ?? "G7"),
    "G7"
  );
  const bulletWeightGr = entries[0]?.bulletWeightGr ?? 175;
  const y0Cm = entries[0]?.y0Cm ?? 3.5;
  const zeroDistanceM = safeAvg(entries.map(e => e.zeroDistanceM), 100);
  const avgTemperature = safeAvg(entries.map(e => e.temperature), 15);
  const avgHumidity = safeAvg(entries.map(e => e.humidity), 50);
  const avgWindSpeed = safeAvg(entries.map(e => e.windSpeed), 0);
  const avgWindDirection = safeAvg(entries.map(e => e.windDirection), 0);

  return {
    V0, BC, model, bulletWeightGr, y0Cm, zeroDistanceM,
    avgTemperature, avgHumidity, avgWindDirection, avgWindSpeed,
  };
}

function makeEnv(profile: BallisticProfile) {
  return {
    temperatureC: Number.isFinite(profile.avgTemperature) ? profile.avgTemperature : 15,
    humidityPct: Number.isFinite(profile.avgHumidity) ? profile.avgHumidity : 50,
    // supported by some engines; ignored by others:
    pressurehPa: 1013,
    altitudeM: 0,
  };
}
function makeWind(profile: BallisticProfile) {
  return {
    speed: Number.isFinite(profile.avgWindSpeed) ? profile.avgWindSpeed : 0,
    directionDeg: Number.isFinite(profile.avgWindDirection) ? profile.avgWindDirection : 0,
  };
}

function buildRow(rangeM: number, profile: BallisticProfile): DOPEEntryRow {
  const env = makeEnv(profile);
  const wind = makeWind(profile);

  let elevationMil = 0;
  let elevationMoa = 0;

  try {
    const t = solveTrajectory({
      bc: profile.BC,
      model: profile.model,
      muzzleV: profile.V0,
      bulletWeightGr: profile.bulletWeightGr,
      zeroDistanceM: profile.zeroDistanceM,
      scopeHeightMm: profile.y0Cm * 10,
      rangeM,
      env,
      wind,
    });

    const mil = Number.isFinite(t?.holdMil) ? t.holdMil : 0;
    elevationMil = mil;
    elevationMoa = Number.isFinite(t?.holdMoa) ? t.holdMoa : mil * 3.437746;
  } catch {
    // vacuum-ish fallback
    const g = 9.81;
    const tRange = rangeM / Math.max(profile.V0, 1);
    const tZero = profile.zeroDistanceM / Math.max(profile.V0, 1);
    const extraDrop = 0.5 * g * (tRange * tRange - tZero * tZero);
    elevationMil = (extraDrop / Math.max(rangeM, 1)) * 1000;
    elevationMoa = elevationMil * 3.437746;
  }

  return {
    range: Math.round(rangeM),
    elevationMil: round10(elevationMil),
    elevationMoa: round10(elevationMoa),
    isCalculated: true,
    actualEntries: 0,
    confidence: "medium",
  };
}

export function generateDOPE(entries: Entry[]): DOPEEntryRow[] {
  // with no data, give a sensible baseline 50–500m
  if (!entries.length) {
    const p = buildProfile([]);
    const rows: DOPEEntryRow[] = [];
    for (let r = 50; r <= 500; r += 50) rows.push(buildRow(r, p));
    return rows;
  }

  const p = buildProfile(entries);

  const counts = new Map<number, number>();
  for (const e of entries) counts.set(e.rangeM, (counts.get(e.rangeM) ?? 0) + 1);

  const actualRanges = Array.from(counts.keys()).sort((a, b) => a - b);
  const maxActual = actualRanges.length ? Math.max(...actualRanges) : 300;
  const step = maxActual <= 100 ? 10 : 50;
  const maxOut = Math.max(500, Math.ceil(maxActual / step) * step);

  const wanted = new Set<number>();
  wanted.add(Math.round(p.zeroDistanceM));
  for (let r = step; r <= maxOut; r += step) wanted.add(r);
  for (const r of actualRanges) wanted.add(Math.round(r));

  const rows = Array.from(wanted).sort((a, b) => a - b).map(r => buildRow(r, p));

  // annotate counts + confidence
  for (const row of rows) {
    row.actualEntries = counts.get(row.range) ?? 0;

    let near = Infinity;
    for (const rr of actualRanges) near = Math.min(near, Math.abs(rr - row.range));

    if (Math.abs(row.range - p.zeroDistanceM) <= 1) row.confidence = "high";
    else if (!Number.isFinite(near)) row.confidence = "low";
    else if (near <= step / 2) row.confidence = "high";
    else if (near <= step) row.confidence = "medium";
    else row.confidence = "low";
  }

  return rows;
}

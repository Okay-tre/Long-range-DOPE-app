/* Types + defaults + persistence helpers. UI should call these. */
import { enhancedStorage } from './indexedDB';

/* --------------------------------- Helpers for presets --------------------------------- */

export function createEquipmentPreset(data: Omit<EquipmentPreset, 'id' | 'createdAt'>): EquipmentPreset {
  return { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
}

export function createBulletPreset(data: Omit<BulletPreset, 'id' | 'createdAt'>): BulletPreset {
  return { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
}

export function applyEquipmentPreset(calculator: CalculatorState, preset: EquipmentPreset): CalculatorState {
  return {
    ...calculator,
    firearmName: preset.firearmName,
    y0Cm: preset.y0Cm,
    zeroDistanceM: preset.zeroDistanceM,
    scopeUnits: preset.scopeUnits,
    barrelLengthIn: preset.barrelLengthIn,
    twistRateIn: preset.twistRateIn,
  };
}

export function applyBulletPreset(calculator: CalculatorState, preset: BulletPreset): CalculatorState {
  return {
    ...calculator,
    ammoName: preset.ammoName,
    bulletWeightGr: preset.bulletWeightGr,
    bc: preset.bc,
    model: preset.model,
    V0: preset.V0,
  };
}

/* -------------------------------------- Core types -------------------------------------- */

export type ModelKind = "noDrag" | "G1" | "G7";
export type ScopeUnits = "MIL" | "MOA";

/** Snapshot of environment values */
export type Environment = {
  temperatureC: number;
  pressurehPa: number;
  humidityPct: number;
  altitudeM?: number;
};

/** A specific ammo profile tied to a weapon */
export type AmmoProfile = {
  id: string;
  name: string;                 // friendly name (“New Load”, etc.)
  ammoName: string;             // manufacturer/product if you want
  bulletWeightGr: number;
  bc: number;
  model: ModelKind;
  V0: number;
  zeroDistanceM: number;
  scopeHeightMm: number;
  mvTempSensitivity?: number;
  zeroEnv: Environment;         // IMPORTANT: always filled (migrated/defaulted)
  notes?: string;
  createdAt?: string;
};

/** A weapon with its ammo list */
export type Weapon = {
  id: string;
  name: string;
  scopeUnits: ScopeUnits;
  /** NEW: click value per detent, in weapon’s scopeUnits (e.g., 0.1 for MIL, 0.25 for MOA) */
  scopeClick?: number;
  barrelLengthIn: number;
  twistRateIn: number;
  ammo: AmmoProfile[];
  notes?: string;
  createdAt?: string;
};

/* ------------------------------- Existing preset types ---------------------------------- */

export type EquipmentPreset = {
  id: string;
  name: string;
  firearmName: string;
  y0Cm: number;
  zeroDistanceM: number;
  scopeUnits: ScopeUnits;
  barrelLengthIn: number;
  twistRateIn: number;
  notes?: string;
  createdAt: string;
};

export type BulletPreset = {
  id: string;
  name: string;
  ammoName: string;
  bulletWeightGr: number;
  bc: number;
  model: ModelKind;
  V0: number;
  manufacturer?: string;
  notes?: string;
  createdAt: string;
};

/** Calculator working state (unified on temperatureC/humidityPct) */
export type CalculatorState = {
  V0: number; thetaDeg: number; X: number; y0Cm: number;
  model: ModelKind; bc: number;
  bulletWeightGr: number;

  /** unified env names */
  temperatureC: number;
  humidityPct: number;
  windSpeed: number;        // m/s
  windDirection: number;    // degrees (meteorological or shooter-defined)
  firearmName: string; ammoName: string; barrelLengthIn: number; twistRateIn: number;
  scopeUnits: ScopeUnits;
  zeroDistanceM: number;

  lastResult?: {
    modelUsed: ModelKind; tFlight: number; vImpact: number; drop: number; holdMil: number; holdMoa: number;
    rhoUsed: number;
    windDrift?: number;
  };
};

export type Session = {
  id: string;
  startedAt: string;
  title: string;
  place: string;
};

export type Entry = {
  id: string; sessionId: string; createdAt: string;
  rangeM: number; model: ModelKind; bcUsed: number | null; rho: number;
  V0: number; thetaDeg: number; y0Cm: number;
  bulletWeightGr: number;
  firearmName: string; ammoName: string; barrelLengthIn: number; twistRateIn: number;
  temperature: number; humidity: number; windSpeed: number; windDirection: number;
  offsetUpCm: number; offsetRightCm: number; groupSizeCm?: number | null; shots?: number | null;
  suggestedAdjMil: { up: number; right: number; };
  suggestedAdjMoa: { up: number; right: number; };
  actualAdjMil?: { up: number; right: number; } | null;
  actualAdjMoa?: { up: number; right: number; } | null;
  zeroDistanceM?: number;
  notes: string;
};

/* ------------------------------------- App state ---------------------------------------- */

export type AppState = {
  calculator: CalculatorState;
  session: Session;
  entries: Entry[];
  equipmentPresets: EquipmentPreset[];
  bulletPresets: BulletPreset[];

  /** Structured weapon/ammo model */
  weapons: Weapon[];
  selectedWeaponId?: string;
  selectedAmmoId?: string;
};

const LS_KEY = "ballistics-dope-v1";

/* -------------------------------------- Defaults ---------------------------------------- */

function createDefaultSession(): Session {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    title: "Default Session",
    place: ""
  };
}

export function defaultState(): AppState {
  return {
    calculator: {
      V0: 800, thetaDeg: 2, X: 300, y0Cm: 3.5,
      model: "G7", bc: 0.25,
      bulletWeightGr: 175,
      temperatureC: 15,
      humidityPct: 50,
      windSpeed: 0,
      windDirection: 0,
      firearmName: "", ammoName: "", barrelLengthIn: 20, twistRateIn: 8,
      scopeUnits: "MIL",
      zeroDistanceM: 100,
    },
    session: createDefaultSession(),
    entries: [],
    equipmentPresets: [],
    bulletPresets: [],
    weapons: [],
    selectedWeaponId: undefined,
    selectedAmmoId: undefined,
  };
}

/* ------------------------------------ Persistence --------------------------------------- */

export function loadState(): AppState {
  try {
    const raw = enhancedStorage.getItem(LS_KEY);
    if (!raw) {
      const localStorageRaw = localStorage.getItem(LS_KEY);
      if (!localStorageRaw) return defaultState();
      return parseAndMigrateState(localStorageRaw);
    }
    return parseAndMigrateState(raw);
  } catch (error) {
    console.warn('Failed to load state, using defaults:', error);
    return defaultState();
  }
}

export async function loadStateAsync(): Promise<AppState> {
  try {
    await enhancedStorage.init();
    const raw = await enhancedStorage.getItemAsync(LS_KEY);
    if (!raw) return defaultState();
    return parseAndMigrateState(raw);
  } catch (error) {
    console.warn('Failed to load state async, using defaults:', error);
    return defaultState();
  }
}

/* -------------------------------------- Migration --------------------------------------- */

function ensureZeroEnv(env: Partial<Environment> | undefined): Environment {
  return {
    temperatureC: env?.temperatureC ?? 15,
    pressurehPa: env?.pressurehPa ?? 1013,
    humidityPct: env?.humidityPct ?? 50,
    altitudeM: env?.altitudeM ?? 0,
  };
}

function migrateWeapons(weapons: any[] | undefined): Weapon[] {
  if (!Array.isArray(weapons)) return [];
  return weapons.map((wRaw) => {
    const scopeUnits: ScopeUnits = (wRaw?.scopeUnits === "MOA") ? "MOA" : "MIL";
    const scopeClick = Number.isFinite(wRaw?.scopeClick)
      ? Number(wRaw.scopeClick)
      : (scopeUnits === "MIL" ? 0.1 : 0.25);

    const ammo: AmmoProfile[] = Array.isArray(wRaw?.ammo)
      ? wRaw.ammo.map((a: any) => ({
          id: a?.id ?? crypto.randomUUID(),
          name: a?.name ?? "Load",
          ammoName: a?.ammoName ?? "",
          bulletWeightGr: Number.isFinite(a?.bulletWeightGr) ? a.bulletWeightGr : 175,
          bc: Number.isFinite(a?.bc) ? a.bc : 0.25,
          model: (a?.model === "G1" || a?.model === "noDrag") ? a.model : "G7",
          V0: Number.isFinite(a?.V0) ? a.V0 : 800,
          zeroDistanceM: Number.isFinite(a?.zeroDistanceM) ? a.zeroDistanceM : 100,
          scopeHeightMm: Number.isFinite(a?.scopeHeightMm) ? a.scopeHeightMm : 35,
          mvTempSensitivity: Number.isFinite(a?.mvTempSensitivity) ? a.mvTempSensitivity : undefined,
          zeroEnv: ensureZeroEnv(a?.zeroEnv),
          notes: a?.notes ?? undefined,
          createdAt: a?.createdAt ?? undefined,
        }))
      : [];

    return {
      id: wRaw?.id ?? crypto.randomUUID(),
      name: wRaw?.name ?? "Rifle",
      scopeUnits,
      scopeClick,
      barrelLengthIn: Number.isFinite(wRaw?.barrelLengthIn) ? wRaw.barrelLengthIn : 20,
      twistRateIn: Number.isFinite(wRaw?.twistRateIn) ? wRaw.twistRateIn : 8,
      ammo,
      notes: wRaw?.notes ?? undefined,
      createdAt: wRaw?.createdAt ?? undefined,
    };
  });
}

function migrateCalculator(calcRaw: any, defaults: CalculatorState): CalculatorState {
  if (!calcRaw) return defaults;

  const calc: any = { ...calcRaw };

  // legacy BC fields
  if (calc.bcG1 !== undefined || calc.bcG7 !== undefined) {
    calc.bc = calc.model === "G1" ? (calc.bcG1 ?? 0.45) : (calc.bcG7 ?? 0.25);
    delete calc.bcG1; delete calc.bcG7;
  }

  // rename humidity/temperature → humidityPct/temperatureC
  if (calc.temperature !== undefined && calc.temperatureC === undefined) {
    calc.temperatureC = calc.temperature;
    delete calc.temperature;
  }
  if (calc.humidity !== undefined && calc.humidityPct === undefined) {
    calc.humidityPct = calc.humidity;
    delete calc.humidity;
  }

  // legacy y0 → y0Cm
  if (calc.y0 !== undefined && calc.y0Cm === undefined) {
    calc.y0Cm = calc.y0 * 100;
    delete calc.y0;
  }

  // clean legacy fields
  if (calc.atmosMode !== undefined) {
    delete calc.atmosMode;
    delete calc.rho;
  }
  if (calc.g !== undefined) delete calc.g;

  // ensure required fields
  calc.windSpeed = Number.isFinite(calc.windSpeed) ? calc.windSpeed : 0;
  calc.windDirection = Number.isFinite(calc.windDirection) ? calc.windDirection : 0;
  calc.bulletWeightGr = Number.isFinite(calc.bulletWeightGr) ? calc.bulletWeightGr : 175;
  calc.scopeUnits = (calc.scopeUnits === "MOA") ? "MOA" : "MIL";
  calc.zeroDistanceM = Number.isFinite(calc.zeroDistanceM) ? calc.zeroDistanceM : 100;
  calc.temperatureC = Number.isFinite(calc.temperatureC) ? calc.temperatureC : 15;
  calc.humidityPct = Number.isFinite(calc.humidityPct) ? calc.humidityPct : 50;

  return { ...defaults, ...calc };
}

function parseAndMigrateState(raw: string): AppState {
  try {
    const parsed = JSON.parse(raw);
    const defaults = defaultState();

    // session
    let session: Session = parsed.session && parsed.session.id
      ? { ...parsed.session, place: parsed.session.place ?? "" }
      : createDefaultSession();

    // calculator
    const calculator = migrateCalculator(parsed.calculator, defaults.calculator);

    // weapons + ammo (+scopeClick defaulting)
    const weapons = migrateWeapons(parsed.weapons);

    return {
      calculator,
      session,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      equipmentPresets: Array.isArray(parsed.equipmentPresets) ? parsed.equipmentPresets : [],
      bulletPresets: Array.isArray(parsed.bulletPresets) ? parsed.bulletPresets : [],
      weapons,
      selectedWeaponId: parsed.selectedWeaponId ?? undefined,
      selectedAmmoId: parsed.selectedAmmoId ?? undefined,
    };
  } catch (error) {
    console.warn('Failed to parse state data:', error);
    return defaultState();
  }
}

/* ----------------------------------- Save helpers --------------------------------------- */

export function saveState(s: AppState): void {
  try {
    const json = JSON.stringify(s);
    localStorage.setItem(LS_KEY, json);
    enhancedStorage.setItem(LS_KEY, json).catch(err => {
      console.warn('Failed IndexedDB save, localStorage succeeded:', err);
    });
  } catch (error) {
    console.warn('Failed to save state:', error);
  }
}

export async function saveStateAsync(s: AppState): Promise<void> {
  try {
    await enhancedStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch (error) {
    console.warn('Failed async save, trying localStorage:', error);
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  }
}

/* -------------------------------- Other utilities --------------------------------------- */

export async function getStorageInfo(): Promise<{
  enhanced: { count: number; totalSize: number; oldestTimestamp?: number; newestTimestamp?: number };
  localStorage: { size: number; available: boolean };
  migration: { needed: boolean; completed: boolean };
}> {
  try {
    await enhancedStorage.init();
    const enhancedStats = await enhancedStorage.getStats();

    let localStorageSize = 0;
    let localStorageAvailable = true;
    try {
      const localData = localStorage.getItem(LS_KEY);
      localStorageSize = localData ? localData.length : 0;
    } catch {
      localStorageAvailable = false;
    }

    const localStorageHasData = localStorageSize > 0;
    const indexedDBHasData = enhancedStats.count > 0;
    const migrationNeeded = localStorageHasData && !indexedDBHasData;
    const migrationCompleted = localStorageHasData && indexedDBHasData;

    return {
      enhanced: enhancedStats,
      localStorage: { size: localStorageSize, available: localStorageAvailable },
      migration: { needed: migrationNeeded, completed: migrationCompleted }
    };
  } catch {
    return {
      enhanced: { count: 0, totalSize: 0 },
      localStorage: { size: 0, available: false },
      migration: { needed: false, completed: false }
    };
  }
}

export async function refreshData(): Promise<AppState> {
  try {
    await enhancedStorage.refreshCache();
    return await loadStateAsync();
  } catch {
    return loadState();
  }
}

export async function clearAllData(): Promise<void> {
  try {
    await enhancedStorage.clear();
    localStorage.removeItem(LS_KEY);
  } catch (error) {
    console.warn('Failed to clear all data:', error);
    throw error;
  }
}

export async function exportAppData(): Promise<string> {
  try {
    const state = await loadStateAsync();
    const storageInfo = await getStorageInfo();
    return JSON.stringify({ version: "1.0", exportedAt: new Date().toISOString(), storageInfo, data: state }, null, 2);
  } catch (error) {
    console.warn('Failed to export data:', error);
    throw error;
  }
}

export async function importAppData(jsonData: string): Promise<AppState> {
  try {
    const backup = JSON.parse(jsonData);
    if (!backup.data || !backup.version) throw new Error('Invalid backup format');
    const state = parseAndMigrateState(JSON.stringify(backup.data));
    await saveStateAsync(state);
    return state;
  } catch (error) {
    console.warn('Failed to import data:', error);
    throw error;
  }
}

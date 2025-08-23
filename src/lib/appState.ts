/* Types + defaults + persistence helpers. UI should call these. */
import { enhancedStorage } from './indexedDB';

// ---------------- Helper functions for presets ----------------

export function createEquipmentPreset(data: Omit<EquipmentPreset, 'id' | 'createdAt'>): EquipmentPreset {
  return {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

export function createBulletPreset(data: Omit<BulletPreset, 'id' | 'createdAt'>): BulletPreset {
  return {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
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

// ---------------- Core types ----------------

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
  name: string;
  ammoName: string;
  bulletWeightGr: number;
  bc: number;
  model: ModelKind;
  V0: number;
  zeroDistanceM: number;
  scopeHeightMm: number;
  mvTempSensitivity?: number;
  zeroEnv: Environment;
  notes?: string;
  createdAt?: string;
};

/** A weapon with its ammo list */
export type Weapon = {
  id: string;
  name: string;
  scopeUnits: ScopeUnits;
  barrelLengthIn: number;
  twistRateIn: number;
  ammo: AmmoProfile[];
  notes?: string;
  createdAt?: string;
};

// ---------------- Existing preset types ----------------

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

export type CalculatorState = {
  V0: number; thetaDeg: number; X: number; y0Cm: number;
  model: ModelKind; bc: number;
  bulletWeightGr: number;
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
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

// ---------------- App state ----------------

export type AppState = { 
  calculator: CalculatorState; 
  session: Session; 
  entries: Entry[]; 
  equipmentPresets: EquipmentPreset[];
  bulletPresets: BulletPreset[];

  /** New structured weapon/ammo model */
  weapons: Weapon[];
  selectedWeaponId?: string;
  selectedAmmoId?: string;
};

const LS_KEY = "ballistics-dope-v1";

// ---------------- Defaults ----------------

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
      temperature: 15,
      humidity: 0,
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

// ---------------- Persistence ----------------

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

function parseAndMigrateState(raw: string): AppState {
  try {
    const parsed = JSON.parse(raw);
    const defaults = defaultState();

    // ensure session exists
    let session = parsed.session;
    if (!session || !session.id) {
      session = createDefaultSession();
    } else if (!session.place) {
      session.place = "";
    }

    // migrate calculator
    let calculator = parsed.calculator;
    if (calculator) {
      if (calculator.bcG1 !== undefined || calculator.bcG7 !== undefined) {
        calculator.bc = calculator.model === "G1" ? calculator.bcG1 || 0.45 : calculator.bcG7 || 0.25;
        delete calculator.bcG1;
        delete calculator.bcG7;
      }
      if (calculator.atmosMode !== undefined) {
        calculator.temperature = calculator.temperature || 15;
        calculator.humidity = calculator.humidity || 0;
        delete calculator.atmosMode;
        delete calculator.rho;
      }
      if (calculator.y0 !== undefined) {
        calculator.y0Cm = calculator.y0 * 100;
        delete calculator.y0;
      }
      if (calculator.g !== undefined) {
        delete calculator.g;
      }
      calculator.windSpeed = calculator.windSpeed || 0;
      calculator.windDirection = calculator.windDirection || 0;
      calculator.bulletWeightGr = calculator.bulletWeightGr || 175;
      calculator.scopeUnits = calculator.scopeUnits || "MIL";
      calculator.zeroDistanceM = calculator.zeroDistanceM || 100;
    }

    return {
      calculator: { ...defaults.calculator, ...calculator },
      session,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      equipmentPresets: Array.isArray(parsed.equipmentPresets) ? parsed.equipmentPresets : [],
      bulletPresets: Array.isArray(parsed.bulletPresets) ? parsed.bulletPresets : [],
      weapons: Array.isArray(parsed.weapons) ? parsed.weapons : [],
      selectedWeaponId: parsed.selectedWeaponId ?? undefined,
      selectedAmmoId: parsed.selectedAmmoId ?? undefined,
    };
  } catch (error) {
    console.warn('Failed to parse state data:', error);
    return defaultState();
  }
}

// ---------------- Save helpers ----------------

export function saveState(s: AppState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
    enhancedStorage.setItem(LS_KEY, JSON.stringify(s)).catch(error => {
      console.warn('Failed to save to IndexedDB, localStorage backup succeeded:', error);
    });
  } catch (error) {
    console.warn('Failed to save state:', error);
  }
}

export async function saveStateAsync(s: AppState): Promise<void> {
  try {
    await enhancedStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch (error) {
    console.warn('Failed to save state async, trying localStorage fallback:', error);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch (fallbackError) {
      console.error('All save methods failed:', fallbackError);
      throw fallbackError;
    }
  }
}

// ---------------- Other utilities (unchanged) ----------------

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

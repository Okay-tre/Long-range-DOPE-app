/* Types + defaults + persistence helpers. UI should call these. */
import { enhancedStorage } from './indexedDB';

// Helper functions for preset management
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

export type ModelKind = "noDrag" | "G1" | "G7";
export type ScopeUnits = "MIL" | "MOA";

export type EquipmentPreset = {
  id: string;
  name: string;
  firearmName: string;
  y0Cm: number; // Height over bore in centimeters
  zeroDistanceM: number; // Zero distance in meters
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
  bc: number; // Ballistic coefficient
  model: ModelKind; // Drag model
  V0: number; // Muzzle velocity
  manufacturer?: string;
  notes?: string;
  createdAt: string;
};

export type CalculatorState = {
  V0: number; thetaDeg: number; X: number; y0Cm: number; // Changed y0 to y0Cm for centimeters
  model: ModelKind; bc: number; // Single BC field that applies to chosen model
  bulletWeightGr: number; // Bullet weight in grains
  // Weather inputs instead of atmosMode/rho
  temperature: number; // Celsius
  humidity: number; // Percentage (0-100)
  windSpeed: number; // m/s
  windDirection: number; // degrees (0-359, 0 = headwind, 180 = tailwind)
  firearmName: string; ammoName: string; barrelLengthIn: number; twistRateIn: number;
  scopeUnits: ScopeUnits;
  zeroDistanceM: number; // Zero distance in meters
  lastResult?: {
    modelUsed: ModelKind; tFlight: number; vImpact: number; drop: number; holdMil: number; holdMoa: number;
    rhoUsed: number; // Calculated air density for reference
    windDrift?: number; // Wind drift in meters
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
  V0: number; thetaDeg: number; y0Cm: number; // Changed from y0 to y0Cm
  bulletWeightGr: number; // Bullet weight in grains
  firearmName: string; ammoName: string; barrelLengthIn: number; twistRateIn: number;
  // Weather conditions at time of shot
  temperature: number; humidity: number; windSpeed: number; windDirection: number;
  offsetUpCm: number; offsetRightCm: number; groupSizeCm?: number | null; shots?: number | null;
  suggestedAdjMil: { up: number; right: number; };
  suggestedAdjMoa: { up: number; right: number; };
  // Actual scope adjustments made (optional)
  actualAdjMil?: { up: number; right: number; } | null;
  actualAdjMoa?: { up: number; right: number; } | null;
  zeroDistanceM?: number; // Zero distance used for this entry (for backward compatibility)
  notes: string;
};

export type AppState = { 
  calculator: CalculatorState; 
  session: Session; 
  entries: Entry[]; 
  equipmentPresets: EquipmentPreset[];
  bulletPresets: BulletPreset[];
};

const LS_KEY = "ballistics-dope-v1";

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
      V0: 800, thetaDeg: 2, X: 300, y0Cm: 3.5, // Height over bore in cm
      model: "G7", bc: 0.25, // Single BC value
      bulletWeightGr: 175, // Default bullet weight
      temperature: 15, // Standard temperature (15°C)
      humidity: 0, // Standard humidity (0%)
      windSpeed: 0, // No wind
      windDirection: 0, // Headwind direction
      firearmName: "", ammoName: "", barrelLengthIn: 20, twistRateIn: 8,
      scopeUnits: "MIL", // Default to MIL
      zeroDistanceM: 100, // Default zero distance 100m
    },
    session: createDefaultSession(),
    entries: [],
    equipmentPresets: [],
    bulletPresets: [],
  };
}

/**
 * Load state with enhanced storage system
 * First tries IndexedDB, falls back to localStorage if needed
 */
export function loadState(): AppState {
  try {
    // Try to get from enhanced storage (synchronous for backward compatibility)
    const raw = enhancedStorage.getItem(LS_KEY);
    if (!raw) {
      // Also check for the old localStorage key directly
      const localStorageRaw = localStorage.getItem(LS_KEY);
      if (!localStorageRaw) {
        return defaultState();
      }
      // Use localStorage data but don't migrate yet (will happen in async init)
      return parseAndMigrateState(localStorageRaw);
    }
    
    return parseAndMigrateState(raw);
  } catch (error) {
    console.warn('Failed to load state, using defaults:', error);
    return defaultState();
  }
}

/**
 * Load state asynchronously (preferred method for new code)
 */
export async function loadStateAsync(): Promise<AppState> {
  try {
    await enhancedStorage.init();
    const raw = await enhancedStorage.getItemAsync(LS_KEY);
    
    if (!raw) {
      return defaultState();
    }
    
    return parseAndMigrateState(raw);
  } catch (error) {
    console.warn('Failed to load state async, using defaults:', error);
    return defaultState();
  }
}

/**
 * Parse and migrate state data with all necessary transformations
 */
function parseAndMigrateState(raw: string): AppState {
  try {
    const parsed = JSON.parse(raw);
    const defaultStateValue = defaultState();
    
    // Ensure we have a valid session with migration for place field
    let session = parsed.session;
    if (!session || !session.id || !session.startedAt || !session.title) {
      session = createDefaultSession();
    } else {
      // Migrate existing sessions to include place field
      if (!session.place) {
        session.place = "";
      }
    }
    
    // Migrate calculator state for new weather-based structure
    let calculator = parsed.calculator;
    if (calculator) {
      // Migrate old structure to new
      if (calculator.bcG1 !== undefined || calculator.bcG7 !== undefined) {
        // Old structure - convert to new
        calculator.bc = calculator.model === "G1" ? calculator.bcG1 || 0.45 : calculator.bcG7 || 0.25;
        delete calculator.bcG1;
        delete calculator.bcG7;
      }
      
      // Migrate atmosMode/rho to weather
      if (calculator.atmosMode !== undefined) {
        calculator.temperature = calculator.temperature || 15;
        calculator.humidity = calculator.humidity || 0;
        delete calculator.atmosMode;
        delete calculator.rho;
      }
      
      // Migrate y0 to y0Cm
      if (calculator.y0 !== undefined) {
        calculator.y0Cm = calculator.y0 * 100; // Convert m to cm
        delete calculator.y0;
      }
      
      // Remove gravity field
      if (calculator.g !== undefined) {
        delete calculator.g;
      }
      
      // Add missing fields with defaults
      calculator.windSpeed = calculator.windSpeed || 0;
      calculator.windDirection = calculator.windDirection || 0;
      calculator.bulletWeightGr = calculator.bulletWeightGr || 175; // Default bullet weight
      calculator.scopeUnits = calculator.scopeUnits || "MIL"; // Default scope units
      calculator.zeroDistanceM = calculator.zeroDistanceM || 100; // Default zero distance
    }
    
    // Merge with defaults to ensure all required fields exist
    return {
      calculator: { ...defaultStateValue.calculator, ...calculator },
      session,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      equipmentPresets: Array.isArray(parsed.equipmentPresets) ? parsed.equipmentPresets : [],
      bulletPresets: Array.isArray(parsed.bulletPresets) ? parsed.bulletPresets : [],
    };
  } catch (error) {
    console.warn('Failed to parse state data:', error);
    return defaultState();
  }
}

/**
 * Save state with enhanced storage system
 * Uses async IndexedDB by default, with localStorage fallback
 */
export function saveState(s: AppState): void {
  try {
    // Save synchronously to localStorage for immediate persistence
    localStorage.setItem(LS_KEY, JSON.stringify(s));
    
    // Also save asynchronously to IndexedDB for better durability
    enhancedStorage.setItem(LS_KEY, JSON.stringify(s)).catch(error => {
      console.warn('Failed to save to IndexedDB, localStorage backup succeeded:', error);
    });
  } catch (error) {
    console.warn('Failed to save state:', error);
  }
}

/**
 * Save state asynchronously (preferred method for new code)
 */
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

/**
 * Get storage statistics and information
 */
export async function getStorageInfo(): Promise<{
  enhanced: { count: number; totalSize: number; oldestTimestamp?: number; newestTimestamp?: number };
  localStorage: { size: number; available: boolean };
  migration: { needed: boolean; completed: boolean };
}> {
  try {
    await enhancedStorage.init();
    
    const enhancedStats = await enhancedStorage.getStats();
    
    // Check localStorage
    let localStorageSize = 0;
    let localStorageAvailable = true;
    try {
      const localData = localStorage.getItem(LS_KEY);
      localStorageSize = localData ? localData.length : 0;
    } catch (error) {
      localStorageAvailable = false;
    }

    // Check if migration is needed
    const localStorageHasData = localStorageSize > 0;
    const indexedDBHasData = enhancedStats.count > 0;
    const migrationNeeded = localStorageHasData && !indexedDBHasData;
    const migrationCompleted = localStorageHasData && indexedDBHasData;

    return {
      enhanced: enhancedStats,
      localStorage: {
        size: localStorageSize,
        available: localStorageAvailable
      },
      migration: {
        needed: migrationNeeded,
        completed: migrationCompleted
      }
    };
  } catch (error) {
    console.warn('Failed to get storage info:', error);
    return {
      enhanced: { count: 0, totalSize: 0 },
      localStorage: { size: 0, available: false },
      migration: { needed: false, completed: false }
    };
  }
}

/**
 * Force a manual data refresh from persistent storage
 */
export async function refreshData(): Promise<AppState> {
  try {
    await enhancedStorage.refreshCache();
    return await loadStateAsync();
  } catch (error) {
    console.warn('Failed to refresh data:', error);
    return loadState();
  }
}

/**
 * Clear all application data
 */
export async function clearAllData(): Promise<void> {
  try {
    await enhancedStorage.clear();
    localStorage.removeItem(LS_KEY);
  } catch (error) {
    console.warn('Failed to clear all data:', error);
    throw error;
  }
}

/**
 * Export data for backup
 */
export async function exportAppData(): Promise<string> {
  try {
    const state = await loadStateAsync();
    const storageInfo = await getStorageInfo();
    
    return JSON.stringify({
      version: "1.0",
      exportedAt: new Date().toISOString(),
      storageInfo,
      data: state
    }, null, 2);
  } catch (error) {
    console.warn('Failed to export data:', error);
    throw error;
  }
}

/**
 * Import data from backup
 */
export async function importAppData(jsonData: string): Promise<AppState> {
  try {
    const backup = JSON.parse(jsonData);
    
    if (!backup.data || !backup.version) {
      throw new Error('Invalid backup format');
    }
    
    const state = parseAndMigrateState(JSON.stringify(backup.data));
    await saveStateAsync(state);
    
    return state;
  } catch (error) {
    console.warn('Failed to import data:', error);
    throw error;
  }
}
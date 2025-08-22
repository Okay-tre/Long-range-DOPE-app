/* Data operations for /log page. Snapshot + save entry. */

import type { AppState, Entry, CalculatorState } from "../lib/appState";
import { calculateAirDensity, heightOverBoreCmToM } from "../utils/ballistics";

export type LogForm = {
  rangeM: number;
  offsetUpCm: number;
  offsetRightCm: number;
  groupSizeCm: number | null;
  shots: number | null;
  notes: string;
  // Actual scope adjustments made (optional)
  actualAdjMil?: { up: number | null; right: number | null; } | null;
  actualAdjMoa?: { up: number | null; right: number | null; } | null;
};

export type CalcSnapshot = {
  model: CalculatorState['model'];
  bcUsed: number;
  rhoUsed: number;
  V0: number;
  thetaDeg: number;
  y0Cm: number; // Changed from y0 to y0Cm
  bulletWeightGr: number; // Bullet weight in grains
  firearmName: string;
  ammoName: string;
  barrelLengthIn: number;
  twistRateIn: number;
  zeroDistanceM: number; // Zero distance in meters
  // Weather conditions
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
};

export function makeSnapshotFromCalculator(state: AppState): CalcSnapshot {
  const { calculator } = state;
  
  // Calculate air density from current weather conditions
  const rhoUsed = calculateAirDensity(calculator.temperature, calculator.humidity);
  
  return {
    model: calculator.model,
    bcUsed: calculator.bc,
    rhoUsed,
    V0: calculator.V0,
    thetaDeg: calculator.thetaDeg,
    y0Cm: calculator.y0Cm, // Keep in cm
    bulletWeightGr: calculator.bulletWeightGr,
    firearmName: calculator.firearmName,
    ammoName: calculator.ammoName,
    barrelLengthIn: calculator.barrelLengthIn,
    twistRateIn: calculator.twistRateIn,
    zeroDistanceM: calculator.zeroDistanceM,
    temperature: calculator.temperature,
    humidity: calculator.humidity,
    windSpeed: calculator.windSpeed,
    windDirection: calculator.windDirection,
  };
}

export function saveEntryHandler(
  state: AppState,
  setState: (s: AppState) => void,
  sessionId: string,
  logForm: LogForm,
  snapshot: CalcSnapshot
) {
  // Validation
  if (logForm.rangeM <= 0) throw new Error("Range must be positive");
  if (logForm.groupSizeCm !== null && logForm.groupSizeCm <= 0) {
    throw new Error("Group size must be positive or null");
  }
  if (logForm.shots !== null && logForm.shots <= 0) {
    throw new Error("Number of shots must be positive or null");
  }

  // Calculate suggested adjustments in mil and MOA
  const suggestedAdjMil = {
    up: (-logForm.offsetUpCm * 10) / logForm.rangeM, // mil = cm * 10 / range_m
    right: (-logForm.offsetRightCm * 10) / logForm.rangeM,
  };

  const suggestedAdjMoa = {
    up: (-logForm.offsetUpCm * 34.38) / logForm.rangeM, // MOA = cm * 34.38 / range_m
    right: (-logForm.offsetRightCm * 34.38) / logForm.rangeM,
  };

  // Process actual adjustments - convert null values and ensure valid numbers
  let actualAdjMil: { up: number; right: number } | null = null;
  let actualAdjMoa: { up: number; right: number } | null = null;
  
  if (logForm.actualAdjMil && 
      (logForm.actualAdjMil.up !== null || logForm.actualAdjMil.right !== null)) {
    actualAdjMil = {
      up: logForm.actualAdjMil.up || 0,
      right: logForm.actualAdjMil.right || 0,
    };
  }
  
  if (logForm.actualAdjMoa && 
      (logForm.actualAdjMoa.up !== null || logForm.actualAdjMoa.right !== null)) {
    actualAdjMoa = {
      up: logForm.actualAdjMoa.up || 0,
      right: logForm.actualAdjMoa.right || 0,
    };
  }

  const entry: Entry = {
    id: crypto.randomUUID(),
    sessionId,
    createdAt: new Date().toISOString(),
    rangeM: logForm.rangeM,
    model: snapshot.model,
    bcUsed: snapshot.bcUsed,
    rho: snapshot.rhoUsed,
    V0: snapshot.V0,
    thetaDeg: snapshot.thetaDeg,
    y0Cm: snapshot.y0Cm, // Store in cm
    bulletWeightGr: snapshot.bulletWeightGr,
    firearmName: snapshot.firearmName,
    ammoName: snapshot.ammoName,
    barrelLengthIn: snapshot.barrelLengthIn,
    twistRateIn: snapshot.twistRateIn,
    zeroDistanceM: snapshot.zeroDistanceM, // Store zero distance used
    // Weather conditions
    temperature: snapshot.temperature,
    humidity: snapshot.humidity,
    windSpeed: snapshot.windSpeed,
    windDirection: snapshot.windDirection,
    // Shot data
    offsetUpCm: logForm.offsetUpCm,
    offsetRightCm: logForm.offsetRightCm,
    groupSizeCm: logForm.groupSizeCm,
    shots: logForm.shots,
    suggestedAdjMil,
    suggestedAdjMoa,
    // Actual scope adjustments
    actualAdjMil,
    actualAdjMoa,
    notes: logForm.notes,
  };

  setState({ ...state, entries: [...state.entries, entry] });
}

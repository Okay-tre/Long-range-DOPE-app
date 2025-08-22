/* Ballistics calculation operations for /calc page. */

import type { AppState, CalculatorState, ModelKind, ScopeUnits } from "../lib/appState";
import { calculate, type SolveInput } from "../lib/calcEngine";
import { calculateAirDensity, heightOverBoreCmToM, calculateWindDrift, calculateWindVelocityEffect } from "../utils/ballistics";

export function updateCalculatorField(
  state: AppState, 
  setState: (s: AppState) => void, 
  field: keyof CalculatorState, 
  value: any
) {
  const newCalculator = { ...state.calculator, [field]: value };
  
  // Clear last result when inputs change (except for lastResult itself)
  if (field !== 'lastResult') {
    delete newCalculator.lastResult;
  }
  
  setState({ ...state, calculator: newCalculator });
}

export function validateAndCalculate(
  state: AppState, 
  setState: (s: AppState) => void
): boolean {
  const { calculator } = state;
  
  // Validation with fail-fast approach
  const errors: string[] = [];
  
  if (calculator.V0 <= 0) errors.push("Muzzle velocity must be positive");
  if (calculator.X <= 0) errors.push("Range must be positive");
  if (calculator.bc <= 0) errors.push("Ballistic coefficient must be positive");
  if (calculator.bulletWeightGr <= 0) errors.push("Bullet weight must be positive");
  if (calculator.temperature < -50 || calculator.temperature > 60) {
    errors.push("Temperature must be between -50°C and 60°C");
  }
  if (calculator.humidity < 0 || calculator.humidity > 100) {
    errors.push("Humidity must be between 0% and 100%");
  }
  if (calculator.windSpeed < 0) errors.push("Wind speed cannot be negative");
  if (calculator.windDirection < 0 || calculator.windDirection >= 360) {
    errors.push("Wind direction must be between 0° and 359°");
  }
  
  if (errors.length > 0) {
    // Could show errors in UI here
    console.warn("Validation errors:", errors);
    return false;
  }
  
  try {
    // Calculate air density from weather conditions
    const rhoUsed = calculateAirDensity(calculator.temperature, calculator.humidity);
    
    // Convert height over bore from cm to meters
    const y0 = heightOverBoreCmToM(calculator.y0Cm);
    
    // Apply wind velocity effect to initial velocity
    const velocityEffect = calculateWindVelocityEffect(calculator.windSpeed, calculator.windDirection);
    const effectiveV0 = calculator.V0 * velocityEffect;
    
    // Prepare input for ballistics calculation
    const solveInput: SolveInput = {
      V0: effectiveV0,
      thetaDeg: calculator.thetaDeg,
      X: calculator.X,
      g: 9.81, // Fixed gravity
      y0,
      model: calculator.model,
      bcUsed: calculator.model === "noDrag" ? null : calculator.bc,
      rho: rhoUsed,
    };
    
    // Perform ballistics calculation
    const result = calculate(solveInput);
    
    // Calculate wind drift
    const avgVelocity = (effectiveV0 + result.vImpact) / 2;
    const windDrift = calculateWindDrift(
      calculator.windSpeed, 
      calculator.windDirection, 
      result.tFlight, 
      avgVelocity
    );
    
    // Store result with derived values
    const lastResult = {
      modelUsed: calculator.model,
      tFlight: result.tFlight,
      vImpact: result.vImpact,
      drop: result.drop,
      holdMil: result.holdMil,
      holdMoa: result.holdMoa,
      rhoUsed,
      windDrift, // Add wind drift to results
    };
    
    updateCalculatorField(state, setState, 'lastResult', lastResult);
    return true;
    
  } catch (error) {
    console.error("Calculation failed:", error);
    return false;
  }
}

export function resetCalculator(state: AppState, setState: (s: AppState) => void) {
  const defaults = {
    V0: 800, thetaDeg: 2, X: 300, y0Cm: 3.5,
    model: "G7" as ModelKind, bc: 0.25, bulletWeightGr: 175,
    temperature: 15, humidity: 0, windSpeed: 0, windDirection: 0,
    firearmName: "", ammoName: "", barrelLengthIn: 20, twistRateIn: 8,
    scopeUnits: "MIL" as ScopeUnits,
  };
  
  setState({ ...state, calculator: { ...defaults } });
}

export function setDragModel(
  state: AppState, 
  setState: (s: AppState) => void, 
  model: ModelKind
) {
  // When switching models, suggest appropriate BC values
  let suggestedBC = state.calculator.bc;
  
  if (model === "G1" && state.calculator.model === "G7") {
    // Convert from G7 to G1 (rough approximation)
    suggestedBC = state.calculator.bc * 1.8;
  } else if (model === "G7" && state.calculator.model === "G1") {
    // Convert from G1 to G7 (rough approximation)
    suggestedBC = state.calculator.bc / 1.8;
  } else if (model === "noDrag") {
    suggestedBC = 1.0; // No drag means BC doesn't matter, but set to 1 for clarity
  }
  
  updateCalculatorField(state, setState, 'model', model);
  updateCalculatorField(state, setState, 'bc', Number(suggestedBC.toFixed(3)));
}

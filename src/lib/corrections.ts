// src/lib/corrections.ts
import type { AmmoProfile, Environment, ScopeUnits } from "./appState";
import { solveTrajectory } from "./calcEngine";

/**
 * Conversions
 */
export const milToMoa = (mil: number) => mil * 3.43774677;
export const moaToMil = (moa: number) => moa / 3.43774677;

/** Convert linear offset (cm) on target at a given range (m) to MIL */
export function cmToMil(offsetCm: number, rangeM: number): number {
  const offsetM = offsetCm / 100;
  return (offsetM / rangeM) * 1000;
}

/**
 * Compute the *predicted* solution for a shot at a given range,
 * using the full ballistic engine (drag tables, zero env, density, wind).
 */
export function computePredictedHold(
  ammo: AmmoProfile,
  env: Environment,
  rangeM: number,
  windSpeed = 0,
  windAngle = 90
) {
  const res = solveTrajectory(ammo, env, rangeM, windSpeed, windAngle);
  return {
    holdMil: res.holdMil,
    holdMoa: res.holdMoa,
    dropM: res.dropM,
    driftM: res.driftM,
    tof: res.tof,
    impactVel: res.impactVel,
  };
}

/**
 * Suggest scope corrections based on:
 *  - the *predicted* hold from the ballistic solver
 *  - the *measured* group offset on target (cm up/right)
 *
 * Sign convention (common for logging apps):
 *   offsetUpCm   > 0  → group printed ABOVE point of aim
 *   offsetRightCm> 0  → group printed RIGHT  of point of aim
 *
 * To center impacts:
 *   - if group is HIGH  (+up), dial DOWN (negative "up" clicks)
 *   - if group is RIGHT (+right), dial LEFT (negative "right" clicks)
 *
 * We return both:
 *   - predictedDial: physics-based dial from zero for this range
 *   - correctionFromOffset: extra dial to fix the measured offset
 *   - finalDial: predictedDial + correctionFromOffset
 */
export function suggestScopeCorrection({
  ammo,
  env,
  rangeM,
  windSpeed = 0,
  windAngle = 90,
  offsetUpCm,
  offsetRightCm,
  scopeUnits,
}: {
  ammo: AmmoProfile;
  env: Environment;
  rangeM: number;
  windSpeed?: number;
  windAngle?: number;
  offsetUpCm: number;     // +above POA, −below POA
  offsetRightCm: number;  // +right of POA, −left  of POA
  scopeUnits: ScopeUnits; // "MIL" | "MOA"
}) {
  const pred = computePredictedHold(ammo, env, rangeM, windSpeed, windAngle);

  // How many MIL to remove the *observed* offset from the target?
  // (+up offset means the shot hit high → we need to dial "down" = negative up MIL)
  const offsetMilUp = cmToMil(offsetUpCm, rangeM);
  const offsetMilRight = cmToMil(offsetRightCm, rangeM);

  // Extra corrections to apply from the observed offset (signs explained above)
  const correctionFromOffsetMil = {
    up: -offsetMilUp,
    right: -offsetMilRight,
  };

  // The *predicted* dial from your stored zero to center at that range:
  const predictedDialMil = {
    up: pred.holdMil, // Up is positive MIL to lift LOS to meet drop
    right: 0,         // We currently use basic wind drift in table; dial for wind separately if desired
  };

  // Final dial = predicted dial + extra correction from the specific group’s offset
  const finalDialMil = {
    up: predictedDialMil.up + correctionFromOffsetMil.up,
    right: predictedDialMil.right + correctionFromOffsetMil.right,
  };

  // Also return MOA for convenience
  const toUnits = (mil: number) =>
    scopeUnits === "MIL" ? mil : milToMoa(mil);

  return {
    units: scopeUnits,
    predictedDial: {
      up: toUnits(predictedDialMil.up),
      right: toUnits(predictedDialMil.right),
    },
    correctionFromOffset: {
      up: toUnits(correctionFromOffsetMil.up),
      right: toUnits(correctionFromOffsetMil.right),
    },
    finalDial: {
      up: toUnits(finalDialMil.up),
      right: toUnits(finalDialMil.right),
    },
    // raw & extra info
    raw: {
      predictedHoldMil: pred.holdMil,
      dropM: pred.dropM,
      driftM: pred.driftM,
      tof: pred.tof,
      impactVel: pred.impactVel,
      offsetMil: { up: offsetMilUp, right: offsetMilRight },
      finalDialMil,
    },
  };
}

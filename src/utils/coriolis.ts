// src/utils/coriolis.ts
// Lightweight Coriolis corrections for small-arms ballistics.
// Uses a constant-average-velocity approximation over time-of-flight.
// Returns *additive* scope holds (mils & moa) to apply to your ballistic result.
//
// Sign convention (scope dials):
//  - Elevation MIL/MOA: + = dial UP (bullet hitting low)
//  - Windage  MIL/MOA: + = dial LEFT (bullet hitting right)
//
// In the Northern Hemisphere:
//  - Firing NORTH -> right drift -> dial LEFT (+ windage)
//  - Firing EAST  -> strikes higher (Eötvös) -> dial DOWN (negative elevation)
//
// We compute displacement, then convert to holds: hold_mils = disp / range * 1000

export type CoriolisInput = {
  rangeM: number;       // target distance (m)
  tofSec: number;       // time of flight (s)
  vMuzzle: number;      // muzzle velocity (m/s)
  vImpact: number;      // impact velocity from your solver (m/s)
  latitudeDeg: number;  // +N, -S
  azimuthDeg: number;   // 0°=North, 90°=East, 180°=South, 270°=West
};

export type CoriolisHold = {
  elevMil: number;  // add to ballistic hold (mils)
  elevMoa: number;
  windMil: number;  // add to wind hold (mils)
  windMoa: number;
  eastDriftM: number; // meters to the right (+) / left (-)
  upShiftM: number;   // meters up (+) / down (-)
};

const OMEGA = 7.2921159e-5; // rad/s (Earth rotation)
const MIL_TO_MOA = 3.437746;

function rad(d: number) { return (d * Math.PI) / 180; }

/**
 * computeCoriolisHold
 * Simple constant-average-velocity model:
 *   Vavg = (vMuzzle + vImpact)/2
 *   east drift ≈ Ω * Vnorth * sinφ * t^2
 *   vertical (Eötvös) shift ≈ Ω * Veast * cosφ * t^2
 * Then convert to scope holds against the *range* line.
 */
export function computeCoriolisHold(input: CoriolisInput): CoriolisHold {
  const { rangeM, tofSec, vMuzzle, vImpact, latitudeDeg, azimuthDeg } = input;

  if (!rangeM || !tofSec) {
    return { elevMil: 0, elevMoa: 0, windMil: 0, windMoa: 0, eastDriftM: 0, upShiftM: 0 };
  }

  const phi = rad(latitudeDeg);
  const psi = rad(azimuthDeg);

  // Average forward speed over flight
  const vAvg = Math.max(0, (vMuzzle + vImpact) / 2);

  // Decompose forward velocity into local North/East
  const vNorth = vAvg * Math.cos(psi);
  const vEast  = vAvg * Math.sin(psi);

  // Displacements (meters). Positive eastDrift = bullet lands RIGHT of aim.
  const eastDriftM = OMEGA * vNorth * Math.sin(phi) * (tofSec ** 2);
  // Positive upShiftM = bullet lands HIGHER than aim (Eötvös when shooting East).
  const upShiftM   = OMEGA * vEast  * Math.cos(phi) * (tofSec ** 2);

  // Convert to scope holds (what we dial in):
  // Windage: if bullet hit RIGHT (+eastDrift), we dial LEFT = positive wind hold
  const windMil = (eastDriftM / rangeM) * 1000; // +mil = LEFT (correcting rightward impact)
  const windMoa = windMil * MIL_TO_MOA;

  // Elevation: if bullet hit HIGH (+upShift), we dial DOWN = negative elevation hold
  const elevMil = -(upShiftM / rangeM) * 1000; // negative = DOWN
  const elevMoa = elevMil * MIL_TO_MOA;

  return { elevMil, elevMoa, windMil, windMoa, eastDriftM, upShiftM };
}

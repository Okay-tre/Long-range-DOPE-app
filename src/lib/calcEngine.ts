import type { AmmoProfile, Environment } from "./appState";
import { fG1, fG7 } from "./dragTables";

const g = 9.81;           // m/s²
const R = 287.05;         // J/(kg·K)
const RHO0 = 1.225;       // kg/m³ (ICAO sea-level ref)

/* ---------------- Environment helpers ---------------- */

export function airDensity(env: Environment): number {
  const T = env.temperatureC + 273.15;      // K
  const p = env.pressurehPa * 100;          // Pa
  return p / (R * T);
}

export function mvCorrected(ammo: AmmoProfile, current: Environment): number {
  if (!ammo.mvTempSensitivity) return ammo.V0;
  const dT = current.temperatureC - ammo.zeroEnv.temperatureC;
  return ammo.V0 + ammo.mvTempSensitivity * dT;
}

/** Effective BC scaling: drag ∝ ρ, so BC_eff ≈ BC * (ρ_zero / ρ_now) */
export function bcCorrected(ammo: AmmoProfile, current: Environment): number {
  const rhoZero = airDensity(ammo.zeroEnv);
  const rhoNow  = airDensity(current);
  return ammo.bc * (rhoZero / rhoNow);
}

/* ---------------- Drag function from tables ---------------- */

function fDrag(model: AmmoProfile["model"], v: number): number {
  if (model === "G1") return fG1(v);
  if (model === "G7") return fG7(v);
  // "noDrag" fallback (nearly zero drag): tiny value avoids div-by-zero
  return 1e-12;
}

/* ---------------- Core integrator ----------------
   We integrate in *distance* steps (dx), using:
     dv/dx = - f(v) / BC_eff
   and gravity via dt = dx / vx.
   Coordinates:
     - x forward (m), y up (m) relative to *bore line origin*
     - LOS is a horizontal line at y = scopeHeight (m)
*/

type SolveParams = {
  ammo: AmmoProfile;
  env: Environment;
  rangeM: number;
  windSpeed?: number;    // m/s (at 90° gives max drift)
  windAngleDeg?: number; // 0=headwind, 90=full value from left
  dx?: number;           // step size (m), default 1.0
  launchAngleRad: number;// bore angle above LOS (radians)
};

function integrateToRange(p: SolveParams) {
  const { ammo, env, rangeM, windSpeed = 0, windAngleDeg = 90, dx = 1, launchAngleRad } = p;

  const BCeff = bcCorrected(ammo, env);
  const V0    = mvCorrected(ammo, env);
  const yLOS  = (ammo.scopeHeightMm ?? 0) / 1000; // LOS height above bore at muzzle (m)

  // Initial state at muzzle (x=0, y=yLOS because we measure relative to LOS)
  let x = 0;
  let y = yLOS;
  let v = Math.max(0.1, V0);
  let th = launchAngleRad; // current velocity angle relative to horizontal LOS

  // components (for dt)
  let vx = v * Math.cos(th);
  let vy = v * Math.sin(th);

  let t = 0;
  let drift = 0;

  // precompute wind component (crosswind only)
  const windCross = windSpeed * Math.cos((windAngleDeg * Math.PI) / 180); // + from left to right

  while (x < rangeM && y > -50) {
    // distance step
    const step = Math.min(dx, rangeM - x);

    // drag retardation in speed per distance
    const f = fDrag(ammo.model, v);
    const dv_drag = -(f / Math.max(1e-12, BCeff)) * step; // dv from drag along velocity vector

    // time step from horizontal component
    vx = Math.max(0.1, v * Math.cos(th));
    const dt = step / vx;

    // apply gravity to vertical component over dt
    vy = v * Math.sin(th) - g * dt;

    // new speed magnitude (drag reduces |v|)
    const v_afterDrag = Math.max(0.1, v + dv_drag);

    // recompute angle from components after gravity (direction change)
    const th_new = Math.atan2(vy, vx);

    // project new magnitude along new direction
    v = v_afterDrag;
    th = th_new;

    // advance position
    x += step;
    y += vy * dt; // vertical position relative to LOS

    // wind drift: simple "carried by wind" approx (can be refined later)
    drift += windCross * dt;

    t += dt;
  }

  const drop = yLOS - y; // vertical drop below LOS at range
  const impactVel = v;

  // holds
  const holdMil = (drop / rangeM) * 1000;
  const holdMoa = holdMil * 3.43774677;

  return { tof: t, impactVel, dropM: drop, driftM: drift, holdMil, holdMoa };
}

/* ---------------- Find launch angle for a requested zero ----------------
   We choose the bore angle so the trajectory crosses LOS at zeroDistanceM.
   Binary search on angle to make drop at zero ≈ 0.
*/
export function solveZeroAngle(ammo: AmmoProfile, env: Environment): number {
  const Z = Math.max(1, ammo.zeroDistanceM || 100);
  // search 0..10 mrad (~0..0.57°), then expand if needed
  let lo = 0;
  let hi = 0.010; // radians
  let best = 0;

  const tryWith = (ang: number) =>
    integrateToRange({ ammo, env, rangeM: Z, launchAngleRad: ang }).dropM;

  // expand upper bound until we bracket sign change or reach 50 mrad
  let dLo = tryWith(lo); // drop at zero for lo
  let dHi = tryWith(hi);
  let expandCount = 0;
  while (dLo * dHi > 0 && hi < 0.050 && expandCount < 10) {
    hi *= 2;
    dHi = tryWith(hi);
    expandCount++;
  }

  // Binary search
  for (let i = 0; i < 30; i++) {
    const mid = 0.5 * (lo + hi);
    const dMid = tryWith(mid);
    best = mid;
    if (Math.abs(dMid) < 0.0005) break; // ~0.5 mm at zero
    if (dLo * dMid <= 0) {
      hi = mid;
      dHi = dMid;
    } else {
      lo = mid;
      dLo = dMid;
    }
  }
  return best;
}

/* ---------------- Public API ---------------- */

/** Solve single range using ammo’s zero & scope geometry + current env */
export function solveTrajectory(
  ammo: AmmoProfile,
  currentEnv: Environment,
  rangeM: number,
  windSpeed = 0,
  windAngleDeg = 90,
  dx = 1.0
) {
  const angle = solveZeroAngle(ammo, currentEnv);
  return integrateToRange({
    ammo,
    env: currentEnv,
    rangeM,
    windSpeed,
    windAngleDeg,
    dx,
    launchAngleRad: angle,
  });
}

/** Build a DOPE table over many ranges */
export function buildDopeTable(
  ammo: AmmoProfile,
  currentEnv: Environment,
  rangesM: number[],
  windSpeed = 0,
  windAngleDeg = 90
) {
  const angle = solveZeroAngle(ammo, currentEnv);
  return rangesM.map((R) =>
    integrateToRange({
      ammo,
      env: currentEnv,
      rangeM: R,
      windSpeed,
      windAngleDeg,
      dx: R < 200 ? 0.5 : 1.0, // smaller steps at close range
      launchAngleRad: angle,
    })
  );
}

import type { AmmoProfile, Environment } from "./appState";
import { G1, G7 } from "./dragTables"; // assume these export arrays of { mach, cd }

const g = 9.81;
const rho0 = 1.225; // ICAO reference kg/m³

function airDensity(env: Environment): number {
  const T = env.temperatureC + 273.15;
  const p = env.pressurehPa * 100; // hPa → Pa
  const R = 287.05;
  return p / (R * T);
}

function lookupCd(mach: number, model: "G1" | "G7"): number {
  const table = model === "G1" ? G1 : G7;
  for (let i = 0; i < table.length - 1; i++) {
    if (mach >= table[i].mach && mach <= table[i + 1].mach) {
      const f =
        (mach - table[i].mach) /
        (table[i + 1].mach - table[i].mach);
      return table[i].cd + f * (table[i + 1].cd - table[i].cd);
    }
  }
  return table[table.length - 1].cd;
}

export function solveTrajectory(
  ammo: AmmoProfile,
  env: Environment,
  rangeM: number,
  windSpeed: number = 0,
  windAngleDeg: number = 90
): {
  tof: number;
  impactVel: number;
  dropM: number;
  driftM: number;
  holdMil: number;
  holdMoa: number;
} {
  const rho = airDensity(env);
  const densityFactor = rho / rho0;

  let x = 0;
  let y = 0;
  let vx = ammo.V0;
  let vy = 0;
  let drift = 0;

  const dt = 0.001; // step in seconds
  let t = 0;

  while (x < rangeM && y >= -10) {
    const v = Math.sqrt(vx * vx + vy * vy);
    const mach = v / 343; // crude speed of sound

    const cd = lookupCd(mach, ammo.model === "G1" ? "G1" : "G7");
    const drag = (densityFactor * v * v * cd) / (2 * ammo.bc);

    // deceleration
    const ax = -(drag * (vx / v));
    const ay = -(g + drag * (vy / v));

    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;
    drift += windSpeed * dt * Math.cos((windAngleDeg * Math.PI) / 180);

    t += dt;
  }

  const dropM = -y;
  const impactVel = Math.sqrt(vx * vx + vy * vy);
  const holdMil = (dropM / rangeM) * 1000;
  const holdMoa = holdMil * 3.438;

  return { tof: t, impactVel, dropM, driftM: drift, holdMil, holdMoa };
}

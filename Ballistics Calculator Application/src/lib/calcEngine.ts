/*
  Point-mass solver with:
   - no-drag closed form
   - G1/G7 using BC + drag function f(v)

  Conventions:
   - SI units internally
   - thetaDeg is the bore/launch angle above horizontal
   - y0 is muzzle height relative to target line (m)
   - rhoUsed = 1.225 for "standard", else user-provided

  Formulas:
   - mil  = (drop / X) * 1000
   - MOA  = (drop / X) * 3438
*/

import { fG1, fG7 } from "./dragTables";
import type { ModelKind } from "./appState";

export type SolveInput = {
  V0: number; thetaDeg: number; X: number; g: number; y0: number;
  model: ModelKind; bcUsed: number | null; rho: number; // kg/m^3
};

export type SolveOutput = {
  modelUsed: ModelKind; tFlight: number; vImpact: number; drop: number; holdMil: number; holdMoa: number;
};

const RHO0 = 1.225;

export function calculate({ V0, thetaDeg, X, g, y0, model, bcUsed, rho }: SolveInput): SolveOutput {
  if (model === "noDrag") {
    return solveNoDrag({ V0, thetaDeg, X, g, y0 });
  }
  if (!bcUsed || bcUsed <= 0) throw new Error("BC required for drag models.");
  const f = (model === "G1") ? fG1 : fG7;
  return solveWithBC({ V0, thetaDeg, X, g, y0, BC: bcUsed, rho, f, model });
}

// ---------- No-drag closed-form ----------
function solveNoDrag({ V0, thetaDeg, X, g, y0 }: { V0: number; thetaDeg: number; X: number; g: number; y0: number; }): SolveOutput {
  const th = (thetaDeg * Math.PI) / 180;
  const vx = V0 * Math.cos(th);
  const vy = V0 * Math.sin(th);
  const t = X / Math.max(vx, 1e-9);
  const y = y0 + vy * t - 0.5 * g * t * t;
  const drop = y; // relative to baseline
  const vImpact = Math.sqrt(vx * vx + (vy - g * t) ** 2);
  const holdMil = (drop / X) * 1000;
  const holdMoa = (drop / X) * 3438;
  return { modelUsed: "noDrag", tFlight: t, vImpact, drop, holdMil, holdMoa };
}

// ---------- BC-based point-mass using G1/G7 f(v) ----------
/*
  Using standard point-mass:
    dv/dt = - g * (rho/rho0) * f(v) / BC
  Split to components proportionally to velocity.
  Integrate with RK4 for stability. dt in seconds.
*/
type DragFunc = (v: number) => number;
function solveWithBC({
  V0, thetaDeg, X, g, y0, BC, rho, f, model,
}: { V0: number; thetaDeg: number; X: number; g: number; y0: number; BC: number; rho: number; f: DragFunc; model: ModelKind; }): SolveOutput {
  const th = (thetaDeg * Math.PI) / 180;
  let x = 0, y = y0;
  let vx = V0 * Math.cos(th);
  let vy = V0 * Math.sin(th);
  let t = 0;
  const densityRatio = rho / RHO0;
  const dt = 0.001;    // 1 ms
  const maxT = 12.0;   // safety

  function acc(vx: number, vy: number) {
    const v = Math.max(1e-8, Math.hypot(vx, vy));
    const dv = -g * densityRatio * (f(v) / BC); // scalar speed decay
    const ax = (dv * vx) / v;
    const ay = -g + (dv * vy) / v;
    return { ax, ay };
  }

  while (x < X && t < maxT) {
    // RK4 for vx, vy, x, y
    const k1 = (() => {
      const { ax, ay } = acc(vx, vy);
      return { ax, ay, vx, vy, xdot: vx, ydot: vy };
    })();

    const k2 = (() => {
      const vxn = vx + k1.ax * dt / 2, vyn = vy + k1.ay * dt / 2;
      const { ax, ay } = acc(vxn, vyn);
      return { ax, ay, vx: vxn, vy: vyn, xdot: vxn, ydot: vyn };
    })();

    const k3 = (() => {
      const vxn = vx + k2.ax * dt / 2, vyn = vy + k2.ay * dt / 2;
      const { ax, ay } = acc(vxn, vyn);
      return { ax, ay, vx: vxn, vy: vyn, xdot: vxn, ydot: vyn };
    })();

    const k4 = (() => {
      const vxn = vx + k3.ax * dt, vyn = vy + k3.ay * dt;
      const { ax, ay } = acc(vxn, vyn);
      return { ax, ay, vx: vxn, vy: vyn, xdot: vxn, ydot: vyn };
    })();

    // integrate
    const axAvg = (k1.ax + 2*k2.ax + 2*k3.ax + k4.ax) / 6;
    const ayAvg = (k1.ay + 2*k2.ay + 2*k3.ay + k4.ay) / 6;
    vx += axAvg * dt;
    vy += ayAvg * dt;

    const xdotAvg = (k1.xdot + 2*k2.xdot + 2*k3.xdot + k4.xdot) / 6;
    const ydotAvg = (k1.ydot + 2*k2.ydot + 2*k3.ydot + k4.ydot) / 6;
    x += xdotAvg * dt;
    y += ydotAvg * dt;

    t += dt;

    if (!isFinite(x + y + vx + vy)) throw new Error("Numerical instability.");
  }

  const drop = y; // relative
  const vImpact = Math.hypot(vx, vy);
  const holdMil = (drop / X) * 1000;
  const holdMoa = (drop / X) * 3438;

  return { modelUsed: model, tFlight: t, vImpact, drop, holdMil, holdMoa };
}

export function solve(calcin: SolveInput): SolveOutput {
  return calculate(calcin);
}
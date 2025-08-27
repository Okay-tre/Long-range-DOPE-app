//! ballistics-pointmass
//!
//! Point-mass trajectory solver with RK4 integration.
//! - Drag comes from a **retardation function** `i(M)` where `M` is Mach.
//! - Scales by air-density ratio and ballistic coefficient (BC).
//! - 3D integration (x forward, y up, z right) with crosswind.
//! - Zero-solve by bisection for a given zero distance & sight height.
//! - Produces per-range rows: TOF, impact velocity, drop, drift, holds (MIL/MOA).
//!
//! Maths (Sierra / McCoy style):
//!   a_drag = -(rho/rho0) * i(M) / BC * v_rel * |v_rel|   (vector opposite air-relative velocity)
//!
//! Conventions:
//! - Wind angle: degrees where 90° = full value from LEFT→RIGHT (i.e., pushes POI RIGHT).
//!   0° = tailwind, 180° = headwind, 270° = RIGHT→LEFT.
//!
//! You can pass any drag function. If you depend on `ballistics-models`,
//! call this crate with `|m| ballistics_models::g7_retardation(m)` etc.

use core::f64::consts::PI;

/// Default sea-level density for scaling (kg/m^3)
const RHO0: f64 = 1.225;
/// Gravity (m/s^2)
const G: f64 = 9.80665;
/// Specific gas constant for dry air (J/(kg·K))
const R_DRY: f64 = 287.05;
/// Specific gas constant for water vapor (J/(kg·K))
const R_VAP: f64 = 461.495;
/// Ratio of specific heats (air)
const GAMMA: f64 = 1.4;

/// Generic drag function type: mach -> i(M) (Sierra retardation)
pub type DragFn = dyn Fn(f64) -> f64 + Send + Sync;

/// Atmosphere inputs (shooter env)
#[derive(Clone, Copy, Debug)]
pub struct Atmos {
    pub temperature_c: f64,   // °C
    pub pressure_hpa: f64,    // hPa
    pub humidity_pct: f64,    // 0..100
    pub altitude_m: f64,      // m (optional; if 0, you’ll still get usable density)
}

impl Atmos {
    pub fn air_density(self) -> f64 {
        // Temp in K
        let t_k = self.temperature_c + 273.15;

        // Saturation vapor pressure (Magnus-Tetens, hPa)
        let es = 6.112 * (17.67 * self.temperature_c / (self.temperature_c + 243.5)).exp();
        let rh = (self.humidity_pct.clamp(0.0, 100.0)) / 100.0;
        let e = rh * es; // actual vapor pressure, hPa

        // Convert to Pa
        let p_pa = self.pressure_hpa * 100.0;
        let e_pa = e * 100.0;
        let pd_pa = (p_pa - e_pa).max(0.0);

        // Virtual temperature accounting for humidity
        // 1/rv = (pd/(R_d*T)) + (e/(R_v*T))  => rho = pd/(R_d*T) + e/(R_v*T)
        let rho = pd_pa / (R_DRY * t_k) + e_pa / (R_VAP * t_k);
        rho
    }

    pub fn speed_of_sound(self) -> f64 {
        let t_k = self.temperature_c + 273.15;
        (GAMMA * R_DRY * t_k).sqrt()
    }
}

/// Inputs for the solver
#[derive(Clone, Debug)]
pub struct Inputs<'a> {
    pub bc: f64,                  // ballistic coefficient (G1 or G7 consistent with your drag fn)
    pub muzzle_velocity: f64,     // m/s
    pub sight_height_cm: f64,     // height over bore (cm)
    pub zero_distance_m: f64,     // zero distance (m)
    pub env: Atmos,               // atmosphere
    pub wind_speed: f64,          // m/s
    pub wind_angle_deg: f64,      // see convention above
    pub dt: f64,                  // integration time step (s) e.g., 0.001..0.003
    pub max_range_m: f64,         // stop when x reaches this
    pub drag_fn: &'a DragFn,      // i(M)
}

/// A row of output sampled at a requested range
#[derive(Clone, Copy, Debug)]
pub struct Row {
    pub range_m: f64,
    pub tof: f64,
    pub impact_velocity: f64,
    pub drop_m: f64,
    pub drift_m: f64,
    pub hold_mil: f64,
    pub hold_moa: f64,
}

/// Top-level API: compute a table at specific ranges (meters).
///
/// Ranges must be strictly increasing and > 0. The solver zeros the rifle for
/// the provided `zero_distance_m` & `sight_height_cm`, then integrates once and
/// interpolates to each requested range.
pub fn solve_table_at_ranges(inputs: &Inputs, ranges_m: &[f64]) -> Vec<Row> {
    assert!(inputs.bc > 0.0);
    assert!(inputs.dt > 0.0);
    if ranges_m.is_empty() {
        return Vec::new();
    }

    // 1) Solve firing angle (theta) such that y(range_zero)=0 (sight height accounted).
    let theta = solve_zero_theta(inputs);

    // 2) Integrate trajectory out to the maximum requested range (or inputs.max_range_m).
    let target_max = ranges_m.iter().cloned().fold(0.0, f64::max).min(inputs.max_range_m);
    let traj = integrate_path(inputs, theta, target_max);

    // 3) For each requested range, pick or interpolate state & produce a Row.
    let mut out = Vec::with_capacity(ranges_m.len());
    for &r in ranges_m {
        if r <= 0.0 { continue; }
        if let Some(s) = sample_at_range(&traj, r) {
            // Drop is -y at that range (because y=0 is line of sight at zero distance)
            let drop_m = -s.y;
            let drift_m = s.z;

            let hold_mil = (drop_m / r) * 1000.0;
            let hold_moa = hold_mil * 3.437746770784939; // 1 mil = 3.437746... MOA

            out.push(Row {
                range_m: r,
                tof: s.t,
                impact_velocity: s.speed,
                drop_m,
                drift_m,
                hold_mil,
                hold_moa,
            });
        }
    }
    out
}

/* ------------------------------- internals ------------------------------- */

#[derive(Clone, Copy, Debug)]
struct State {
    t: f64,          // time (s)
    x: f64, y: f64, z: f64,     // position (m)
    vx: f64, vy: f64, vz: f64,  // velocity (m/s)
    speed: f64,                 // |v| (m/s)
}

// Solve for theta (rad) that yields y=0 at zero distance (line-of-sight), given sight height.
fn solve_zero_theta(inputs: &Inputs) -> f64 {
    // Small-angle search bounds (in radians). Typical zero angles are small.
    let mut lo = -5.0_f64.to_radians();
    let mut hi =  5.0_f64.to_radians();

    let mut f_lo = y_at_zero_range(inputs, lo);
    let mut f_hi = y_at_zero_range(inputs, hi);

    // If both have the same sign, widen bounds quickly (rare).
    let mut tries = 0;
    while f_lo.signum() == f_hi.signum() && tries < 10 {
        lo *= 2.0;
        hi *= 2.0;
        f_lo = y_at_zero_range(inputs, lo);
        f_hi = y_at_zero_range(inputs, hi);
        tries += 1;
    }

    // Bisection
    for _ in 0..40 {
        let mid = 0.5 * (lo + hi);
        let f_mid = y_at_zero_range(inputs, mid);
        if f_mid.abs() < 1e-5 { return mid; }
        if f_mid.signum() == f_lo.signum() {
            lo = mid; f_lo = f_mid;
        } else {
            hi = mid; f_hi = f_mid;
        }
    }
    0.5 * (lo + hi)
}

// Return y(range_zero) for a given theta (shoot angle), with line of sight as y=0.
fn y_at_zero_range(inputs: &Inputs, theta: f64) -> f64 {
    let zero = inputs.zero_distance_m;
    let traj = integrate_path(inputs, theta, zero);
    if let Some(s) = sample_at_range(&traj, zero) {
        // bullet y is measured from bore; the line of sight is above bore by sight_height
        // We want y_line_of_sight(zero)=0 => bullet y(zero) - sight_height = 0
        // Internally we start at y = sight_height (so that y=0 is LoS). See init below.
        s.y
    } else {
        // If we didn't get there, return something large-ish to keep the search going
        1.0
    }
}

fn integrate_path(inputs: &Inputs, theta: f64, max_range: f64) -> Vec<State> {
    let dt = inputs.dt;
    let rho = inputs.env.air_density();
    let rho_ratio = (rho / RHO0).max(0.01);
    let a_sound = inputs.env.speed_of_sound();

    // Wind components (m/s) with our convention: angle=90 => L→R pushes POI to +z (right)
    let wa = inputs.wind_angle_deg.to_radians();
    let wx =  inputs.wind_speed * wa.cos(); // tailwind positive
    let wz =  inputs.wind_speed * wa.sin(); // +z means pushing to the right

    // Initial state: place the *line of sight* on y=0, so start bullet at y = sight height.
    let mut s = State {
        t: 0.0,
        x: 0.0,
        y: inputs.sight_height_cm / 100.0, // meters
        z: 0.0,
        vx: inputs.muzzle_velocity * theta.cos(),
        vy: inputs.muzzle_velocity * theta.sin(),
        vz: 0.0,
        speed: inputs.muzzle_velocity,
    };

    let mut out = Vec::with_capacity((max_range / (inputs.muzzle_velocity * dt)).ceil() as usize + 8);
    out.push(s);

    // Basic RK4 integrator
    while s.x <= max_range && s.speed > 50.0 && s.t < 20.0 {
        // A function giving derivatives (dx/dt, dv/dt)
        let deriv = |st: &State| -> (f64, f64, f64, f64, f64, f64) {
            // Air-relative velocity
            let vrx = st.vx - wx;
            let vry = st.vy;
            let vrz = st.vz - wz;
            let vr = (vrx*vrx + vry*vry + vrz*vrz).sqrt().max(1e-6);
            let mach = vr / a_sound;
            let i_m = (inputs.drag_fn)(mach);

            // Drag factor
            let k = rho_ratio * i_m / inputs.bc;

            // Accelerations
            let ax = -k * vrx * vr;
            let ay = -G - k * vry * vr;
            let az = -k * vrz * vr;

            (st.vx, st.vy, st.vz, ax, ay, az)
        };

        // RK4
        let (k1x, k1y, k1z, k1vx, k1vy, k1vz) = deriv(&s);
        let s2 = State {
            t: s.t + 0.5*dt,
            x: s.x + 0.5*dt*k1x,
            y: s.y + 0.5*dt*k1y,
            z: s.z + 0.5*dt*k1z,
            vx: s.vx + 0.5*dt*k1vx,
            vy: s.vy + 0.5*dt*k1vy,
            vz: s.vz + 0.5*dt*k1vz,
            speed: 0.0,
        };
        let (k2x, k2y, k2z, k2vx, k2vy, k2vz) = deriv(&s2);

        let s3 = State {
            t: s.t + 0.5*dt,
            x: s.x + 0.5*dt*k2x,
            y: s.y + 0.5*dt*k2y,
            z: s.z + 0.5*dt*k2z,
            vx: s.vx + 0.5*dt*k2vx,
            vy: s.vy + 0.5*dt*k2vy,
            vz: s.vz + 0.5*dt*k2vz,
            speed: 0.0,
        };
        let (k3x, k3y, k3z, k3vx, k3vy, k3vz) = deriv(&s3);

        let s4 = State {
            t: s.t + dt,
            x: s.x + dt*k3x,
            y: s.y + dt*k3y,
            z: s.z + dt*k3z,
            vx: s.vx + dt*k3vx,
            vy: s.vy + dt*k3vy,
            vz: s.vz + dt*k3vz,
            speed: 0.0,
        };
        let (k4x, k4y, k4z, k4vx, k4vy, k4vz) = deriv(&s4);

        s.x  += dt/6.0 * (k1x + 2.0*k2x + 2.0*k3x + k4x);
        s.y  += dt/6.0 * (k1y + 2.0*k2y + 2.0*k3y + k4y);
        s.z  += dt/6.0 * (k1z + 2.0*k2z + 2.0*k3z + k4z);
        s.vx += dt/6.0 * (k1vx + 2.0*k2vx + 2.0*k3vx + k4vx);
        s.vy += dt/6.0 * (k1vy + 2.0*k2vy + 2.0*k3vy + k4vy);
        s.vz += dt/6.0 * (k1vz + 2.0*k2vz + 2.0*k3vz + k4vz);
        s.t  += dt;
        s.speed = (s.vx*s.vx + s.vy*s.vy + s.vz*s.vz).sqrt();

        out.push(s);

        // Stop once we pass 2× max_range below the line of sight, as a safety
        if s.y < -50.0 { break; }
    }

    out
}

// Linear interpolation helper: find state at exact range r by segment interpolation.
fn sample_at_range(traj: &[State], r: f64) -> Option<State> {
    if traj.is_empty() || r < traj[0].x { return None; }
    // Find first with x >= r
    let idx = match traj.binary_search_by(|s| s.x.partial_cmp(&r).unwrap()) {
        Ok(i) => i,
        Err(i) => i,
    };
    if idx == 0 { return Some(traj[0]); }
    if idx >= traj.len() { return Some(*traj.last().unwrap()); }
    let a = traj[idx - 1];
    let b = traj[idx];
    let dx = (b.x - a.x).max(1e-9);
    let u = (r - a.x) / dx;

    Some(State {
        t: a.t + u*(b.t - a.t),
        x: r,
        y: a.y + u*(b.y - a.y),
        z: a.z + u*(b.z - a.z),
        vx: a.vx + u*(b.vx - a.vx),
        vy: a.vy + u*(b.vy - a.vy),
        vz: a.vz + u*(b.vz - a.vz),
        speed: a.speed + u*(b.speed - a.speed),
    })
}

/* --------------------------- optional conveniences --------------------------- */

/// Convenience wrapper if you export a G1 retardation function in `ballistics-models`.
#[cfg(feature = "with-models")]
pub fn solve_table_g1(inputs: &Inputs, ranges_m: &[f64]) -> Vec<Row> {
    solve_table_at_ranges(inputs, ranges_m)
}

/// Convenience wrapper if you export a G7 retardation function in `ballistics-models`.
#[cfg(feature = "with-models")]
pub fn solve_table_g7(inputs: &Inputs, ranges_m: &[f64]) -> Vec<Row> {
    solve_table_at_ranges(inputs, ranges_m)
}

/* ----------------------------------- tests ---------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    // Simple toy drag: i(M) = 0.5 for all M (NOT real ballistics).
    fn flat_drag(_: f64) -> f64 { 0.5 }

    #[test]
    fn runs_and_monotonic_x() {
        let env = Atmos { temperature_c: 15.0, pressure_hpa: 1013.0, humidity_pct: 50.0, altitude_m: 0.0 };
        let inputs = Inputs {
            bc: 0.25,
            muzzle_velocity: 800.0,
            sight_height_cm: 3.5,
            zero_distance_m: 100.0,
            env,
            wind_speed: 4.0,
            wind_angle_deg: 90.0,
            dt: 0.002,
            max_range_m: 1200.0,
            drag_fn: &flat_drag,
        };

        let rows = solve_table_at_ranges(&inputs, &[100.0, 300.0, 600.0]);
        assert_eq!(rows.len(), 3);
        assert!(rows[0].range_m < rows[1].range_m && rows[1].range_m < rows[2].range_m);
        // Should produce finite numbers
        for r in rows {
            assert!(r.tof.is_finite());
            assert!(r.impact_velocity.is_finite());
            assert!(r.drop_m.is_finite());
            assert!(r.drift_m.is_finite());
            assert!(r.hold_mil.is_finite());
            assert!(r.hold_moa.is_finite());
        }
    }
}

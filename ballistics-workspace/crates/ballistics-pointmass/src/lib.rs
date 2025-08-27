//! ballistics-pointmass
//!
//! Point-mass trajectory solver with RK4 integration.
//! - Uses a generic drag function `fn(mach) -> i(M)` (Sierra-style retardation).
//! - Scales drag by ballistic coefficient (BC) and air density ratio.
//! - Computes drop, TOF, velocity, angular holds (MIL/MOA), and simple wind drift.
//!
//! NOTE: This crate deliberately avoids tightly coupling to `ballistics-models`.
//! You can pass G1/G7 (or any) drag via a function pointer/closure.
//!
//! Equations (Sierra form):
//! a_drag = - (rho / rho0) * i(M) / BC * v * |v|  (vector, opposes velocity)
//!
//! References:
//! - Sierra Exterior Ballistics Tables (retardation i(M))
//! - McCoy, "Modern Exterior Ballistics"

use std::f64::consts::PI;

/// Public input describing ambient environment.
#[derive(Clone, Copy, Debug)]
pub struct Environment {
    /// Air temperature [°C]
    pub temperature_c: f64,
    /// Station pressure [hPa]
    pub pressure_hpa: f64,
    /// Relative humidity [%]
    pub humidity_pct: f64,
    /// Geometric altitude [m] (used only if you prefer to supply it)
    pub altitude_m: f64,
}

/// Result row for one range step.
#[derive(Clone, Copy, Debug)]
pub struct TrajectoryPoint {
    pub range_m: f64,
    pub time_s: f64,
    pub velocity_ms: f64,
    pub drop_m: f64,
    pub hold_mil: f64,
    pub hold_moa: f64,
    pub wind_drift_m: f64,
}

/// Bullet & shot setup.
#[derive(Clone, Copy, Debug)]
pub struct Bullet {
    /// Ballistic coefficient referenced to the drag curve you pass (e.g., G7 BC).
    pub bc: f64,
    /// Bullet diameter [m] – used only for Mach calc if you provide speed of sound; otherwise optional.
    pub diameter_m: f64,
    /// Muzzle velocity [m/s]
    pub muzzle_velocity_ms: f64,
    /// Sight/optic height over bore [m]
    pub sight_height_m: f64,
    /// Zero distance [m]
    pub zero_distance_m: f64,
}

/// Wind model (simple constant crosswind).
#[derive(Clone, Copy, Debug)]
pub struct Wind {
    /// Speed [m/s]
    pub speed_ms: f64,
    /// Direction *from* which wind blows, degrees CW from North.
    /// For drift we only need full-value component ⟂ to bullet flight;
    /// you can pass already-resolved cross value via `cross_ms` if you prefer.
    pub direction_from_deg: f64,
    /// Optional override: crosswind component [m/s] (positive = L->R).
    pub cross_ms: Option<f64>,
}

/// How to step/integrate.
#[derive(Clone, Copy, Debug)]
pub struct SolverOptions {
    /// Horizontal step size [m] (range axis). 0.5–2.0 m is typical.
    pub step_m: f64,
    /// Maximum range [m] to integrate to.
    pub max_range_m: f64,
}

/// Speed of sound from ambient (approx). Returns [m/s].
fn speed_of_sound_ms(temperature_c: f64) -> f64 {
    // ISO 6344-ish dry-air approx: a = 331.3 + 0.606*T(C)
    331.3 + 0.606 * temperature_c
}

/// Air density [kg/m^3] from T (°C), pressure (hPa), humidity (%).
/// Simple approximation good for ballistics work.
fn air_density_kgm3(temp_c: f64, pressure_hpa: f64, rh_pct: f64) -> f64 {
    let t_k = temp_c + 273.15;
    let p_pa = pressure_hpa * 100.0;

    // Saturation vapor pressure over water (Tetens) [Pa]
    let es = 6_107.8 * 10f64.powf((7.5 * temp_c) / (temp_c + 237.3));
    let e = (rh_pct.clamp(0.0, 100.0) / 100.0) * es;

    // Partial pressures
    let pd = p_pa - e; // dry air partial pressure

    // Specific gas constants
    let rd = 287.058; // dry air
    let rv = 461.495; // water vapor

    (pd / (rd * t_k)) + (e / (rv * t_k))
}

/// Convert linear offset to angular hold.
/// MIL = (offset / range) * 1000.
/// MOA = (offset / range) * 3437.74677 (true MOA).
fn holds_from_drop(range_m: f64, drop_m: f64) -> (f64, f64) {
    if range_m <= 0.0 {
        return (0.0, 0.0);
    }
    let mil = (drop_m / range_m) * 1000.0;
    let moa = (drop_m / range_m) * 3437.746770784939;
    (mil, moa)
}

/// Main API.
///
/// `drag_fn`: function/closure giving Sierra-style *retardation* i(M) for a given Mach.
///            For G1/G7 you’ll pass the appropriate curve interpolator from `ballistics-models`.
///
/// Returns a vector of trajectory points at each horizontal step (0..=max_range_m).
pub fn solve_point_mass(
    env: Environment,
    wind: Wind,
    bullet: Bullet,
    opts: SolverOptions,
    mut drag_fn: impl FnMut(f64) -> f64,
) -> Vec<TrajectoryPoint> {
    assert!(bullet.bc > 0.0, "BC must be > 0");
    assert!(opts.step_m > 0.0, "step_m must be > 0");
    assert!(opts.max_range_m > 0.0, "max_range_m must be > 0");

    // Constants
    let g = 9.80665_f64;
    let rho0 = 1.225_f64; // reference density at sea level [kg/m^3]
    let rho = air_density_kgm3(env.temperature_c, env.pressure_hpa, env.humidity_pct);
    let sigma = (rho / rho0).clamp(0.4, 1.6); // density ratio (guardrails)
    let a = speed_of_sound_ms(env.temperature_c);

    // Initial conditions at muzzle. Set bore line as y=0; sight above bore positive.
    // We'll integrate in x (range) using small steps and RK4 in "time" synthesized from dx/vx.
    let mut x = 0.0_f64;
    let mut y = bullet.sight_height_m; // line of sight at y=0; bore is below by sight height.
    let mut vx = bullet.muzzle_velocity_ms; // assume fired exactly along LOS horizontally (small-angle approx)
    let mut vy = 0.0_f64;
    let mut t = 0.0_f64;

    // Wind cross component (L->R positive). We use simple model: drift ≈ cross * TOF.
    // More sophisticated models use apparent wind and yaw—kept simple here.
    let cross_ms = wind
        .cross_ms
        .unwrap_or_else(|| cross_from_dir(wind.speed_ms, wind.direction_from_deg));

    let mut out = Vec::new();
    out.push(point_from_state(
        0.0, t, vx, vy, y, bullet, cross_ms,
    ));

    let step = opts.step_m;
    let max_x = opts.max_range_m;

    // Integrate until max range
    while x < max_x {
        // compute speed & Mach
        let v = (vx * vx + vy * vy).sqrt().max(1e-6);
        let mach = v / a;

        // Retardation i(M)
        let i_m = drag_fn(mach).max(0.0);

        // Drag acceleration magnitude factor (Sierra): k = sigma * i(M) / BC
        let k = sigma * i_m / bullet.bc;

        // Acceleration components: a_drag = -k * v * (vx,vy) ; a_gravity = -g in y
        let ax = -k * v * vx;
        let ay = -g - k * v * vy;

        // Time step corresponding to dx step: dt = dx / vx (guard for low vx)
        let dt = (step / vx.max(0.1)).clamp(1e-5, 0.1);

        // RK4 integrate in time
        let (nx, ny, nvx, nvy) = rk4_step(x, y, vx, vy, dt, |_, _, vx0, vy0| {
            let v0 = (vx0 * vx0 + vy0 * vy0).sqrt().max(1e-6);
            let mach0 = v0 / a;
            let i0 = drag_fn(mach0).max(0.0);
            let k0 = sigma * i0 / bullet.bc;
            let ax0 = -k0 * v0 * vx0;
            let ay0 = -g - k0 * v0 * vy0;
            (vx0, vy0, ax0, ay0)
        });

        x = nx;
        y = ny;
        vx = nvx;
        vy = nvy;
        t += dt;

        if x >= max_x {
            break;
        }

        // Save point at each ~step in range (use x for range)
        if (out.last().map(|p| p.range_m).unwrap_or(0.0) + step) <= x + 1e-9 {
            out.push(point_from_state(x, t, vx, vy, y, bullet, cross_ms));
        }

        // Stop if the projectile is "crashing" (very low speed)
        if (vx * vx + vy * vy).sqrt() < 50.0 {
            out.push(point_from_state(x, t, vx, vy, y, bullet, cross_ms));
            break;
        }
    }

    // Convert physical drop to “relative to LOS @ zero” by subtracting LOS offset so that
    // drop = 0 near the zero distance (simple linear LOS). For now we use a conventional
    // approach: shift vertical so that point at `zero_distance_m` has zero drop.
    if bullet.zero_distance_m > 0.0 {
        // Find nearest point to zero distance
        let mut idx = 0usize;
        let mut best_dx = f64::INFINITY;
        for (i, p) in out.iter().enumerate() {
            let d = (p.range_m - bullet.zero_distance_m).abs();
            if d < best_dx {
                best_dx = d;
                idx = i;
            }
        }
        if idx < out.len() {
            let y_at_zero = out[idx].drop_m; // current "drop" field is still raw y; we will repurpose next
            // Recompute with zero shift
            for p in &mut out {
                // drop is LOS offset; here we want (y - y_at_zero)
                let new_drop = p.drop_m - y_at_zero;
                let (mil, moa) = holds_from_drop(p.range_m, -new_drop);
                *p = TrajectoryPoint {
                    drop_m: new_drop,
                    hold_mil: mil,
                    hold_moa: moa,
                    ..*p
                };
            }
        }
    } else {
        // Convert raw y->drop holds even without zero shift
        for p in &mut out {
            let (mil, moa) = holds_from_drop(p.range_m, -p.drop_m);
            *p = TrajectoryPoint { hold_mil: mil, hold_moa: moa, ..*p };
        }
    }

    out
}

/// Single RK4 step helper.
/// The derivative function returns (dx/dt, dy/dt, dvx/dt, dvy/dt).
fn rk4_step<F>(
    x: f64,
    y: f64,
    vx: f64,
    vy: f64,
    dt: f64,
    mut deriv: F,
) -> (f64, f64, f64, f64)
where
    F: FnMut(f64, f64, f64, f64) -> (f64, f64, f64, f64),
{
    let (k1x, k1y, k1vx, k1vy) = deriv(x, y, vx, vy);

    let (k2x, k2y, k2vx, k2vy) = deriv(
        x + 0.5 * dt * k1x,
        y + 0.5 * dt * k1y,
        vx + 0.5 * dt * k1vx,
        vy + 0.5 * dt * k1vy,
    );

    let (k3x, k3y, k3vx, k3vy) = deriv(
        x + 0.5 * dt * k2x,
        y + 0.5 * dt * k2y,
        vx + 0.5 * dt * k2vx,
        vy + 0.5 * dt * k2vy,
    );

    let (k4x, k4y, k4vx, k4vy) =
        deriv(x + dt * k3x, y + dt * k3y, vx + dt * k3vx, vy + dt * k3vy);

    let nx = x + (dt / 6.0) * (k1x + 2.0 * k2x + 2.0 * k3x + k4x);
    let ny = y + (dt / 6.0) * (k1y + 2.0 * k2y + 2.0 * k3y + k4y);
    let nvx = vx + (dt / 6.0) * (k1vx + 2.0 * k2vx + 2.0 * k3vx + k4vx);
    let nvy = vy + (dt / 6.0) * (k1vy + 2.0 * k2vy + 2.0 * k3vy + k4vy);

    (nx, ny, nvx, nvy)
}

/// Produce a `TrajectoryPoint` snapshot from the current state.
fn point_from_state(
    x: f64,
    t: f64,
    vx: f64,
    vy: f64,
    y: f64,
    bullet: Bullet,
    cross_ms: f64,
) -> TrajectoryPoint {
    let v = (vx * vx + vy * vy).sqrt();
    // Simple drift ≈ crosswind * TOF (full-value). Sign: positive drift to the right.
    let drift = cross_ms * t;

    // Temporarily set holds from raw drop (we may re-zero later).
    let (mil, moa) = holds_from_drop(x, -y);

    TrajectoryPoint {
        range_m: x,
        time_s: t,
        velocity_ms: v,
        drop_m: y,
        hold_mil: mil,
        hold_moa: moa,
        wind_drift_m: drift,
    }
}

/// Resolve crosswind (positive rightward) from a meteorological "from" direction.
/// For simplicity we assume firing along +X and North = +Y; East = +X.
/// Wind blowing from `dir` means flow vector points to `dir + 180`.
fn cross_from_dir(speed_ms: f64, from_deg: f64) -> f64 {
    let dir_to_deg = (from_deg + 180.0) % 360.0;
    let rad = dir_to_deg.to_radians();
    let vx = speed_ms * rad.cos(); // along +X (downrange)
    let vy = speed_ms * rad.sin(); // +Y (left)
    // Cross component is vy (left positive). We define L->R positive, so negate:
    -vy
}

#[cfg(test)]
mod tests {
    use super::*;

    // Toy G7-ish flat curve just to prove compilation and behavior.
    fn fake_g7_i(mach: f64) -> f64 {
        // Not real data: monotonic shape that increases with Mach
        let m = mach.max(0.05);
        0.5 + 0.4 * (m - 1.0).abs()
    }

    #[test]
    fn basic_run() {
        let env = Environment {
            temperature_c: 15.0,
            pressure_hpa: 1013.0,
            humidity_pct: 50.0,
            altitude_m: 0.0,
        };

        let bullet = Bullet {
            bc: 0.25,
            diameter_m: 0.00782, // 0.308"
            muzzle_velocity_ms: 800.0,
            sight_height_m: 0.035,
            zero_distance_m: 100.0,
        };

        let wind = Wind {
            speed_ms: 0.0,
            direction_from_deg: 0.0,
            cross_ms: None,
        };

        let opts = SolverOptions {
            step_m: 1.0,
            max_range_m: 600.0,
        };

        let traj = solve_point_mass(env, wind, bullet, opts, fake_g7_i);
        assert!(!traj.is_empty());
        assert!(traj.last().unwrap().range_m >= 500.0);
    }
}

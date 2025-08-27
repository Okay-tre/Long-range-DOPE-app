use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

/// Optional: nicer panic messages in the browser console.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(start)]
pub fn wasm_start() {
    console_error_panic_hook::set_once();
}

const G0: f64 = 9.806_65;          // m/s²
const RHO0: f64 = 1.225_0;         // kg/m³, ISA sea-level reference

// ---------- Input/Output types passed as JSON ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub temperature_c: f64,  // °C
    pub pressure_hpa:  f64,  // hPa
    pub humidity_pct:  f64,  // %
    pub altitude_m:    f64,  // m (optional in calc; used for display only here)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveInput {
    /// "G1", "G7", or "noDrag"
    pub model: String,
    /// Ballistic coefficient (same family as model), e.g. G7 BC
    pub bc: f64,
    /// Muzzle velocity (m/s)
    pub v0: f64,
    /// Zero range (m). Only used to compute “hold” presentation.
    pub zero_distance_m: f64,
    /// Height over bore (mm)
    pub scope_height_mm: f64,
    /// Wind speed (m/s), 90° = full-value left→right by convention
    pub wind_speed_ms: f64,
    /// Wind direction (deg, 0..360). 90° = left→right; 270° = right→left.
    pub wind_angle_deg: f64,
    /// Ranges (m) for which you want outputs
    pub ranges_m: Vec<f64>,
    /// Environment
    pub env: Environment,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveRow {
    pub range_m: f64,
    pub tof_s: f64,
    pub impact_vel_ms: f64,
    pub drop_m: f64,
    pub hold_mil: f64,
    pub hold_moa: f64,
    pub drift_m: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveOutput {
    pub rows: Vec<SolveRow>,
    /// Air density used (kg/m³) — handy for UI/debug
    pub rho_used: f64,
}

// ---------- Tiny atmos helpers (ISA-ish, sufficient for ballistics) ----------

fn air_density_kg_m3(temp_c: f64, pressure_hpa: f64, humidity_pct: f64) -> f64 {
    // Very light-weight density estimation:
    // Convert to Kelvin and Pa, subtract water vapor partial pressure by RH
    let t_k = temp_c + 273.15;
    let p_pa = pressure_hpa * 100.0;

    // Saturation vapor pressure over water (Tetens)
    let es = 610.94 * f64::exp((17.625 * temp_c) / (temp_c + 243.04));
    let e = (humidity_pct.clamp(0.0, 100.0) / 100.0) * es;

    let pd = p_pa - e; // dry air partial pressure
    // Gas constants
    let rd = 287.058;  // dry air
    let rv = 461.495;  // water vapor

    (pd / (rd * t_k)) + (e / (rv * t_k))
}

// ---------- Drag models (retardation i(M)) via ballistics-models ----------

fn i_of_mach(model: &str, mach: f64) -> f64 {
    // Match strings tolerant to case
    let m = model.to_ascii_uppercase();
    if m == "G1" {
        ballistics_models::g1::i_from_mach(mach)
    } else if m == "G7" {
        ballistics_models::g7::i_from_mach(mach)
    } else {
        // noDrag — return zero (no retardation)
        0.0
    }
}

// ---------- Minimal point-mass RK4 integrator (self-contained) ----------
// State vector: position (x,y) and velocity (vx, vy). x forward, y up.
// Positive y is up. Gravity is -G0 on y.
// Drag acceleration: a_drag = - (rho/RHO0) * i(M) / BC * v * |v|
#[derive(Copy, Clone)]
struct State {
    x: f64,
    y: f64,
    vx: f64,
    vy: f64,
}

fn rk4_step<F>(s: State, dt: f64, mut accel: F) -> State
where
    F: FnMut(State) -> (f64, f64),
{
    let (ax1, ay1) = accel(s);
    let k1 = State { x: s.vx, y: s.vy, vx: ax1, vy: ay1 };

    let s2 = State {
        x: s.x + 0.5 * dt * k1.x,
        y: s.y + 0.5 * dt * k1.y,
        vx: s.vx + 0.5 * dt * k1.vx,
        vy: s.vy + 0.5 * dt * k1.vy,
    };
    let (ax2, ay2) = accel(s2);
    let k2 = State { x: s2.vx, y: s2.vy, vx: ax2, vy: ay2 };

    let s3 = State {
        x: s.x + 0.5 * dt * k2.x,
        y: s.y + 0.5 * dt * k2.y,
        vx: s.vx + 0.5 * dt * k2.vx,
        vy: s.vy + 0.5 * dt * k2.vy,
    };
    let (ax3, ay3) = accel(s3);
    let k3 = State { x: s3.vx, y: s3.vy, vx: ax3, vy: ay3 };

    let s4 = State {
        x: s.x + dt * k3.x,
        y: s.y + dt * k3.y,
        vx: s.vx + dt * k3.vx,
        vy: s.vy + dt * k3.vy,
    };
    let (ax4, ay4) = accel(s4);
    let k4 = State { x: s4.vx, y: s4.vy, vx: ax4, vy: ay4 };

    State {
        x: s.x + (dt / 6.0) * (k1.x + 2.0 * k2.x + 2.0 * k3.x + k4.x),
        y: s.y + (dt / 6.0) * (k1.y + 2.0 * k2.y + 2.0 * k3.y + k4.y),
        vx: s.vx + (dt / 6.0) * (k1.vx + 2.0 * k2.vx + 2.0 * k3.vx + k4.vx),
        vy: s.vy + (dt / 6.0) * (k1.vy + 2.0 * k2.vy + 2.0 * k3.vy + k4.vy),
    }
}

fn integrate_to_range(
    model: &str,
    bc: f64,
    v0: f64,
    rho: f64,
    target_x: f64,
    dt: f64,
) -> (f64, f64, f64) {
    // Start slightly above bore line by sight height if you want to include that in solver;
    // here we integrate purely ballistic path (bore-aligned), and will express holds later.
    let mut s = State { x: 0.0, y: 0.0, vx: v0, vy: 0.0 };
    let mut t = 0.0;

    let accel = |st: State| {
        let v = (st.vx * st.vx + st.vy * st.vy).sqrt();
        let mach = v / 340.0_f64; // crude speed of sound; adequate for ret function mapping
        let i_m = i_of_mach(model, mach);
        let drag_mag = (rho / RHO0) * i_m / bc * v; // multiply by |v| later with components

        // Drag direction opposes velocity vector
        let (ax_drag, ay_drag) = if v > 1e-9 {
            let ux = st.vx / v;
            let uy = st.vy / v;
            (-drag_mag * st.vx, -drag_mag * st.vy) // i(M)/BC * v * (vx, vy)
        } else {
            (0.0, 0.0)
        };

        let ax = ax_drag;
        let ay = -G0 + ay_drag;

        (ax, ay)
    };

    while s.x < target_x && t < 20.0 {
        s = rk4_step(s, dt, accel);
        t += dt;
    }

    let v = (s.vx * s.vx + s.vy * s.vy).sqrt();
    (t, v, s.y) // time, impact speed, height at target range
}

// ---------- Public WASM entrypoint ----------

#[wasm_bindgen]
pub fn solve_point_mass_json(input_json: &str) -> String {
    let parsed: SolveInput = match serde_json::from_str(input_json) {
        Ok(v) => v,
        Err(e) => {
            return serde_json::json!({
                "error": format!("Invalid input JSON: {}", e),
            })
            .to_string()
        }
    };

    let rho = air_density_kg_m3(
        parsed.env.temperature_c,
        parsed.env.pressure_hpa,
        parsed.env.humidity_pct,
    );

    // Wind: convert to lateral drift assuming constant crosswind component.
    // Crosswind (m/s) = wind_speed * sin(angle_from_bullet_path)
    let theta = parsed.wind_angle_deg.to_radians();
    let crosswind = parsed.wind_speed_ms * theta.sin();

    // Precompute zero-related sight geometry to express "hold".
    let y0_m = parsed.scope_height_mm / 1000.0;
    let zero_m = if parsed.zero_distance_m > 0.0 {
        parsed.zero_distance_m
    } else {
        100.0
    };

    // Small step size — stable and fast for point-mass
    let dt = 0.0015;

    let mut out_rows = Vec::with_capacity(parsed.ranges_m.len());

    for &rng in &parsed.ranges_m {
        let range = rng.max(1.0);
        let (tof, v_impact, y_at_range) =
            integrate_to_range(&parsed.model, parsed.bc, parsed.v0, rho, range, dt);

        // Vertical drop relative to bore line:
        let drop_m = -y_at_range;

        // Express "hold" so POI coincides with LOS (include sight height and zero).
        // We’ll compute the relative vertical offset between (range) and (zero).
        let (_, _, y_at_zero) =
            integrate_to_range(&parsed.model, parsed.bc, parsed.v0, rho, zero_m, dt);

        // LOS is y = y0 at muzzle and goes straight to zero point; the angular correction for range
        // in MIL/MOA can be approximated by:
        // hold (radians) ≈ ( (y_at_range - y0_line_at_range) - (y_at_zero - y0_line_at_zero) ) / range
        // With LOS straight and going through (zero_m, y0_m), y0_line_at_r = y0_m.
        let rel_m = (y_at_range - y0_m) - (y_at_zero - y0_m);
        let hold_rad = -rel_m / range; // negative means dial up (U)

        let hold_mil = hold_rad * 1000.0;
        let hold_moa = hold_rad * (180.0 / std::f64::consts::PI) * 60.0;

        // Lateral drift from constant crosswind:
        // very simple: drift = crosswind * TOF (full-value). For angles, we already took sin().
        let drift_m = crosswind * tof;

        out_rows.push(SolveRow {
            range_m: range,
            tof_s: tof,
            impact_vel_ms: v_impact,
            drop_m,
            hold_mil,
            hold_moa,
            drift_m,
        });
    }

    let out = SolveOutput {
        rows: out_rows,
        rho_used: rho,
    };

    serde_json::to_string(&out).unwrap_or_else(|e| {
        serde_json::json!({
            "error": format!("Failed to encode output: {}", e),
        })
        .to_string()
    })
}

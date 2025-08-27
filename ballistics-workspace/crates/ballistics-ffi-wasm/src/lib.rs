// crates/ballistics-ffi-wasm/src/lib.rs
//
// WASM bindings: point-mass + 6DoF exports.

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen as swb;

// --- our crates ---
use ballistics_models::{g1_retardation, g7_retardation};
use ballistics_pointmass as pm;
use ballistics_6dof::{
    integrate_6dof, initial_state_from_muzzle, projectile_cylindrical, DefaultAeroApprox,
    IntegrateOpts,
};
use ballistics_core::{Atmosphere, Environment, Gravity, Vec3};

// Better panic messages in browser console
#[wasm_bindgen(start)]
pub fn wasm_start() {
    console_error_panic_hook::set_once();
}

/* --------------------------- Shared DTOs (JS) --------------------------- */

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct JsEnvironment {
    pub temperature_c: f64,
    pub pressure_hpa: f64,
    pub humidity_pct: f64,
    pub altitude_m: f64,
}
impl From<JsEnvironment> for Environment {
    fn from(e: JsEnvironment) -> Self {
        Environment {
            temperature_c: e.temperature_c,
            pressure_hpa: e.pressure_hpa,
            humidity_pct: e.humidity_pct,
            altitude_m: e.altitude_m,
        }
    }
}

/* ----------------------------- Point-mass ------------------------------ */

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsPointMassInput {
    pub env: JsEnvironment,
    pub bc: f64,
    pub muzzle_velocity_ms: f64,
    pub zero_m: f64,
    pub ranges_m: Vec<f64>,
    pub wind_speed_ms: f64,
    pub wind_angle_deg: f64,
    /// "G1" | "G7" (defaults to G7 if unknown)
    pub drag_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsPointMassRow {
    pub range_m: f64,
    pub tof_s: f64,
    pub impact_vel_ms: f64,
    pub drop_m: f64,
    pub hold_mil: f64,
    pub hold_moa: f64,
    pub drift_m: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsPointMassResult {
    pub rows: Vec<JsPointMassRow>,
}

fn select_drag(model: &str) -> &'static pm::DragFn {
    match model.to_uppercase().as_str() {
        "G1" => &g1_retardation,
        "G7" => &g7_retardation,
        _ => &g7_retardation,
    }
}

#[wasm_bindgen]
pub fn solve_point_mass_js(input: JsValue) -> Result<JsValue, JsValue> {
    let inp: JsPointMassInput = swb::from_value(input)?;

    if inp.ranges_m.is_empty() {
        return Err(JsValue::from_str("ranges_m must not be empty"));
    }

    // point-mass Atmos is defined inside the pm crate
    let env_pm = pm::Atmos {
        temperature_c: inp.env.temperature_c,
        pressure_hpa:  inp.env.pressure_hpa,
        humidity_pct:  inp.env.humidity_pct,
        altitude_m:    inp.env.altitude_m,
    };

    let ranges = inp.ranges_m.clone();
    let max_range = ranges.iter().cloned().fold(0.0, f64::max) + 50.0;

    let drag: &'static pm::DragFn = select_drag(&inp.drag_model);

    let inputs = pm::Inputs {
        bc: inp.bc,
        muzzle_velocity: inp.muzzle_velocity_ms,
        sight_height_cm: 3.5,          // default (can surface to JS later)
        zero_distance_m: inp.zero_m,
        env: env_pm,
        wind_speed: inp.wind_speed_ms,
        wind_angle_deg: inp.wind_angle_deg,
        dt: 0.002,                     // default integ step
        max_range_m: max_range,
        drag_fn: drag,
    };

    let rows = pm::solve_table_at_ranges(&inputs, &ranges);

    let out = JsPointMassResult {
        rows: rows
            .into_iter()
            .map(|r| JsPointMassRow {
                range_m: r.range_m,
                tof_s: r.tof,
                impact_vel_ms: r.impact_velocity,
                drop_m: r.drop_m,
                hold_mil: r.hold_mil,
                hold_moa: r.hold_moa,
                drift_m: r.drift_m,
            })
            .collect(),
    };

    swb::to_value(&out).map_err(|e| e.into())
}

/* -------------------------------- 6DoF --------------------------------- */

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct JsSixProjectile {
    pub mass_kg: f64,
    pub diameter_m: f64,
    pub length_m: f64,
    /// Spin rate about body x [rev/s]
    pub spin_rps: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct JsSixInit {
    pub muzzle_x: f64,
    pub muzzle_y: f64,
    pub muzzle_z: f64,
    pub muzzle_speed_ms: f64,
    pub bore_elev_deg: f64,
    pub bore_azim_deg: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct JsSixOpts {
    pub dt_s: f64,
    pub max_time_s: f64,
    pub max_steps: u32,
    pub ground_z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsSixSample {
    pub t: f64,
    pub x: f64, pub y: f64, pub z: f64,
    pub vx: f64, pub vy: f64, pub vz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsSixResult {
    pub samples: Vec<JsSixSample>,
}

/// Integrate 6DoF with the built-in `DefaultAeroApprox`.
#[wasm_bindgen]
pub fn integrate_6dof_default(
    env_js: JsValue,
    proj_js: JsValue,
    init_js: JsValue,
    opts_js: JsValue,
) -> Result<JsValue, JsValue> {
    let env_in: JsEnvironment   = swb::from_value(env_js)?;
    let proj_in: JsSixProjectile = swb::from_value(proj_js)?;
    let init_in: JsSixInit       = swb::from_value(init_js)?;
    let opts_in: JsSixOpts       = swb::from_value(opts_js)?;

    let env: Environment = env_in.into();
    let atmos = Atmosphere::standard();
    let gravity = Gravity { g: -9.80665 };

    let proj = projectile_cylindrical(
        proj_in.mass_kg,
        proj_in.diameter_m,
        proj_in.length_m,
        proj_in.spin_rps * (2.0 * std::f64::consts::PI), // rps -> rad/s
    );

    let init = initial_state_from_muzzle(
        Vec3 { x: init_in.muzzle_x, y: init_in.muzzle_y, z: init_in.muzzle_z },
        init_in.muzzle_speed_ms,
        init_in.bore_elev_deg.to_radians(),
        init_in.bore_azim_deg.to_radians(),
        proj.spin_rad_s,
    );

    let opts = IntegrateOpts {
        dt: opts_in.dt_s,
        max_time: opts_in.max_time_s,
        max_steps: opts_in.max_steps as usize,
        ground_z: opts_in.ground_z,
    };

    let aero = DefaultAeroApprox;
    let traj = integrate_6dof(proj, env, gravity, atmos, &aero, init, opts);

    let samples: Vec<JsSixSample> = traj
        .into_iter()
        .map(|s| JsSixSample {
            t: s.t,
            x: s.state.r.x, y: s.state.r.y, z: s.state.r.z,
            vx: s.state.v.x, vy: s.state.v.y, vz: s.state.v.z,
        })
        .collect();

    swb::to_value(&JsSixResult { samples }).map_err(|e| e.into())
}

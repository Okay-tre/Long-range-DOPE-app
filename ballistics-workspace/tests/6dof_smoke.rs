#[test]
fn integrates_basic_case() {
    use super::*;

    // Environment/gravity/atmosphere (whatever you used earlier in this file).
    let env = Environment {
        temperature_c: 15.0,
        pressure_hpa: 1013.0,
        humidity_pct: 50.0,
    };
    let atmos   = Atmosphere { lapse_rate: 0.0065, sea_level_temp_k: 288.15, sea_level_pressure_pa: 101325.0 };
    let gravity = Gravity { g: -9.80665 };

    // Simple rifle-ish projectile
    let proj = projectile_cylindrical(
        0.0095,   // mass kg (~147 gr)
        0.00782,  // diameter m (0.308")
        0.038,    // length m (~38 mm)
        3000.0,   // spin rad/s
    );

    // IMPORTANT: either start above ground...
    let muzzle_pos = Vec3 { x: 0.0, y: 0.0, z: 1.0 };
    // ...or give a small elevation so it climbs initially.
    let bore_elev_deg  = 1.0;
    let bore_azim_deg  = 0.0;
    let muzzle_speed   = 800.0;

    let init = initial_state_from_muzzle(
        muzzle_pos,
        muzzle_speed,
        bore_elev_deg.to_radians(),
        bore_azim_deg.to_radians(),
        proj.spin_rad_s,
    );

    // OPTIONS: ensure we actually advance at least one step.
    let opts = IntegrateOpts {
        dt:        0.01,  // 10 ms
        max_time:  0.5,   // > dt so we get multiple steps
        max_steps: 1000,  // >> 2, definitely integrates
        ground_z:  0.0,   // ground at z=0; we started at z=1
    };

    let aero = DefaultAeroApprox;
    let samples = integrate_6dof(proj, env, gravity, atmos, &aero, init, opts);

    // Basic sanity checks
    assert!(samples.len() >= 2, "need at least two samples to advance in time");
    assert!(samples.last().unwrap().state.r.x > 0.0, "x should advance downrange");
    assert!(samples.iter().all(|s| s.qbar.is_finite()));
}

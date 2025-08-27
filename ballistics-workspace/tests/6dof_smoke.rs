// Simple end-to-end test: integrate 6DoF with the default aero model.
// Asserts we get multiple samples, bullet travels forward, and eventually hits ground.

use ballistics_core::{Atmosphere, Environment, Gravity, Vec3};
use ballistics_6dof::{
    integrate_6dof, initial_state_from_muzzle, projectile_cylindrical, DefaultAeroApprox,
    IntegrateOpts,
};

#[test]
fn six_dof_runs_and_hits_ground() {
    // Environment & gravity
    let env = Environment {
        temperature_c: 15.0,
        pressure_hpa: 1013.0,
        humidity_pct: 50.0,
        altitude_m: 0.0,
    };
    let atmos = Atmosphere::standard(); // from core
    let gravity = Gravity { g: -9.80665 };

    // Simple 7.62mm-class projectile
    let proj = projectile_cylindrical(
        0.0095,   // mass kg (≈147 gr)
        0.00782,  // diameter m (7.62 mm)
        0.028,    // length m (approx)
        3000.0,   // spin rad/s (rough order)
    );

    // Initial state: muzzle at z=1.0 m, 820 m/s muzzle, small elevation
    let init = initial_state_from_muzzle(
        Vec3 { x: 0.0, y: 0.0, z: 1.0 },
        820.0,
        2.0_f64.to_radians(),   // 2° up
        0.0_f64.to_radians(),   // facing +x
        proj.spin_rad_s,
    );

    let opts = IntegrateOpts {
        dt: 0.0015,
        max_time: 3.0,
        max_steps: 2_000_000,
        ground_z: 0.0,
    };

    let aero = DefaultAeroApprox;

    let traj = integrate_6dof(proj, env, gravity, atmos, &aero, init, opts);

    assert!(traj.len() > 10, "trajectory should have multiple samples");

    // Moves forward in +x
    let first_x = traj.first().unwrap().state.r.x;
    let last_x = traj.last().unwrap().state.r.x;
    assert!(last_x > first_x, "x should increase (downrange)");

    // Should hit/approach ground by end (z near/below 0)
    let last_z = traj.last().unwrap().state.r.z;
    assert!(last_z <= 0.05, "z should be at or very near ground by end, got {}", last_z);
}

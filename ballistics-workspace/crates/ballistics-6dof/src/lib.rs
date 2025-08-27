//! ballistics-6dof
//!
//! Rigid-body 6DoF bullet solver with quaternion attitude, body rates, and
//! aerodynamic forces & moments. RK4 integrator. Designed to work out-of-the-box
//! via a default aero approximation, **and** accept bullet-specific aero tables
//! by implementing the `AeroModel` trait.
//!
//! State vector (13):
//!   r = (x,y,z) inertial position [m]
//!   v = (vx,vy,vz) inertial velocity [m/s]
//!   q = (qw,qx,qy,qz) orientation (body->inertial), unit quaternion
//!   ω = (p,q,r) body angular rates [rad/s]
//!
//! Conventions:
//! - Inertial frame: x forward (downrange), y right (east-ish), z up (positive up).
//! - Body frame: x along bore (nose->tail), y right wing, z down (aero convention).
//!   (We adopt +z_body down to match many aero sign conventions; lift up is -z_body).
//!
//! Forces & moments (body frame):
//!   F = q̄ S [ -C_D x̂ + C_Lα * α (-ẑ) + C_Mag * (ω×v_rel) ... ]   (simplified set)
//!   M = q̄ S D [ C_mα * α (pitch/yaw) + C_mq * (qD/2V) damping + C_spin_damp * p ... ]
//!
//! Atmosphere via ballistics-core, with density ρ from T, p, RH (or ratio).
//!
//! NOTE: This file is **complete** and compiles. You can run with `DefaultAeroApprox`
//! immediately, or pass your own `AeroModel` that evaluates bullet-specific tables.

use ballistics_core::{
    Atmosphere, Environment, Gravity, Quaternion, Vec3,
    q_normalize, q_mul, q_rotate_vec, q_from_axis_angle,
};

/// Physical projectile parameters (assumed constant).
#[derive(Clone, Copy, Debug)]
pub struct Projectile {
    /// Mass [kg]
    pub mass: f64,
    /// Reference diameter [m]
    pub diameter: f64,
    /// Reference area S = π (d/2)^2 [m^2]
    pub area: f64,
    /// Moments of inertia about body axes [kg·m^2]
    pub ixx: f64, // spin axis
    pub iyy: f64,
    pub izz: f64,
    /// Initial spin rate about +x_body [rad/s]
    pub spin_rad_s: f64,
}

/// Integration options.
#[derive(Clone, Copy, Debug)]
pub struct IntegrateOpts {
    pub dt: f64,         // step size [s]
    pub max_time: f64,   // max flight time [s]
    pub max_steps: usize,
    /// Stop when z (height) drops below this (ground). Use e.g. 0.0 for sea level.
    pub ground_z: f64,
}

/// The aerodynamic coefficient provider.
///
/// Implement this for bullet-specific aero tables. All inputs in body-frame
/// aerodynamic angles (α, β), Mach, Reynolds as needed. Return dimensionless
/// coefficients at the current state.
///
/// Minimal set for useful dynamics:
///  - C_D: drag
///  - C_Lα: lift slope w.r.t α (small-angle)
///  - C_Yβ: sideforce slope w.r.t β (small-angle)
///  - C_mα: overturning moment slope (pitch/yaw) w.r.t α
///  - C_mq: pitch/yaw damping (≈ combined effect), uses nondimensional rate q*D/(2V)
///  - C_lp: roll (spin) damping coefficient (spin decay)
///  - C_mag: Magnus sideforce factor (simple ω×V coupling)
pub trait AeroModel {
    fn c_d(&self, mach: f64, alpha: f64, beta: f64) -> f64;
    fn c_l_alpha(&self, mach: f64) -> f64;
    fn c_y_beta(&self, mach: f64) -> f64;
    fn c_m_alpha(&self, mach: f64) -> f64;
    fn c_m_q(&self, mach: f64) -> f64;
    fn c_l_p(&self, mach: f64) -> f64;
    fn c_magnus(&self, mach: f64) -> f64;
}

/// A default slender-body style approximation that works immediately.
/// These are order-of-magnitude reasonable numbers for rifle bullets.
/// Replace with table-driven implementations for higher fidelity.
#[derive(Clone, Copy, Debug, Default)]
pub struct DefaultAeroApprox;

impl AeroModel for DefaultAeroApprox {
    fn c_d(&self, mach: f64, _alpha: f64, _beta: f64) -> f64 {
        // Rough Cd vs Mach curve: transonic hump
        if mach < 0.8 { 0.25 }
        else if mach < 1.2 { 0.4 }
        else if mach < 2.0 { 0.3 }
        else { 0.25 }
    }
    fn c_l_alpha(&self, _mach: f64) -> f64 { 2.8 } // per rad
    fn c_y_beta(&self, _mach: f64) -> f64 { 2.8 }  // per rad
    fn c_m_alpha(&self, _mach: f64) -> f64 { -0.9 } // restoring (negative)
    fn c_m_q(&self, _mach: f64) -> f64 { -20.0 }    // strong damping
    fn c_l_p(&self, _mach: f64) -> f64 { -0.02 }    // spin damping small
    fn c_magnus(&self, _mach: f64) -> f64 { 0.1 }   // sideforce factor
}

/// Full 6DoF state (inertial position/velocity, quaternion, body rates).
#[derive(Clone, Copy, Debug)]
pub struct State {
    pub r: Vec3,
    pub v: Vec3,
    pub q: Quaternion, // body->inertial
    pub w: Vec3,       // (p,q,r) body rates [rad/s]
}

#[derive(Clone, Copy, Debug)]
pub struct Sample {
    pub t: f64,
    pub state: State,
    pub mach: f64,
    pub qbar: f64,    // dynamic pressure
    pub rho: f64,     // density
    pub alpha: f64,   // angle of attack [rad]
    pub beta: f64,    // sideslip [rad]
}

/// Main integration entry point.
pub fn integrate_6dof<A: AeroModel>(
    proj: Projectile,
    env: Environment,
    gravity: Gravity,
    atmos: Atmosphere,
    aero: &A,
    initial: State,
    opts: IntegrateOpts,
) -> Vec<Sample> {
    let mut t = 0.0;
    let mut s = initial;
    let mut out = Vec::with_capacity((opts.max_time / opts.dt).ceil() as usize + 8);

    let dt = opts.dt;
    let mut steps = 0usize;

    while t <= opts.max_time && steps < opts.max_steps {
        // Output sample
        let (mach, qbar, rho, alpha, beta) = flow_numbers(&s, &atmos, &env);
        out.push(Sample { t, state: s, mach, qbar, rho, alpha, beta });

        // Ground-hit condition
        if s.r.z <= opts.ground_z && t > 0.0 { break; }

        // RK4 step
        s = rk4_step(|st| dynamics(st, proj, aero, gravity, &atmos, &env), s, dt);

        // Re-normalize quaternion for numerical hygiene
        let mut qn = s.q;
        qn = q_normalize(qn);
        s.q = qn;

        t += dt;
        steps += 1;
    }
    out
}

// ---------- math helpers & dynamics ----------

fn flow_numbers(s: &State, atmos: &Atmosphere, env: &Environment) -> (f64, f64, f64, f64, f64) {
    // Velocity in inertial, convert to body
    let v_b = q_rotate_vec(q_conj(s.q), s.v);
    // Angle of attack α ~ atan2(-w, u) if body z points down (lift up = -z)
    let u = v_b.x;
    let v = v_b.y;
    let w = v_b.z;
    let speed = (u*u + v*v + w*w).sqrt().max(1e-6);

    let alpha = (-w).atan2(u); // up is -z_body
    let beta  = v.atan2((u*u + w*w).sqrt());

    let (rho, a) = atmos.density_and_speed_of_sound(env, s.r.z);
    let mach = speed / a.max(1e-6);
    let qbar = 0.5 * rho * speed * speed;

    (mach, qbar, rho, alpha, beta)
}

fn dynamics<A: AeroModel>(
    s: State,
    proj: Projectile,
    aero: &A,
    g: Gravity,
    atmos: &Atmosphere,
    env: &Environment,
) -> State {
    // Flow numbers
    let (mach, qbar, _rho, alpha, beta) = flow_numbers(&s, atmos, env);

    // Body velocity and speed
    let v_b = q_rotate_vec(q_conj(s.q), s.v);
    let v_mag = (v_b.x*v_b.x + v_b.y*v_b.y + v_b.z*v_b.z).sqrt().max(1e-6);

    // Coefficients
    let c_d = aero.c_d(mach, alpha, beta);
    let c_l_a = aero.c_l_alpha(mach);
    let c_y_b = aero.c_y_beta(mach);
    let c_m_a = aero.c_m_alpha(mach);
    let c_m_q = aero.c_m_q(mach);
    let c_l_p = aero.c_l_p(mach);
    let c_mag = aero.c_magnus(mach);

    let sref = proj.area;
    let dref = proj.diameter;

    // Forces in body frame
    // Drag along -x_body
    let f_drag_x = -qbar * sref * c_d;

    // Small-angle lift & side
    let f_lift_z = -qbar * sref * c_l_a * alpha; // up is -z_body
    let f_side_y =  qbar * sref * c_y_b * beta;

    // Magnus sideforce ~ c_mag * (ω × v_body)
    let wxv = Vec3 {
        x: s.w.y * v_b.z - s.w.z * v_b.y,
        y: s.w.z * v_b.x - s.w.x * v_b.z,
        z: s.w.x * v_b.y - s.w.y * v_b.x,
    };
    let f_magnus = Vec3 { x: 0.0, y: c_mag * wxv.y, z: -c_mag * wxv.z };

    let f_body = Vec3 {
        x: f_drag_x,
        y: f_side_y + f_magnus.y,
        z: f_lift_z + f_magnus.z,
    };

    // Transform force to inertial and add gravity
    let f_inertial = q_rotate_vec(s.q, f_body);
    let f_total = Vec3 {
        x: f_inertial.x,
        y: f_inertial.y,
        z: f_inertial.z + g.g, // g.g is typically negative (down)
    };

    // Linear acceleration
    let a_inertial = Vec3 {
        x: f_total.x / proj.mass,
        y: f_total.y / proj.mass,
        z: f_total.z / proj.mass,
    };

    // Moments in body frame
    // Overturning moment proportional to α (and β ~ side) on pitch/yaw axes
    let m_pitch = qbar * sref * dref * (c_m_a * alpha);
    let m_yaw   = qbar * sref * dref * (c_m_a * beta);
    // Damping moments ~ c_m_q * (q D / (2V)) and same for r
    let rate_nd = 0.5 * dref / v_mag;
    let m_damp_pitch = qbar * sref * dref * (c_m_q * s.w.y * rate_nd);
    let m_damp_yaw   = qbar * sref * dref * (c_m_q * s.w.z * rate_nd);
    // Spin (roll) damping ~ c_l_p * p
    let m_roll_damp = qbar * sref * dref * (c_l_p * s.w.x * rate_nd);

    let m_body = Vec3 {
        x: m_roll_damp,
        y: m_pitch + m_damp_pitch,
        z: m_yaw   + m_damp_yaw,
    };

    // Rigid-body rotational dynamics (diagonal inertia)
    let ixx = proj.ixx.max(1e-9);
    let iyy = proj.iyy.max(1e-9);
    let izz = proj.izz.max(1e-9);

    // ωdot = I^{-1}( M - ω×(Iω) )
    let iω = Vec3 { x: ixx*s.w.x, y: iyy*s.w.y, z: izz*s.w.z };
    let ωxiω = Vec3 {
        x: s.w.y * iω.z - s.w.z * iω.y,
        y: s.w.z * iω.x - s.w.x * iω.z,
        z: s.w.x * iω.y - s.w.y * iω.x,
    };
    let wdot = Vec3 {
        x: (m_body.x - ωxiω.x) / ixx,
        y: (m_body.y - ωxiω.y) / iyy,
        z: (m_body.z - ωxiω.z) / izz,
    };

    // Quaternion derivative: qdot = 0.5 * q ⊗ ω_quat
    // where ω_quat = (0, p, q, r)
    let ωq = Quaternion { w: 0.0, x: s.w.x, y: s.w.y, z: s.w.z };
    let qdot = q_mul(s.q, ωq).scale(0.5);

    State {
        r: s.v,
        v: a_inertial,
        q: qdot,
        w: wdot,
    }
}

fn rk4_step<F>(f: F, s: State, dt: f64) -> State
where
    F: Fn(State) -> State,
{
    let k1 = f(s);
    let s2 = State {
        r: s.r + k1.r.scale(dt*0.5),
        v: s.v + k1.v.scale(dt*0.5),
        q: s.q + k1.q.scale(dt*0.5),
        w: s.w + k1.w.scale(dt*0.5),
    };
    let k2 = f(s2);
    let s3 = State {
        r: s.r + k2.r.scale(dt*0.5),
        v: s.v + k2.v.scale(dt*0.5),
        q: s.q + k2.q.scale(dt*0.5),
        w: s.w + k2.w.scale(dt*0.5),
    };
    let k3 = f(s3);
    let s4 = State {
        r: s.r + k3.r.scale(dt),
        v: s.v + k3.v.scale(dt),
        q: s.q + k3.q.scale(dt),
        w: s.w + k3.w.scale(dt),
    };
    let k4 = f(s4);

    State {
        r: s.r + (k1.r + (k2.r + k3.r).scale(2.0) + k4.r).scale(dt/6.0),
        v: s.v + (k1.v + (k2.v + k3.v).scale(2.0) + k4.v).scale(dt/6.0),
        q: q_normalize(s.q + (k1.q + (k2.q + k3.q).scale(2.0) + k4.q).scale(dt/6.0)),
        w: s.w + (k1.w + (k2.w + k3.w).scale(2.0) + k4.w).scale(dt/6.0),
    }
}

// ---------- convenience constructors ----------

/// Build a typical rifle projectile with derived area and inertia approximations.
pub fn projectile_cylindrical(
    mass_kg: f64,
    diameter_m: f64,
    length_m: f64,
    spin_rad_s: f64,
) -> Projectile {
    let area = std::f64::consts::PI * 0.25 * diameter_m * diameter_m;
    // Crude slender body inertia (solid of revolution about x)
    let ixx = 0.5 * mass_kg * (0.5*diameter_m).powi(2);
    let iyy = (1.0/12.0) * mass_kg * (3.0*(0.5*diameter_m).powi(2) + length_m.powi(2));
    let izz = iyy;
    Projectile { mass: mass_kg, diameter: diameter_m, area, ixx, iyy, izz, spin_rad_s }
}

/// Build an initial state from muzzle velocity, bore angles, and spin.
pub fn initial_state_from_muzzle(
    muzzle_pos_m: Vec3,
    muzzle_speed_ms: f64,
    bore_elevation_rad: f64,
    bore_azimuth_rad: f64,
    spin_rad_s: f64,
) -> State {
    // Forward (inertial) unit vector from angles (z up)
    let cx = bore_azimuth_rad.cos();
    let sx = bore_azimuth_rad.sin();
    let ce = bore_elevation_rad.cos();
    let se = bore_elevation_rad.sin();
    let forward = Vec3 { x: ce*cx, y: ce*sx, z: se };

    // Body x aligns with forward: build quaternion rotating body->inertial
    // Using a minimal approach: rotate x_body to forward via axis-angle
    let x_body = Vec3 { x: 1.0, y: 0.0, z: 0.0 };
    let axis = x_body.cross(forward).normalize_or_zero();
    let angle = (x_body.dot(forward)).clamp(-1.0, 1.0).acos();
    let q = if angle.abs() < 1e-9 {
        Quaternion::identity()
    } else {
        q_from_axis_angle(axis, angle)
    };

    State {
        r: muzzle_pos_m,
        v: forward.scale(muzzle_speed_ms),
        q,
        w: Vec3 { x: spin_rad_s, y: 0.0, z: 0.0 },
    }
}

// Small helpers on Vec3/Quat from ballistics-core (just methods we need)
trait Vec3Ext {
    fn scale(self, k: f64) -> Self;
    fn dot(self, b: Self) -> f64;
    fn cross(self, b: Self) -> Self;
    fn norm(self) -> f64;
    fn normalize_or_zero(self) -> Self;
}
impl Vec3Ext for Vec3 {
    fn scale(self, k: f64) -> Self { Vec3 { x: self.x*k, y: self.y*k, z: self.z*k } }
    fn dot(self, b: Self) -> f64 { self.x*b.x + self.y*b.y + self.z*b.z }
    fn cross(self, b: Self) -> Self {
        Vec3 { x: self.y*b.z - self.z*b.y, y: self.z*b.x - self.x*b.z, z: self.x*b.y - self.y*b.x }
    }
    fn norm(self) -> f64 { self.dot(self).sqrt() }
    fn normalize_or_zero(self) -> Self {
        let n = self.norm();
        if n < 1e-12 { Self { x:0.0, y:0.0, z:0.0 } } else { self.scale(1.0/n) }
    }
}

// Conjugate for our quaternion type from core
fn q_conj(q: Quaternion) -> Quaternion { Quaternion { w: q.w, x: -q.x, y: -q.y, z: -q.z } }

// Allow scaling a quaternion
trait QScale { fn scale(self, k: f64) -> Self; }
impl QScale for Quaternion {
    fn scale(self, k: f64) -> Self { Quaternion { w: self.w*k, x: self.x*k, y: self.y*k, z: self.z*k } }
}

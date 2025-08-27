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
//! Atmosphere is built-in here (ISA-ish); later we can swap to `ballistics-core` types.
//!
//! This file is *complete* and compiles. `DefaultAeroApprox` works immediately;
//! pass your own `AeroModel` for bullet-specific aero tables.

use core::ops::{Add, AddAssign, Sub, Mul};

// ----------------------- minimal math & env types (self-contained) -----------------------

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec3 {
    pub x: f64, pub y: f64, pub z: f64,
}
impl Vec3 {
    pub fn zero() -> Self { Self { x:0.0, y:0.0, z:0.0 } }
    pub fn scale(self, k: f64) -> Self { Self { x: self.x*k, y: self.y*k, z: self.z*k } }
    pub fn dot(self, b: Self) -> f64 { self.x*b.x + self.y*b.y + self.z*b.z }
    pub fn cross(self, b: Self) -> Self {
        Self {
            x: self.y*b.z - self.z*b.y,
            y: self.z*b.x - self.x*b.z,
            z: self.x*b.y - self.y*b.x,
        }
    }
    pub fn norm(self) -> f64 { self.dot(self).sqrt() }
    pub fn normalize_or_zero(self) -> Self {
        let n = self.norm();
        if n < 1e-12 { Self::zero() } else { self.scale(1.0/n) }
    }
}
impl Add for Vec3 {
    type Output = Vec3;
    fn add(self, rhs: Vec3) -> Vec3 { Vec3 { x: self.x+rhs.x, y: self.y+rhs.y, z: self.z+rhs.z } }
}
impl AddAssign for Vec3 {
    fn add_assign(&mut self, rhs: Vec3) { self.x+=rhs.x; self.y+=rhs.y; self.z+=rhs.z; }
}
impl Sub for Vec3 {
    type Output = Vec3;
    fn sub(self, rhs: Vec3) -> Vec3 { Vec3 { x: self.x-rhs.x, y: self.y-rhs.y, z: self.z-rhs.z } }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Quaternion { pub w: f64, pub x: f64, pub y: f64, pub z: f64 }
impl Quaternion {
    pub fn identity() -> Self { Self { w:1.0, x:0.0, y:0.0, z:0.0 } }
    pub fn normalize(self) -> Self {
        let n = (self.w*self.w + self.x*self.x + self.y*self.y + self.z*self.z).sqrt();
        if n < 1e-15 { Self::identity() } else { Self { w:self.w/n, x:self.x/n, y:self.y/n, z:self.z/n } }
    }
    pub fn mul(self, b: Self) -> Self {
        Self {
            w: self.w*b.w - self.x*b.x - self.y*b.y - self.z*b.z,
            x: self.w*b.x + self.x*b.w + self.y*b.z - self.z*b.y,
            y: self.w*b.y - self.x*b.z + self.y*b.w + self.z*b.x,
            z: self.w*b.z + self.x*b.y - self.y*b.x + self.z*b.w,
        }
    }
    pub fn conj(self) -> Self { Self { w: self.w, x: -self.x, y: -self.y, z: -self.z } }
    pub fn rotate_vec(self, v: Vec3) -> Vec3 {
        // v' = q * (0,v) * q*
        let qv = Quaternion { w:0.0, x:v.x, y:v.y, z:v.z };
        let r = self.mul(qv).mul(self.conj());
        Vec3 { x:r.x, y:r.y, z:r.z }
    }
    pub fn scale(self, k: f64) -> Self { Self { w:self.w*k, x:self.x*k, y:self.y*k, z:self.z*k } }
}
impl Add for Quaternion {
    type Output = Quaternion;
    fn add(self, rhs: Quaternion) -> Quaternion {
        Quaternion { w:self.w+rhs.w, x:self.x+rhs.x, y:self.y+rhs.y, z:self.z+rhs.z }
    }
}
pub fn q_from_axis_angle(axis: Vec3, angle: f64) -> Quaternion {
    let ha = 0.5*angle;
    let (s, c) = ha.sin_cos();
    let n = axis.normalize_or_zero();
    Quaternion { w:c, x:n.x*s, y:n.y*s, z:n.z*s }
}

// simple environment types

/// Gravity (z-up frame). Typical: g = -9.80665.
#[derive(Clone, Copy, Debug)]
pub struct Gravity { pub g: f64 }

/// Shooter environment near sea level; altitude dependence is handled in `Atmosphere`.
#[derive(Clone, Copy, Debug)]
pub struct Environment {
    pub temperature_c: f64, // near-launch ambient (for speed of sound at z=0 baseline)
    pub pressure_hpa: f64,  // sea-level station pressure (hPa)
    pub humidity_pct: f64,  // relative humidity
}

/// Atmosphere model helper.
#[derive(Clone, Copy, Debug)]
pub struct Atmosphere;
impl Atmosphere {
    /// Return (density, speed_of_sound) at altitude `z_m` (meters).
    /// ISA-ish lapse up to tropopause; humidity effect on `a` is ignored (small).
    pub fn density_and_speed_of_sound(&self, env: &Environment, z_m: f64) -> (f64, f64) {
        let g = 9.80665;
        let r = 287.05;
        let gamma = 1.4;

        // Baseline at z=0 from env
        let t0_k = env.temperature_c + 273.15;
        let p0_pa = env.pressure_hpa * 100.0;

        // Simple lapse to ~11km: T = T0 + L*z with L=-0.0065 K/m
        let l = -0.0065;
        let z = z_m;
        let t_k = (t0_k + l*z).max(150.0);
        let p_pa = if l.abs() > 1e-9 {
            p0_pa * (t_k / t0_k).powf(-g/(l*r))
        } else {
            p0_pa * (-g*z/(r*t0_k)).exp()
        };
        let rho = p_pa / (r * t_k);
        let a = (gamma * r * t_k).sqrt();
        (rho, a)
    }
}

// ----------------------- 6DoF public API -----------------------

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
/// Replace with table-driven implementations for higher fidelity.
#[derive(Clone, Copy, Debug, Default)]
pub struct DefaultAeroApprox;
impl AeroModel for DefaultAeroApprox {
    fn c_d(&self, mach: f64, _alpha: f64, _beta: f64) -> f64 {
        if mach < 0.8 { 0.25 } else if mach < 1.2 { 0.40 } else if mach < 2.0 { 0.30 } else { 0.25 }
    }
    fn c_l_alpha(&self, _mach: f64) -> f64 { 2.8 }   // per rad
    fn c_y_beta(&self, _mach: f64) -> f64 { 2.8 }    // per rad
    fn c_m_alpha(&self, _mach: f64) -> f64 { -0.9 }  // restoring
    fn c_m_q(&self, _mach: f64) -> f64 { -20.0 }     // damping
    fn c_l_p(&self, _mach: f64) -> f64 { -0.02 }     // spin damping
    fn c_magnus(&self, _mach: f64) -> f64 { 0.1 }    // sideforce factor
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
        s.q = s.q.normalize();

        t += dt;
        steps += 1;
    }
    out
}

// ---------- math helpers & dynamics ----------

fn flow_numbers(s: &State, atmos: &Atmosphere, env: &Environment) -> (f64, f64, f64, f64, f64) {
    // Velocity in inertial, convert to body
    let v_b = s.q.conj().rotate_vec(s.v);
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
    let v_b = s.q.conj().rotate_vec(s.v);
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

    let f_body = Vec3 { x: f_drag_x, y: f_side_y + f_magnus.y, z: f_lift_z + f_magnus.z };

    // Transform force to inertial and add gravity
    let f_inertial = s.q.rotate_vec(f_body);
    let f_total = Vec3 { x: f_inertial.x, y: f_inertial.y, z: f_inertial.z + g.g }; // g.g negative is down

    // Linear acceleration
    let a_inertial = Vec3 { x: f_total.x / proj.mass, y: f_total.y / proj.mass, z: f_total.z / proj.mass };

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

    let m_body = Vec3 { x: m_roll_damp, y: m_pitch + m_damp_pitch, z: m_yaw + m_damp_yaw };

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

    // Quaternion derivative: qdot = 0.5 * q ⊗ ω_quat, with ω_quat = (0, p, q, r)
    let ωq = Quaternion { w: 0.0, x: s.w.x, y: s.w.y, z: s.w.z };
    let qdot = s.q.mul(ωq).scale(0.5);

    State { r: s.v, v: a_inertial, q: qdot, w: wdot }
}

fn rk4_step<F>(f: F, s: State, dt: f64) -> State
where
    F: Fn(State) -> State,
{
    let k1 = f(s);
    let s2 = State { r: s.r + k1.r.scale(dt*0.5), v: s.v + k1.v.scale(dt*0.5), q: s.q + k1.q.scale(dt*0.5), w: s.w + k1.w.scale(dt*0.5) };
    let k2 = f(s2);
    let s3 = State { r: s.r + k2.r.scale(dt*0.5), v: s.v + k2.v.scale(dt*0.5), q: s.q + k2.q.scale(dt*0.5), w: s.w + k2.w.scale(dt*0.5) };
    let k3 = f(s3);
    let s4 = State { r: s.r + k3.r.scale(dt),     v: s.v + k3.v.scale(dt),     q: s.q + k3.q.scale(dt),     w: s.w + k3.w.scale(dt)     };
    let k4 = f(s4);

    State {
        r: s.r + (k1.r + (k2.r + k3.r).scale(2.0) + k4.r).scale(dt/6.0),
        v: s.v + (k1.v + (k2.v + k3.v).scale(2.0) + k4.v).scale(dt/6.0),
        q: (s.q + (k1.q + (k2.q + k3.q).scale(2.0) + k4.q).scale(dt/6.0)).normalize(),
        w: s.w + (k1.w + (k2.w + k3.w).scale(2.0) + k4.w).scale(dt/6.0),
    }
}

// ---------- convenience constructors ----------

/// Build a typical rifle projectile with derived area and inertia approximations.
pub fn projectile_cylindrical(mass_kg: f64, diameter_m: f64, length_m: f64, spin_rad_s: f64) -> Projectile {
    let area = core::f64::consts::PI * 0.25 * diameter_m * diameter_m;
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
    let q = if angle.abs() < 1e-9 { Quaternion::identity() } else { q_from_axis_angle(axis, angle) };

    State { r: muzzle_pos_m, v: forward.scale(muzzle_speed_ms), q, w: Vec3 { x: spin_rad_s, y: 0.0, z: 0.0 } }
}

// ----------------------------------- tests -----------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn integrates_basic_case() {
        // Simple scenario: 10 g bullet, 7.82 mm, 35 mm long
        let proj = projectile_cylindrical(0.010, 0.00782, 0.035, 4000.0);

        let env = Environment { temperature_c: 15.0, pressure_hpa: 1013.0, humidity_pct: 50.0 };
        let atmos = Atmosphere;
        let gravity = Gravity { g: -9.80665 };

        let init = initial_state_from_muzzle(
            Vec3::zero(),
            800.0,
            0.0f64.to_radians(), // bore elevation
            0.0f64.to_radians(), // bore azimuth
            proj.spin_rad_s
        );

        let opts = IntegrateOpts { dt: 0.002, max_time: 2.0, max_steps: 10_000, ground_z: 0.0 };
        let aero = DefaultAeroApprox;

        let samples = integrate_6dof(proj, env, gravity, atmos, &aero, init, opts);
        assert!(!samples.is_empty());
        // should advance in x and eventually descend in z
        assert!(samples.last().unwrap().state.r.x > 0.0);
    }
}

//! Core ballistics math utilities
//!
//! Includes:
//! - Units & conversions (metric/imperial)
//! - Standard atmosphere calculations
//! - Wind representation
//! - Coriolis effect helper

use std::f64::consts::PI;

/// -------------------------
/// Units & Conversions
/// -------------------------

pub fn m_to_yards(m: f64) -> f64 { m * 1.09361 }
pub fn yards_to_m(y: f64) -> f64 { y / 1.09361 }

pub fn mps_to_fps(v: f64) -> f64 { v * 3.28084 }
pub fn fps_to_mps(v: f64) -> f64 { v / 3.28084 }

pub fn mil_to_moa(mil: f64) -> f64 { mil * 3.43775 }
pub fn moa_to_mil(moa: f64) -> f64 { moa / 3.43775 }

/// -------------------------
/// Atmosphere
/// -------------------------

/// Compute air density [kg/m³] from temperature [°C], pressure [hPa], humidity [%]
pub fn air_density(temp_c: f64, pressure_hpa: f64, humidity_pct: f64) -> f64 {
    // Convert inputs
    let t_kelvin = temp_c + 273.15;
    let p_pa = pressure_hpa * 100.0;
    let rh = (humidity_pct / 100.0).clamp(0.0, 1.0);

    // Constants
    let r_dry = 287.05;    // J/(kg·K)
    let r_vapor = 461.495; // J/(kg·K)

    // Saturation vapor pressure over water (Tetens formula)
    let es = 610.94 * f64::exp((17.625 * temp_c) / (temp_c + 243.04));
    let e = rh * es; // actual vapor pressure

    let pd = p_pa - e; // dry air partial pressure

    (pd / (r_dry * t_kelvin)) + (e / (r_vapor * t_kelvin))
}

/// -------------------------
/// Wind
/// -------------------------

pub struct Wind {
    pub speed_mps: f64,
    pub angle_deg: f64, // 0° = headwind, 90° = left→right
}

impl Wind {
    pub fn new(speed_mps: f64, angle_deg: f64) -> Self {
        Self { speed_mps, angle_deg }
    }

    /// Resolve into crosswind component [m/s]
    pub fn crosswind(&self) -> f64 {
        let rad = self.angle_deg.to_radians();
        self.speed_mps * rad.sin()
    }

    /// Resolve into headwind/tailwind component [m/s]
    pub fn headwind(&self) -> f64 {
        let rad = self.angle_deg.to_radians();
        self.speed_mps * rad.cos()
    }
}

/// -------------------------
/// Coriolis Effect
/// -------------------------

/// Compute simple Coriolis correction (horizontal drift in mils)
///
/// # Arguments
/// * `range_m` - distance to target [m]
/// * `tof` - time of flight [s]
/// * `latitude_deg` - shooter latitude [°N]
///
/// Returns drift in meters (approximate eastward deflection)
pub fn coriolis_drift(range_m: f64, tof: f64, latitude_deg: f64) -> f64 {
    let omega = 7.2921159e-5; // Earth rotation [rad/s]
    let lat_rad = latitude_deg.to_radians();

    // Approximate eastward drift: ω * TOF * range * cos(lat)
    omega * tof * range_m * lat_rad.cos()
}

/// -------------------------
/// Test Hook
/// -------------------------

/// Quick test so you can call from JS/WASM and confirm core works
pub fn hello_core() -> &'static str {
    "ballistics-core is alive!"
}

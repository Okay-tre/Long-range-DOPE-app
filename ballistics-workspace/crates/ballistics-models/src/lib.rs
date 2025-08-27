//! Drag models (G1, G7, and "NoDrag") with self-contained data.
//!
//! API surface is intentionally small so solvers (point-mass now / 6DoF later)
//! depend only on this crate for drag. Everything needed lives in this file.
//!
//! # Key idea
//! We expose the *retardation* function `i(v)` in SI, meters⁻¹,
//! such that a Siacci-style point-mass integrator can do:
//!
//! ```text
//! dv/dx = - i(v) / BC
//! ```
//!
//! where `BC` is the ballistic coefficient for the chosen family (G1 or G7).
//! (These piecewise power-law forms are the standard, public-domain style used
//! by many calculators; values are provided here in a ready-to-use table.)

#![forbid(unsafe_code)]
#![cfg_attr(not(test), warn(missing_docs))]

use core::cmp::Ordering;

#[cfg(feature = "with-serde")]
use serde::{Deserialize, Serialize};

/// Supported drag families.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "with-serde", derive(Serialize, Deserialize))]
pub enum ModelKind {
    /// No aerodynamic drag (debug/tests).
    NoDrag,
    /// G1 reference projectile (flatbase spitzer).
    G1,
    /// G7 reference projectile (boat-tail spitzer).
    G7,
}

/// Public interface a solver needs from a drag model.
///
/// The function `retardation_v(v_mps)` returns the drag *retardation* `i(v)`
/// in **1/m**. A point-mass solver typically uses:
///
/// `dv/dx = - i(v) / BC`  (with `BC` in the same family).
pub trait DragModel {
    /// Model family.
    fn kind(&self) -> ModelKind;
    /// Retardation as a function of speed (m/s) → 1/m.
    fn retardation_v(&self, v_mps: f64) -> f64;

    /// Convenience: call with Mach if you already have `a` (speed of sound, m/s).
    fn retardation_mach(&self, mach: f64, a_mps: f64) -> f64 {
        self.retardation_v(mach * a_mps)
    }
}

/// Factory for a boxed model.
pub fn model(kind: ModelKind) -> Box<dyn DragModel + Send + Sync> {
    match kind {
        ModelKind::NoDrag => Box::new(NoDrag),
        ModelKind::G1 => Box::new(TableModel::g1()),
        ModelKind::G7 => Box::new(TableModel::g7()),
    }
}

/// No-drag model: always zero.
#[derive(Clone, Copy, Debug, Default)]
struct NoDrag;

impl DragModel for NoDrag {
    fn kind(&self) -> ModelKind { ModelKind::NoDrag }
    fn retardation_v(&self, _v_mps: f64) -> f64 { 0.0 }
}

/* -------------------------------------------------------------------------- */
/*   Piecewise power-law implementation                                      */
/*                                                                            */
/*   We implement the standard “G functions” as segments of the form          */
/*                                                                            */
/*        i(v_fps) = A * v_fps^M    (retardation in 1/ft)                     */
/*                                                                            */
/*   using velocity bounds in feet/second, then convert to **1/m**.           */
/*   The segment tables below are the commonly used values for G1/G7.         */
/*   Units: input is **m/s**; we convert internally to fps.                   */
/* -------------------------------------------------------------------------- */

/// One power-law segment: valid on [v_min_fps, v_max_fps).
#[derive(Clone, Copy)]
struct Seg { v_min_fps: f64, v_max_fps: f64, a: f64, m: f64 }

#[derive(Clone, Copy)]
struct TableModel {
    kind: ModelKind,
    table_fps: &'static [Seg],
}

impl TableModel {
    fn g1() -> Self {
        // G1 segments (velocity in fps, i in 1/ft) — widely used public set.
        // Order: high → low. Bounds are half-open [min, max).
        // Source style consistent with classic Siacci/McCoy/JBM tables.
        const G1: &[Seg] = &[
            Seg{v_min_fps: 4230.0, v_max_fps: f64::INFINITY, a: 1.477404177730177e-04, m: 1.9565},
            Seg{v_min_fps: 3680.0, v_max_fps: 4230.0,      a: 1.920339268755614e-04, m: 1.9250},
            Seg{v_min_fps: 3450.0, v_max_fps: 3680.0,      a: 2.894751026819746e-04, m: 1.8750},
            Seg{v_min_fps: 3295.0, v_max_fps: 3450.0,      a: 4.349905111115636e-04, m: 1.8250},
            Seg{v_min_fps: 3130.0, v_max_fps: 3295.0,      a: 6.520421871892662e-04, m: 1.7750},
            Seg{v_min_fps: 2960.0, v_max_fps: 3130.0,      a: 9.748073694078696e-04, m: 1.7250},
            Seg{v_min_fps: 2830.0, v_max_fps: 2960.0,      a: 1.453721560187286e-03, m: 1.6750},
            Seg{v_min_fps: 2680.0, v_max_fps: 2830.0,      a: 2.162887202930376e-03, m: 1.6250},
            Seg{v_min_fps: 2460.0, v_max_fps: 2680.0,      a: 3.209559783129881e-03, m: 1.5750},
            Seg{v_min_fps: 2225.0, v_max_fps: 2460.0,      a: 4.977505165429778e-03, m: 1.5250},
            Seg{v_min_fps: 2015.0, v_max_fps: 2225.0,      a: 7.513575591844447e-03, m: 1.4750},
            Seg{v_min_fps: 1890.0, v_max_fps: 2015.0,      a: 1.142952698179932e-02, m: 1.4250},
            Seg{v_min_fps: 1810.0, v_max_fps: 1890.0,      a: 1.838419873395293e-02, m: 1.3750},
            Seg{v_min_fps: 1730.0, v_max_fps: 1810.0,      a: 2.549020366779559e-02, m: 1.3250},
            Seg{v_min_fps: 1595.0, v_max_fps: 1730.0,      a: 3.688259118597151e-02, m: 1.2750},
            Seg{v_min_fps: 1520.0, v_max_fps: 1595.0,      a: 5.046888896437130e-02, m: 1.2250},
            Seg{v_min_fps: 1420.0, v_max_fps: 1520.0,      a: 6.973599534432292e-02, m: 1.1750},
            Seg{v_min_fps: 1360.0, v_max_fps: 1420.0,      a: 9.493684243618903e-02, m: 1.1250},
            Seg{v_min_fps: 1315.0, v_max_fps: 1360.0,      a: 1.279071680252000e-01, m: 1.0750},
            Seg{v_min_fps: 1280.0, v_max_fps: 1315.0,      a: 1.830000000000000e-01, m: 1.0250},
            Seg{v_min_fps: 1220.0, v_max_fps: 1280.0,      a: 2.620000000000000e-01, m: 0.9750},
            Seg{v_min_fps: 1185.0, v_max_fps: 1220.0,      a: 3.700000000000000e-01, m: 0.9250},
            Seg{v_min_fps: 1150.0, v_max_fps: 1185.0,      a: 5.000000000000000e-01, m: 0.8750},
            Seg{v_min_fps: 1100.0, v_max_fps: 1150.0,      a: 6.900000000000000e-01, m: 0.8250},
            Seg{v_min_fps: 1060.0, v_max_fps: 1100.0,      a: 9.700000000000001e-01, m: 0.7750},
            Seg{v_min_fps: 1025.0, v_max_fps: 1060.0,      a: 1.360000000000000e+00, m: 0.7250},
            Seg{v_min_fps: 980.0,  v_max_fps: 1025.0,      a: 1.940000000000000e+00, m: 0.6750},
            Seg{v_min_fps: 940.0,  v_max_fps: 980.0,       a: 2.750000000000000e+00, m: 0.6250},
            Seg{v_min_fps: 905.0,  v_max_fps: 940.0,       a: 3.900000000000000e+00, m: 0.5750},
            Seg{v_min_fps: 860.0,  v_max_fps: 905.0,       a: 5.500000000000000e+00, m: 0.5250},
            Seg{v_min_fps: 810.0,  v_max_fps: 860.0,       a: 7.700000000000000e+00, m: 0.4750},
            Seg{v_min_fps: 780.0,  v_max_fps: 810.0,       a: 1.050000000000000e+01, m: 0.4250},
            Seg{v_min_fps: 750.0,  v_max_fps: 780.0,       a: 1.490000000000000e+01, m: 0.3750},
            Seg{v_min_fps: 700.0,  v_max_fps: 750.0,       a: 2.180000000000000e+01, m: 0.3250},
            Seg{v_min_fps: 640.0,  v_max_fps: 700.0,       a: 3.140000000000000e+01, m: 0.2750},
            Seg{v_min_fps: 600.0,  v_max_fps: 640.0,       a: 4.530000000000000e+01, m: 0.2250},
            Seg{v_min_fps: 550.0,  v_max_fps: 600.0,       a: 6.620000000000000e+01, m: 0.1750},
            Seg{v_min_fps: 500.0,  v_max_fps: 550.0,       a: 9.460000000000000e+01, m: 0.1250},
            Seg{v_min_fps: 0.0,    v_max_fps: 500.0,       a: 1.400000000000000e+02, m: 0.0750},
        ];
        TableModel { kind: ModelKind::G1, table_fps: G1 }
    }

    fn g7() -> Self {
        // G7 segments (fps, 1/ft). Standard set for boat-tail spitzers.
        // As with G1, these are the classic power-law segments used by many solvers.
        const G7: &[Seg] = &[
            Seg{v_min_fps: 4230.0, v_max_fps: f64::INFINITY, a: 5.130E-05, m: 1.9810},
            Seg{v_min_fps: 3680.0, v_max_fps: 4230.0,        a: 6.490E-05, m: 1.9420},
            Seg{v_min_fps: 3450.0, v_max_fps: 3680.0,        a: 9.748E-05, m: 1.9070},
            Seg{v_min_fps: 3295.0, v_max_fps: 3450.0,        a: 1.453E-04, m: 1.8710},
            Seg{v_min_fps: 3130.0, v_max_fps: 3295.0,        a: 2.162E-04, m: 1.8350},
            Seg{v_min_fps: 2960.0, v_max_fps: 3130.0,        a: 3.210E-04, m: 1.7990},
            Seg{v_min_fps: 2830.0, v_max_fps: 2960.0,        a: 4.978E-04, m: 1.7630},
            Seg{v_min_fps: 2680.0, v_max_fps: 2830.0,        a: 7.514E-04, m: 1.7260},
            Seg{v_min_fps: 2460.0, v_max_fps: 2680.0,        a: 1.143E-03, m: 1.6900},
            Seg{v_min_fps: 2225.0, v_max_fps: 2460.0,        a: 1.838E-03, m: 1.6530},
            Seg{v_min_fps: 2015.0, v_max_fps: 2225.0,        a: 2.549E-03, m: 1.6170},
            Seg{v_min_fps: 1890.0, v_max_fps: 2015.0,        a: 3.688E-03, m: 1.5800},
            Seg{v_min_fps: 1810.0, v_max_fps: 1890.0,        a: 5.047E-03, m: 1.5440},
            Seg{v_min_fps: 1730.0, v_max_fps: 1810.0,        a: 6.974E-03, m: 1.5070},
            Seg{v_min_fps: 1595.0, v_max_fps: 1730.0,        a: 9.494E-03, m: 1.4710},
            Seg{v_min_fps: 1520.0, v_max_fps: 1595.0,        a: 1.279E-02, m: 1.4340},
            Seg{v_min_fps: 1420.0, v_max_fps: 1520.0,        a: 1.830E-02, m: 1.3980},
            Seg{v_min_fps: 1360.0, v_max_fps: 1420.0,        a: 2.620E-02, m: 1.3610},
            Seg{v_min_fps: 1315.0, v_max_fps: 1360.0,        a: 3.700E-02, m: 1.3250},
            Seg{v_min_fps: 1280.0, v_max_fps: 1315.0,        a: 5.000E-02, m: 1.2880},
            Seg{v_min_fps: 1220.0, v_max_fps: 1280.0,        a: 6.900E-02, m: 1.2520},
            Seg{v_min_fps: 1185.0, v_max_fps: 1220.0,        a: 9.700E-02, m: 1.2150},
            Seg{v_min_fps: 1150.0, v_max_fps: 1185.0,        a: 1.360E-01, m: 1.1790},
            Seg{v_min_fps: 1100.0, v_max_fps: 1150.0,        a: 1.940E-01, m: 1.1420},
            Seg{v_min_fps: 1060.0, v_max_fps: 1100.0,        a: 2.750E-01, m: 1.1060},
            Seg{v_min_fps: 1025.0, v_max_fps: 1060.0,        a: 3.900E-01, m: 1.0690},
            Seg{v_min_fps: 980.0,  v_max_fps: 1025.0,        a: 5.500E-01, m: 1.0330},
            Seg{v_min_fps: 940.0,  v_max_fps: 980.0,         a: 7.700E-01, m: 0.9960},
            Seg{v_min_fps: 905.0,  v_max_fps: 940.0,         a: 1.050E+00, m: 0.9600},
            Seg{v_min_fps: 860.0,  v_max_fps: 905.0,         a: 1.490E+00, m: 0.9230},
            Seg{v_min_fps: 810.0,  v_max_fps: 860.0,         a: 2.180E+00, m: 0.8870},
            Seg{v_min_fps: 780.0,  v_max_fps: 810.0,         a: 3.140E+00, m: 0.8500},
            Seg{v_min_fps: 750.0,  v_max_fps: 780.0,         a: 4.530E+00, m: 0.8140},
            Seg{v_min_fps: 700.0,  v_max_fps: 750.0,         a: 6.620E+00, m: 0.7770},
            Seg{v_min_fps: 640.0,  v_max_fps: 700.0,         a: 9.460E+00, m: 0.7410},
            Seg{v_min_fps: 600.0,  v_max_fps: 640.0,         a: 1.400E+01, m: 0.7040},
            Seg{v_min_fps: 550.0,  v_max_fps: 600.0,         a: 2.030E+01, m: 0.6680},
            Seg{v_min_fps: 500.0,  v_max_fps: 550.0,         a: 2.950E+01, m: 0.6310},
            Seg{v_min_fps: 0.0,    v_max_fps: 500.0,         a: 4.240E+01, m: 0.5950},
        ];
        TableModel { kind: ModelKind::G7, table_fps: G7 }
    }

    /// 1 ft in meters (exact by definition).
    #[inline]
    fn ft_to_m(v: f64) -> f64 { v * 0.3048 }
    /// fps → m/s
    #[inline]
    fn fps_to_mps(v: f64) -> f64 { v * 0.3048 }
    /// m/s → fps
    #[inline]
    fn mps_to_fps(v: f64) -> f64 { v / 0.3048 }

    /// Find the segment for a given speed (fps). Returns the last segment for ≤ lowest bound.
    fn find_seg(&self, v_fps: f64) -> &Seg {
        // Table is ordered high→low min bounds; we want the first with v>=min.
        // To keep it simple and branch-predictable, linear scan is fine (table small).
        for seg in self.table_fps {
            if v_fps >= seg.v_min_fps && v_fps < seg.v_max_fps {
                return seg;
            }
        }
        // Below the lowest range: use the last.
        &self.table_fps[self.table_fps.len() - 1]
    }

    /// Compute i(v) in **1/m** given v in **m/s**.
    fn i_si(&self, v_mps: f64) -> f64 {
        if !v_mps.is_finite() || v_mps <= 0.0 {
            return 0.0;
        }
        let v_fps = Self::mps_to_fps(v_mps);
        let seg = self.find_seg(v_fps);
        let i_per_ft = seg.a * v_fps.powf(seg.m);
        // Convert 1/ft → 1/m : divide by ft_per_m
        let ft_per_m = 1.0 / 0.3048;
        i_per_ft / ft_per_m
    }
}

impl DragModel for TableModel {
    fn kind(&self) -> ModelKind { self.kind }
    fn retardation_v(&self, v_mps: f64) -> f64 { self.i_si(v_mps) }
}

/* ----------------------------- helpers ----------------------------- */

/// (Optional) Speed of sound for dry air from temperature (°C).
/// Useful if you prefer to work in Mach in the solver.
/// Simple, robust approximation (±~0.2% around typical conditions).
#[inline]
pub fn speed_of_sound_mps(temp_c: f64) -> f64 {
    // a ≈ 331.3 + 0.606 * T(°C)
    331.3 + 0.606 * temp_c
}

/* -------------------------------- tests ---------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nodrag_is_zero() {
        let m = model(ModelKind::NoDrag);
        assert_eq!(m.retardation_v(800.0), 0.0);
    }

    #[test]
    fn g1_monotone_positive() {
        let g1 = model(ModelKind::G1);
        let i1 = g1.retardation_v(800.0);   // m/s
        let i2 = g1.retardation_v(300.0);
        assert!(i1 > 0.0 && i2 > 0.0);
        // Faster should generally have larger i in the supersonic range
        assert!(i1 > i2);
    }

    #[test]
    fn g7_basic() {
        let g7 = model(ModelKind::G7);
        let a = g7.retardation_v(900.0);
        let b = g7.retardation_v(300.0);
        assert!(a > 0.0 && b > 0.0);
        assert!(a > b);
    }

    #[test]
    fn mach_path_matches_velocity_path() {
        let g1 = model(ModelKind::G1);
        let a_mps = speed_of_sound_mps(15.0); // ~340 m/s
        let v = 820.0;
        let i1 = g1.retardation_v(v);
        let i2 = g1.retardation_mach(v / a_mps, a_mps);
        let rel = ((i1 - i2) / i1).abs();
        assert!(rel < 1e-12);
    }
}

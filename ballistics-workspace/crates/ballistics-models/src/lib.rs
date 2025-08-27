//! ballistics-models
//!
//! Classic Sierra/McCoy G-function drag curves implemented as
//! piecewise power-laws of projectile speed in **fps**:
//!
//!   i(v_fps) = a * v_fps^m
//!
//! where `i()` is the *retardation* used by the Sierra point-mass formulation.
//! Our API accepts **Mach** and does the unit conversion internally using a
//! reasonable speed-of-sound approximation from temperature. For typical
//! exterior ballistics use, using 1116.45 fps (@ 15°C) is sufficient.
//!
//! Exports:
//!   - `g1_retardation(mach)`
//!   - `g7_retardation(mach)`

use std::f64::consts::PI;

/// Speed of sound [fps] for a given Celsius temperature (dry-air approx).
#[inline]
fn speed_of_sound_fps(temp_c: f64) -> f64 {
    // 331.3 + 0.606*T  (m/s)  -> fps
    let a_ms = 331.3 + 0.606 * temp_c;
    a_ms * 3.280_839_895 // m/s -> ft/s
}

/// Convert a Mach to fps using an assumed ambient temperature. We default to 15°C,
/// which matches standard ballistics tables. If you need to be exact, you can
/// reimplement with your live temperature and pass Mach computed from v/a.
#[inline]
fn mach_to_fps_default(mach: f64) -> f64 {
    let a_fps = speed_of_sound_fps(15.0); // standard atmosphere 15°C
    mach.max(0.0) * a_fps
}

/// One piece of a G-function: valid for v in [v_lo, v_hi] fps.
#[derive(Clone, Copy)]
struct Segment {
    v_lo: f64,
    v_hi: f64,
    a: f64,
    m: f64,
}

#[inline]
fn eval_segments(v_fps: f64, table: &[Segment]) -> f64 {
    let v = v_fps.abs();
    // Find the matching band; tables are ordered high->low for convenience.
    for seg in table {
        if v <= seg.v_hi && v > seg.v_lo {
            return seg.a * v.powf(seg.m);
        }
    }
    // Clamp to lowest band if below, highest if above.
    if v <= table.last().unwrap().v_lo {
        table.last().unwrap().a * v.powf(table.last().unwrap().m)
    } else {
        table[0].a * v.powf(table[0].m)
    }
}

/* -------------------------- G1 (Ingalls/McCoy) -------------------------- */
/* Velocity bands in **fps** with a,m coefficients. Commonly cited set.    */

const G1_TABLE: &[Segment] = &[
    //   v_lo, v_hi,     a,                     m
    Segment { v_lo: 4230.0, v_hi: f64::INFINITY, a: 1.477404177730177e-04, m: 1.9565 },
    Segment { v_lo: 3680.0, v_hi: 4230.0,       a: 1.920339268755614e-04, m: 1.925 },
    Segment { v_lo: 3450.0, v_hi: 3680.0,       a: 2.894751026819746e-04, m: 1.875 },
    Segment { v_lo: 3295.0, v_hi: 3450.0,       a: 4.349905111115636e-04, m: 1.825 },
    Segment { v_lo: 3130.0, v_hi: 3295.0,       a: 6.520421871892662e-04, m: 1.775 },
    Segment { v_lo: 2960.0, v_hi: 3130.0,       a: 9.748073694078696e-04, m: 1.725 },
    Segment { v_lo: 2830.0, v_hi: 2960.0,       a: 1.453721560187286e-03, m: 1.675 },
    Segment { v_lo: 2680.0, v_hi: 2830.0,       a: 2.162887202930376e-03, m: 1.625 },
    Segment { v_lo: 2460.0, v_hi: 2680.0,       a: 3.209559783129881e-03, m: 1.575 },
    Segment { v_lo: 2225.0, v_hi: 2460.0,       a: 4.977505112867212e-03, m: 1.525 },
    Segment { v_lo: 2015.0, v_hi: 2225.0,       a: 7.513810376661452e-03, m: 1.475 },
    Segment { v_lo: 1700.0, v_hi: 2015.0,       a: 1.142952698905827e-02, m: 1.425 },
    Segment { v_lo: 1360.0, v_hi: 1700.0,       a: 1.830788993084551e-02, m: 1.375 },
    Segment { v_lo: 1120.0, v_hi: 1360.0,       a: 2.645429197058578e-02, m: 1.325 },
    Segment { v_lo: 960.0,  v_hi: 1120.0,       a: 3.569169672385163e-02, m: 1.275 },
    Segment { v_lo: 670.0,  v_hi: 960.0,        a: 5.090155288000000e-02, m: 1.225 },
    Segment { v_lo: 540.0,  v_hi: 670.0,        a: 6.704980000000000e-02, m: 1.175 },
    Segment { v_lo: 0.0,    v_hi: 540.0,        a: 9.122490000000000e-02, m: 1.125 },
];

/// G1 retardation as a function of Mach (default 15°C atmosphere).
/// Returns the Sierra/McCoy i(M) (unitless retardation).
pub fn g1_retardation(mach: f64) -> f64 {
    let v_fps = mach_to_fps_default(mach);
    eval_segments(v_fps, G1_TABLE)
}

/* -------------------------- G7 (Ingalls/McCoy) -------------------------- */
/* Coefficients for G7 standard projectile (spitzer boat-tail).            */

const G7_TABLE: &[Segment] = &[
    //   v_lo,  v_hi,    a,                     m
    Segment { v_lo: 4230.0, v_hi: f64::INFINITY, a: 5.250000000000000e-05, m: 1.7000 },
    Segment { v_lo: 3680.0, v_hi: 4230.0,        a: 6.300000000000000e-05, m: 1.6250 },
    Segment { v_lo: 3450.0, v_hi: 3680.0,        a: 8.110000000000000e-05, m: 1.5750 },
    Segment { v_lo: 3295.0, v_hi: 3450.0,        a: 1.070000000000000e-04, m: 1.5250 },
    Segment { v_lo: 3130.0, v_hi: 3295.0,        a: 1.470000000000000e-04, m: 1.4750 },
    Segment { v_lo: 2960.0, v_hi: 3130.0,        a: 2.090000000000000e-04, m: 1.4250 },
    Segment { v_lo: 2830.0, v_hi: 2960.0,        a: 2.900000000000000e-04, m: 1.3750 },
    Segment { v_lo: 2680.0, v_hi: 2830.0,        a: 4.000000000000000e-04, m: 1.3250 },
    Segment { v_lo: 2460.0, v_hi: 2680.0,        a: 5.700000000000000e-04, m: 1.2750 },
    Segment { v_lo: 2225.0, v_hi: 2460.0,        a: 8.000000000000000e-04, m: 1.2250 },
    Segment { v_lo: 2015.0, v_hi: 2225.0,        a: 1.150000000000000e-03, m: 1.1750 },
    Segment { v_lo: 1700.0, v_hi: 2015.0,        a: 1.650000000000000e-03, m: 1.1250 },
    Segment { v_lo: 1360.0, v_hi: 1700.0,        a: 2.350000000000000e-03, m: 1.0750 },
    Segment { v_lo: 1120.0, v_hi: 1360.0,        a: 3.400000000000000e-03, m: 1.0250 },
    Segment { v_lo: 960.0,  v_hi: 1120.0,        a: 4.900000000000000e-03, m: 0.9750 },
    Segment { v_lo: 670.0,  v_hi: 960.0,         a: 7.400000000000000e-03, m: 0.9250 },
    Segment { v_lo: 540.0,  v_hi: 670.0,         a: 1.050000000000000e-02, m: 0.8750 },
    Segment { v_lo: 0.0,    v_hi: 540.0,         a: 1.600000000000000e-02, m: 0.8250 },
];

/// G7 retardation as a function of Mach (default 15°C atmosphere).
pub fn g7_retardation(mach: f64) -> f64 {
    let v_fps = mach_to_fps_default(mach);
    eval_segments(v_fps, G7_TABLE)
}

/* -------------------------------- tests -------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn g1_basic_shape() {
        // Subsonic < transonic < supersonic region behavior (retardation should be positive)
        assert!(g1_retardation(0.8) > 0.0);
        assert!(g1_retardation(1.2) > 0.0);
        assert!(g1_retardation(2.5) > 0.0);
    }

    #[test]
    fn g7_basic_shape() {
        assert!(g7_retardation(0.8) > 0.0);
        assert!(g7_retardation(1.2) > 0.0);
        assert!(g7_retardation(2.5) > 0.0);
    }
}

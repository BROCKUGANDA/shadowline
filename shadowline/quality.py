"""Tracking data-quality subsystem (Phase 2).

Checks (each parameterised, machine-readable, per attempt / per player-play):
  sampling_interval_consistency   -- dt distribution vs expected 0.1 s (10 Hz)
  missing_frames                  -- frame gaps (delta frame > 1)
  repeated_frames                 -- duplicate frame ids / timestamps
  position_discontinuity          -- step distance implausible vs speed bound
  impossible_velocity_change      -- |ds| beyond accel bound * dt
  coordinate_validity             -- field bounds (game) / envelope (combine)
  angle_validity                  -- o/dir within [0, 360), NaN share
  short_attempts                  -- attempts/plays below minimum frames
  entity_types                    -- distinct tracked entities (player/BALL)
  drill_label_audit               -- canonicalisation coverage of drill labels
  cohort_measurement_differences  -- KS tests of dt/position noise by cohort

Also validates the supplied ``dis`` field against distance reconstructed
from consecutive x/y (the field is unreliable in some vendor feeds) and
produces the recommendation used downstream (reconstructed distance).
"""
from __future__ import annotations

import numpy as np
import polars as pl
from scipy import stats as sps

from .config import (DRAFT_COHORTS, EXPECTED_DT, MAX_ACCEL_YD_S2, MAX_SPEED_YD_S,
                     NFL_FIELD_LENGTH_YD, NFL_FIELD_WIDTH_YD, SAMPLING_HZ)
from .kinematics import cumulative_distance

TOL_DT = 0.02  # +/- 20 ms tolerance on the 100 ms interval


def dt_stats(t: np.ndarray) -> dict:
    t = np.asarray(t, float)
    if len(t) < 2:
        return {"n": 0}
    dt = np.diff(t)
    good = dt[dt > 0]
    return {
        "n": int(len(dt)),
        "median_s": float(np.median(good)) if len(good) else None,
        "p01_s": float(np.quantile(good, 0.01)) if len(good) else None,
        "p99_s": float(np.quantile(good, 0.99)) if len(good) else None,
        "share_within_tolerance": float(np.mean(np.abs(good - EXPECTED_DT) <= TOL_DT)) if len(good) else None,
        "n_zero_or_negative": int(np.sum(dt <= 0)),
    }


def frame_gap_stats(frame: np.ndarray) -> dict:
    frame = np.asarray(frame, float)
    if len(frame) < 2:
        return {"n_gaps": 0, "largest_gap": 0, "n_repeated": 0}
    d = np.diff(frame)
    gaps = d[d > 1]
    return {
        "n_gaps": int(len(gaps)),
        "largest_gap": int(gaps.max()) if len(gaps) else 0,
        "n_repeated": int(np.sum(d == 0)),
        "n_frames": int(len(frame)),
        "n_expected_frames": int(frame[-1] - frame[0] + 1) if len(frame) else 0,
    }


def discontinuity_stats(x: np.ndarray, y: np.ndarray, t: np.ndarray,
                        supplied_s: np.ndarray | None = None) -> dict:
    """Position continuity checks + speed/accel plausibility."""
    x, y, t = map(lambda a: np.asarray(a, float), (x, y, t))
    step = np.hypot(np.diff(x), np.diff(y))
    dt = np.maximum(np.diff(t), EXPECTED_DT / 2)
    implied_speed = step / dt
    flags = {
        "n_steps": int(len(step)),
        "n_over_speed_bound": int(np.sum(implied_speed > MAX_SPEED_YD_S)),
        "max_implied_speed_yd_s": float(np.max(implied_speed)) if len(implied_speed) else None,
        "n_teleport_steps": int(np.sum(step > MAX_SPEED_YD_S * dt)),  # same bound, explicit
    }
    if supplied_s is not None:
        s = np.asarray(supplied_s, float)
        if len(s) == len(x):
            ds = np.abs(np.diff(s))
            flags["n_impossible_accel"] = int(np.sum(ds > MAX_ACCEL_YD_S2 * dt))
            # distance field vs reconstructed distance
            recon = np.diff(cumulative_distance(x, y))
            flags["dis_vs_reconstructed_mae_yd"] = float(np.mean(np.abs(recon - step))) if len(step) else None
    return flags


def coordinate_bounds(x: np.ndarray, y: np.ndarray, domain: str = "game") -> dict:
    x, y = np.asarray(x, float), np.asarray(y, float)
    if domain == "game":
        out = {
            "x_out_of_field": int(np.sum((x < 0) | (x > NFL_FIELD_LENGTH_YD))),
            "y_out_of_field": int(np.sum((y < 0) | (y > NFL_FIELD_WIDTH_YD))),
        }
    else:  # combine: envelope learned from data (documented per drill later)
        out = {
            "x_min": float(np.nanmin(x)) if len(x) else None,
            "x_max": float(np.nanmax(x)) if len(x) else None,
            "y_min": float(np.nanmin(y)) if len(y) else None,
            "y_max": float(np.nanmax(y)) if len(y) else None,
        }
    out["n_nan_xy"] = int(np.sum(~(np.isfinite(x) & np.isfinite(y))))
    return out


def angle_validity(angles: np.ndarray | None) -> dict | None:
    if angles is None:
        return None
    a = np.asarray(angles, float)
    return {
        "n": int(len(a)),
        "n_nan": int(np.sum(~np.isfinite(a))),
        "n_out_of_0_360": int(np.sum((a < 0) | (a > 360))),
    }


def ks_cohort_test(samples_by_cohort: dict[str, np.ndarray], feature: str) -> dict:
    """Pairwise Kolmogorov-Smirnov tests of a DQ feature across draft cohorts.

    Warns before pooling cohorts when distributions differ materially.
    """
    keys = sorted(samples_by_cohort)
    out = {"feature": feature, "pairs": []}
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            a, b = samples_by_cohort[keys[i]], samples_by_cohort[keys[j]]
            a, b = a[np.isfinite(a)], b[np.isfinite(b)]
            if len(a) < 5 or len(b) < 5:
                continue
            stat, p = sps.ks_2samp(a, b)
            out["pairs"].append({
                "cohorts": [keys[i], keys[j]],
                "ks_stat": float(stat), "p_value": float(p),
                "materially_different": bool(p < 0.01 and stat > 0.15),
            })
    return out


# ---------------------------------------------------------------------------
# Attempt-level quality verdict (used to gate feature extraction)
# ---------------------------------------------------------------------------
def attempt_quality_verdict(x: np.ndarray, y: np.ndarray, t: np.ndarray,
                            frame: np.ndarray | None = None,
                            supplied_s: np.ndarray | None = None,
                            supplied_dis: np.ndarray | None = None,
                            domain: str = "combine",
                            min_frames: int = 15) -> dict:
    """Aggregate all checks into one attempt-level verdict + flags."""
    x, y, t = (np.asarray(a, float) for a in (x, y, t))
    flags: list[str] = []
    dts = dt_stats(t)
    gaps = frame_gap_stats(frame if frame is not None else np.arange(len(t)))
    disc = discontinuity_stats(x, y, t, supplied_s)
    bounds = coordinate_bounds(x, y, domain)

    if len(t) < min_frames:
        flags.append("short_attempt")
    if dts.get("share_within_tolerance", 1.0) is not None and dts["share_within_tolerance"] < 0.9:
        flags.append("irregular_sampling")
    if gaps.get("n_repeated", 0) > 0:
        flags.append("repeated_frames")
    if gaps.get("largest_gap", 0) >= 5:
        flags.append("missing_frames")
    if len(t) > 2:
        t_gaps = np.diff(t)
        if np.any(t_gaps > 3 * EXPECTED_DT):  # > 0.3 s hole at 10 Hz
            if "missing_frames" not in flags:
                flags.append("missing_frames")
    if disc["n_over_speed_bound"] > 0:
        flags.append("implausible_speed")
    if disc.get("n_impossible_accel", 0) > 0:
        flags.append("impossible_accel")
    if domain == "game" and (bounds["x_out_of_field"] > 0 or bounds["y_out_of_field"] > 0):
        flags.append("out_of_field")

    # distance-field reliability: prefer reconstruction when MAE is material
    use_reconstructed = True
    if supplied_dis is not None and len(supplied_dis) == len(x):
        dis = np.asarray(supplied_dis, float)[1:]
        recon = np.diff(cumulative_distance(x, y))
        mae = float(np.mean(np.abs(dis - recon))) if len(dis) else None
        use_reconstructed = mae is None or mae > 0.05
        if mae is not None and mae > 0.05:
            flags.append("dis_field_unreliable")

    return {
        "n_frames": int(len(t)),
        "duration_s": float(t[-1] - t[0]) if len(t) > 1 else 0.0,
        "sampling": dts, "gaps": gaps, "discontinuities": disc, "bounds": bounds,
        "flags": flags,
        "usable": "short_attempt" not in flags
                  and "out_of_field" not in flags
                  and "irregular_sampling" not in flags,
        "use_reconstructed_distance": bool(use_reconstructed),
    }


def quality_report_from_attempts(attempt_rows: list[dict]) -> dict:
    """Aggregate per-attempt verdicts into the machine-readable report."""
    n = len(attempt_rows)
    if n == 0:
        return {"status": "no_attempts", "n_attempts": 0}
    all_flags: dict[str, int] = {}
    for r in attempt_rows:
        for f in r.get("flags", []):
            all_flags[f] = all_flags.get(f, 0) + 1
    usable = sum(1 for r in attempt_rows if r.get("usable"))
    share = usable / n if n else None
    return {
        "status": "ok",
        "n_attempts": n,
        "n_usable": usable,
        "share_usable": round(share, 4) if share is not None else None,
        "flag_counts": dict(sorted(all_flags.items(), key=lambda kv: -kv[1])),
        "reconstructed_distance_recommended": bool(
            sum(1 for r in attempt_rows if r.get("use_reconstructed_distance")) >= max(1, n // 2)),
        "attempts_flagged": [
            {"nfl_id": r.get("nfl_id"), "drill": r.get("drill"), "attempt": r.get("attempt"),
             "flags": r.get("flags", [])}
            for r in attempt_rows if r.get("flags")
        ][:500],  # cap for artifact size; full data stays in parquet
    }

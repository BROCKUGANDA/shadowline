"""Mirror Response Index (MRI): change-of-direction movement quality metric.

MRI quantifies how efficiently an athlete decelerates, reorients and
re-accelerates during direction reversals, measured from 10 Hz position
tracking of Combine drills. It is designed for defensive backs whose coverage
job is to "mirror" a receiver: absorb a route break, re-orient the hips and
body, and exit the break without losing separation.

Components (per reversal event, aggregated per attempt / player)
---------------------------------------------------------------
1. reorientation_latency (RL)     [s]     Time from the speed minimum (plant)
   to recovery of ``recovery_threshold`` x entry speed.
2. turn_speed_retention (TSR)     [-]     Speed retained through the plant
   relative to the entry speed (v_min / v_entry).
3. directional_transition_efficiency (DTE) [-]  Net displacement over path
   length across the turn window (0, 1]; 1.0 = no wasted mileage.
4. exit_acceleration (EA)         [yd/s^2] Mean tangential acceleration after
   the plant over ``exit_window_s``.
5. attempt_consistency (CONS)     [-]     1 - CV across a player's attempts of
   the same drill; requires >= 2 attempts.

Composite: robust z-scores (median/MAD) of RL (sign-flipped), TSR, DTE, EA
within position x draft-cohort, weighted by split-half reliability when
estimable; requires >= ``min_components`` components; otherwise null.
Higher MRI = better change-of-direction quality.

IMPORTANT (research honesty rules):
* Each component is tested independently before the composite.
* The composite is NOT assumed valid because components can be computed.
* Sensitivity to every parameter is reported (see sensitivity_scan).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .kinematics import (accel_from_speed, cumulative_distance, detect_reversals,
                         moving_average, path_length)

DEFAULTS = {
    "heading_window_s": 0.5,
    "min_event_heading_change_deg": 60.0,
    "min_turn_angle_deg": 90.0,
    "merge_events_within_s": 0.4,
    "entry_band_s": (0.8, 0.2),
    "local_min_band_s": 0.3,
    "recovery_threshold": 0.7,
    "recovery_max_wait_s": 1.5,
    "path_window_s": 0.5,
    "exit_window_s": 0.5,
    "min_speed_for_heading_yd_s": 0.5,
    "smoothing_window_frames": 5,
}

COMPONENTS = ("reorientation_latency", "turn_speed_retention",
              "directional_transition_efficiency", "exit_acceleration")


@dataclass
class AttemptFeatures:
    """MRI features for one drill attempt."""
    nfl_id: int | None = None
    drill: str = ""
    attempt: int | None = None
    n_reversals: int = 0
    reorientation_latency: float | None = None
    turn_speed_retention: float | None = None
    directional_transition_efficiency: float | None = None
    exit_acceleration: float | None = None
    attempt_time_s: float | None = None
    path_length_yd: float | None = None
    mean_speed_yd_s: float | None = None
    peak_speed_yd_s: float | None = None
    quality_flags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "nfl_id": self.nfl_id, "drill": self.drill, "attempt": self.attempt,
            "n_reversals": self.n_reversals,
            "reorientation_latency": self.reorientation_latency,
            "turn_speed_retention": self.turn_speed_retention,
            "directional_transition_efficiency": self.directional_transition_efficiency,
            "exit_acceleration": self.exit_acceleration,
            "attempt_time_s": self.attempt_time_s,
            "path_length_yd": self.path_length_yd,
            "mean_speed_yd_s": self.mean_speed_yd_s,
            "peak_speed_yd_s": self.peak_speed_yd_s,
            "quality_flags": self.quality_flags,
        }


def _null_features(reason: str, **kwargs) -> AttemptFeatures:
    f = AttemptFeatures(**kwargs)
    f.quality_flags.append(reason)
    return f


def attempt_components(
    x: np.ndarray, y: np.ndarray, dt: float, *,
    heading_deg: np.ndarray | None = None,
    speed: np.ndarray | None = None,
    params: dict | None = None,
) -> AttemptFeatures:
    """Compute MRI components for ONE attempt (frame-aligned arrays).

    Missing-data behaviour: any component that cannot be validly measured is
    None (never imputed); the reason is recorded in quality_flags.
    """
    p = {**DEFAULTS, **(params or {})}
    x = np.asarray(x, float); y = np.asarray(y, float)
    n = len(x)
    if n < 10:
        return _null_features("too_few_frames", attempt_time_s=n * dt)

    # Frame-level kinematics (reconstructed from positions; raw s/a are kept
    # by the caller for cross-validation in the quality stage).
    if speed is None:
        speed = np.concatenate([[0.0], np.hypot(np.diff(x), np.diff(y)) / dt])
    if heading_deg is None:
        dx, dy = np.diff(x), np.diff(y)
        spd_step = np.hypot(dx, dy) / dt
        hd = np.empty(n)
        from .kinematics import heading, wrap_deg
        hd[0] = heading(dx[0], dy[0]) if spd_step[0] > p["min_speed_for_heading_yd_s"] else np.nan
        hd[1:] = np.where(spd_step > p["min_speed_for_heading_yd_s"],
                          wrap_deg(np.rad2deg(np.arctan2(dy, dx))), np.nan)
        # forward-fill undefined headings (stationary frames)
        idx = np.where(np.isfinite(hd))[0]
        if len(idx) < 3:
            return _null_features("heading_undefined", attempt_time_s=n * dt)
        hd = np.where(np.isfinite(hd), hd, hd[idx[0]])
        heading_deg = hd

    if speed is None or len(speed) != n:
        speed = np.concatenate([[0.0], np.hypot(np.diff(x), np.diff(y)) / dt])

    sm = moving_average(speed, p["smoothing_window_frames"])

    out = AttemptFeatures(
        attempt_time_s=n * dt,
        path_length_yd=path_length(x, y),
        mean_speed_yd_s=float(np.nanmean(speed)),
        peak_speed_yd_s=float(np.nanmax(sm)),
    )

    events = detect_reversals(
        heading_deg, speed, dt,
        heading_window_s=p["heading_window_s"],
        min_event_heading_change_deg=p["min_event_heading_change_deg"],
        min_turn_angle_deg=p["min_turn_angle_deg"],
        merge_events_within_s=p["merge_events_within_s"],
        min_speed_for_heading=p["min_speed_for_heading_yd_s"],
        smoothing_window=p["smoothing_window_frames"],
    )
    out.n_reversals = len(events)
    if not events:
        out.quality_flags.append("no_reversal_detected")
        return out

    rl_list, tsr_list, dte_list, ea_list = [], [], [], []
    for ev in events:
        c = ev["centre_idx"]
        # entry speed: robust speed in the entry band before the plant
        e_lo = max(0, int(c - p["entry_band_s"][0] / dt))
        e_hi = max(0, int(c - p["entry_band_s"][1] / dt))
        entry_band = sm[e_lo:e_hi] if e_hi > e_lo else sm[max(0, c - 1):c]
        v_entry = float(np.quantile(entry_band, 0.9)) if len(entry_band) else float(sm[max(0, c - 1)])

        # local minimum speed around the plant
        m_lo = max(0, int(c - p["local_min_band_s"] / dt))
        m_hi = min(n, int(c + p["local_min_band_s"] / dt) + 1)
        v_min = float(np.min(sm[m_lo:m_hi]))

        # 1. reorientation latency: time from plant until speed >= threshold*v_entry
        if v_entry > 0:
            thr = p["recovery_threshold"] * v_entry
            max_wait = int(p["recovery_max_wait_s"] / dt)
            rec_idx = None
            for j in range(c, min(n, c + max_wait)):
                if sm[j] >= thr:
                    rec_idx = j
                    break
            if rec_idx is not None:
                rl_list.append((rec_idx - c) * dt)
            # 2. turn-speed retention
            tsr_list.append(v_min / v_entry)

        # 3. DTE: net displacement / path length across the turn window
        p_lo = max(0, int(c - p["path_window_s"] / dt))
        p_hi = min(n - 1, int(c + p["path_window_s"] / dt))
        if p_hi > p_lo:
            net = float(np.hypot(x[p_hi] - x[p_lo], y[p_hi] - y[p_lo]))
            plen = float(cumulative_distance(x[p_lo:p_hi + 1], y[p_lo:p_hi + 1])[-1])
            if plen > 1e-6:
                dte_list.append(net / plen)

        # 4. exit acceleration: mean tangential accel after the plant
        x_hi = min(n, int(c + p["exit_window_s"] / dt) + 1)
        if x_hi > c + 1:
            acc = accel_from_speed(sm[c:x_hi], dt)
            ea_list.append(float(np.clip(np.mean(acc), -30.0, 30.0)))

    if rl_list:
        out.reorientation_latency = float(np.mean(rl_list))
    else:
        out.quality_flags.append("latency_unmeasured")
    if tsr_list:
        out.turn_speed_retention = float(np.mean(tsr_list))
    else:
        out.quality_flags.append("retention_unmeasured")
    if dte_list:
        out.directional_transition_efficiency = float(np.mean(dte_list))
    else:
        out.quality_flags.append("dte_unmeasured")
    if ea_list:
        out.exit_acceleration = float(np.mean(ea_list))
    else:
        out.quality_flags.append("exit_accel_unmeasured")

    # validity checks
    if out.reorientation_latency is not None and not (0.0 <= out.reorientation_latency <= p["recovery_max_wait_s"]):
        out.reorientation_latency = None
        out.quality_flags.append("latency_out_of_range")
    if out.turn_speed_retention is not None and not (0.0 <= out.turn_speed_retention <= 1.5):
        out.turn_speed_retention = None
        out.quality_flags.append("retention_out_of_range")
    if out.directional_transition_efficiency is not None and not (0.0 < out.directional_transition_efficiency <= 1.0):
        out.directional_transition_efficiency = None
        out.quality_flags.append("dte_out_of_range")
    return out


# ---------------------------------------------------------------------------
# Consistency + composite
# ---------------------------------------------------------------------------
def attempt_consistency(values: list[float], min_attempts: int = 2) -> float | None:
    """CONS = 1 - CV (coefficient of variation) across attempts. None if <2."""
    v = np.asarray([x for x in values if x is not None and np.isfinite(x)], float)
    if len(v) < min_attempts:
        return None
    mu = float(v.mean())
    if mu <= 1e-9:
        return None
    return float(1.0 - v.std(ddof=1) / mu)


def robust_z(values: np.ndarray) -> np.ndarray:
    """Median/MAD robust standardisation (outlier-resistant)."""
    v = np.asarray(values, float)
    if not np.isfinite(v).any():
        return np.full_like(v, np.nan)
    med = np.nanmedian(v)
    mad = np.nanmedian(np.abs(v - med))
    if mad < 1e-9:
        sd = np.nanstd(v)
        if sd < 1e-9:
            return np.zeros_like(v)
        return (v - med) / (1.4826 * sd)
    return (v - med) / (1.4826 * mad)


def mri_composite(
    rows: list[dict],
    *,
    reliability_weights: dict[str, float] | None = None,
    min_components: int = 3,
) -> list[dict]:
    """Compute the MRI composite for a cohort of players.

    ``rows``: list of dicts with keys nfl_id and any of the component names
    (player-level aggregated values). Returns rows with 'mri_composite' and
    'mri_components_used'. Higher = better. Latency is sign-flipped (lower
    latency is better). Cohort standardisation happens INSIDE this function:
    callers pass a single position x draft-year cohort.
    """
    comp_cols = ["reorientation_latency", "turn_speed_retention",
                 "directional_transition_efficiency", "exit_acceleration"]
    flip = {"reorientation_latency": -1.0}
    w = reliability_weights or {}

    def _lookup(row: dict, c: str) -> float:
        """Accept both bare and aggregated ('_mean') key variants."""
        for k in (c, f"{c}_mean"):
            v = row.get(k)
            if v is not None and isinstance(v, (int, float)) and np.isfinite(v):
                return float(v)
        return np.nan

    matrix = {c: np.array([_lookup(r, c) for r in rows], float) for c in comp_cols}
    z = {c: robust_z(matrix[c]) * flip.get(c, 1.0) for c in comp_cols}

    out = []
    for i, r in enumerate(rows):
        num, den, used = 0.0, 0.0, []
        for c in comp_cols:
            if np.isfinite(z[c][i]):
                weight = float(w.get(c, 1.0))
                num += z[c][i] * weight
                den += weight
                used.append(c)
        row = dict(r)
        row["mri_components_used"] = used
        row["mri_composite"] = float(num / den) if len(used) >= min_components else None
        out.append(row)
    return out


def sensitivity_scan(x: np.ndarray, y: np.ndarray, dt: float, grid: dict) -> dict:
    """Re-run component extraction over a parameter grid; report value ranges.

    Used to demonstrate that components are not knife-edge artifacts of the
    chosen parameters (Phase 3 sensitivity requirement).
    """
    results = {}
    keys = list(grid.keys())
    import itertools
    combos = list(itertools.product(*[grid[k] for k in keys]))
    for combo in combos:
        params = dict(zip(keys, combo))
        f = attempt_components(x, y, dt, params=params)
        for c in COMPONENTS:
            v = getattr(f, c)
            if v is not None:
                results.setdefault(c, []).append(round(v, 4))
    summary = {}
    for c, vals in results.items():
        arr = np.asarray(vals, float)
        summary[c] = {
            "n_parameter_combinations": len(vals),
            "min": float(arr.min()), "max": float(arr.max()),
            "median": float(np.median(arr)),
            "max_relative_spread": float((arr.max() - arr.min()) / max(abs(np.median(arr)), 1e-9)),
        }
    return summary


# ---------------------------------------------------------------------------
# Game-side mirror behaviour (shared with coverage.py)
# ---------------------------------------------------------------------------
def mirror_latency(
    defender_x: np.ndarray, defender_y: np.ndarray,
    receiver_x: np.ndarray, receiver_y: np.ndarray,
    event_idx: int, dt: float, *,
    error_threshold_deg: float = 30.0,
    sustain_s: float = 0.3,
    min_speed: float = 0.5,
    cap_s: float = 2.0,
) -> float | None:
    """Time after a receiver direction change until the defender is re-oriented
    toward the receiver: bearing-to-receiver vs defender heading error below
    ``error_threshold_deg`` sustained for ``sustain_s``. None if never."""
    n = min(len(defender_x), len(receiver_x))
    if event_idx >= n - 2:
        return None
    from .kinematics import angular_diff, heading
    sustain = max(1, int(sustain_s / dt))
    cap = int(cap_s / dt)
    streak = 0
    for j in range(event_idx, min(n, event_idx + cap)):
        dx, dy = np.diff(defender_x[j:j + 2])[0] if j + 1 < n else 0.0, \
                 np.diff(defender_y[j:j + 2])[0] if j + 1 < n else 0.0
        spd = np.hypot(dx, dy) / dt
        if spd < min_speed:
            streak = 0
            continue
        hd = heading(np.array([dx]), np.array([dy]))[0]
        br = heading(np.array([receiver_x[j] - defender_x[j]]),
                     np.array([receiver_y[j] - defender_y[j]]))[0]
        if angular_diff(hd, br) <= error_threshold_deg:
            streak += 1
            if streak >= sustain:
                return (j - event_idx) * dt
        else:
            streak = 0
    return None

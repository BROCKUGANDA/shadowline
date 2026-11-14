"""Kinematics: circular angle math, derivatives, smoothing, reversal detection.

This module is deliberately dependency-light (numpy only) so it can be
embedded verbatim in the standalone Kaggle notebook (see
scripts/build_notebook.py, which copies this file's source into the notebook
and runs a parity test against the same synthetic fixtures used here).

Conventions
-----------
* Angles are in DEGREES on the NFL convention: 0 degrees points along +x,
  90 along +y (values in [0, 360)).
* Heading = direction of the velocity vector, computed from (dx, dy).
* All derivative functions are sampling-frequency aware (dt per sample).
* Smoothing NEVER overwrites raw measurements: smoothed values are returned
  alongside; downstream consumers choose.
"""
from __future__ import annotations

import numpy as np

EPS = 1e-9


# ---------------------------------------------------------------------------
# Circular math
# ---------------------------------------------------------------------------
def wrap_deg(angle: float | np.ndarray) -> float | np.ndarray:
    """Wrap degrees to [0, 360). Handles negative and >360 inputs."""
    return np.mod(np.asarray(angle, dtype=float), 360.0)


def angular_diff(a: float | np.ndarray, b: float | np.ndarray) -> float | np.ndarray:
    """Smallest absolute angular difference between two headings, degrees.

    Correct across the 0/360 boundary: angular_diff(350, 10) == 20.
    """
    d = np.abs(wrap_deg(a) - wrap_deg(b)) % 360.0
    return np.minimum(d, 360.0 - d)


def circular_mean(angles: np.ndarray, weights: np.ndarray | None = None) -> float:
    """Circular mean via atan2 of mean sin/cos. Returns degrees in [0, 360)."""
    r = np.deg2rad(np.asarray(angles, dtype=float))
    if weights is None:
        s, c = np.sin(r).mean(), np.cos(r).mean()
    else:
        w = np.asarray(weights, dtype=float)
        s, c = (np.sin(r) * w).sum() / w.sum(), (np.cos(r) * w).sum() / w.sum()
    if abs(s) < EPS and abs(c) < EPS:
        return float("nan")
    deg = float(np.rad2deg(np.arctan2(s, c)) % 360.0)
    return 0.0 if deg > 360.0 - 1e-9 else deg  # guard 360.0 == 0.0 edge


def unwrap_deg(angles: np.ndarray) -> np.ndarray:
    """Continuous (unwrapped) version of a degree sequence, radians-free API."""
    return np.rad2deg(np.unwrap(np.deg2rad(wrap_deg(angles).astype(float))))


def heading(dx: np.ndarray, dy: np.ndarray) -> np.ndarray:
    """Movement heading in degrees [0, 360) from displacement components."""
    return wrap_deg(np.rad2deg(np.arctan2(dy, dx)))


def bearing(fx: np.ndarray, fy: np.ndarray, px: np.ndarray, py: np.ndarray) -> np.ndarray:
    """Bearing (degrees) from focus point (fx, fy) toward point (px, py)."""
    return heading(px - fx, py - fy)


# ---------------------------------------------------------------------------
# Derivatives (sampling-aware, central differences in the interior)
# ---------------------------------------------------------------------------
def time_steps(t: np.ndarray) -> np.ndarray:
    """Forward time differences; assumes t strictly increasing (validated by
    the quality module before this is used)."""
    return np.diff(np.asarray(t, dtype=float))


def speed_from_positions(x: np.ndarray, y: np.ndarray, dt: np.ndarray | float) -> np.ndarray:
    """Speed (yd/s) from consecutive positions. len == len(x)-1."""
    x = np.asarray(x, float); y = np.asarray(y, float)
    step = np.hypot(np.diff(x), np.diff(y))
    return step / dt if np.isscalar(dt) or np.ndim(dt) == 0 else step / dt


def accel_from_speed(s: np.ndarray, dt: np.ndarray | float) -> np.ndarray:
    """Tangential acceleration (yd/s^2), central differences in the interior."""
    s = np.asarray(s, float)
    ds = np.diff(s)
    if np.ndim(dt) != 0:
        ds = ds / dt
    else:
        ds = ds / float(dt)
    a = np.empty(len(s))
    a[1:-1] = (ds[1:] + ds[:-1]) / 2.0
    a[0], a[-1] = ds[0], ds[-1]
    return a


def path_length(x: np.ndarray, y: np.ndarray) -> float:
    """Total travelled distance from consecutive coordinates (yd).

    Used to RECONSTRUCT distance when the supplied `dis` field is unreliable:
    consumers should prefer this over the raw field after the quality module
    has validated `dis` against the same quantity.
    """
    return float(np.hypot(np.diff(np.asarray(x, float)),
                          np.diff(np.asarray(y, float))).sum())


def cumulative_distance(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Cumulative travelled distance, aligned to frames (len == len(x))."""
    steps = np.hypot(np.diff(np.asarray(x, float)), np.diff(np.asarray(y, float)))
    return np.concatenate([[0.0], np.cumsum(steps)])


# ---------------------------------------------------------------------------
# Smoothing (originals always preserved)
# ---------------------------------------------------------------------------
def moving_average(values: np.ndarray, window: int) -> np.ndarray:
    """Centered moving average with edge mirroring. window odd, >=1."""
    values = np.asarray(values, float)
    if window <= 1:
        return values.copy()
    if window % 2 == 0:
        window += 1
    pad = window // 2
    padded = np.pad(values, pad, mode="reflect")
    kernel = np.ones(window) / window
    return np.convolve(padded, kernel, mode="valid")


def smooth_heading(heading_deg: np.ndarray, window: int) -> np.ndarray:
    """Smooth an angular series correctly: unwrap -> smooth -> re-wrap."""
    unwrapped = unwrap_deg(heading_deg)
    return wrap_deg(moving_average(unwrapped, window))


# ---------------------------------------------------------------------------
# Reversal (direction-change) detection
# ---------------------------------------------------------------------------
def detect_reversals(
    heading_deg: np.ndarray,
    speed: np.ndarray,
    dt: float,
    *,
    heading_window_s: float = 0.5,
    min_event_heading_change_deg: float = 60.0,
    min_turn_angle_deg: float = 90.0,
    merge_events_within_s: float = 0.4,
    min_speed_for_heading: float = 0.5,
    smoothing_window: int = 5,
) -> list[dict]:
    """Detect direction-reversal events in a trajectory.

    Method
    ------
    1. Unwrap + smooth the heading series (circularly correct).
    2. Compute cumulative absolute heading change in a rolling window;
       flag frames where it exceeds ``min_event_heading_change_deg``.
    3. Within each candidate event, the reversal centre is the frame of
       minimum smoothed speed (biomechanical "plant").
    4. Accept the event if the NET heading change across the event window
       exceeds ``min_turn_angle_deg``.
    5. Merge events whose centres are within ``merge_events_within_s``.

    Returns a list of event dicts with indices and measured turn angle.
    """
    n = len(heading_deg)
    if n < 5:
        return []
    hs = smooth_heading(heading_deg, smoothing_window)
    ss = moving_average(speed, smoothing_window)
    unwrapped = unwrap_deg(hs)
    dtheta = np.diff(unwrapped)  # deg per frame

    w = max(1, int(round(heading_window_s / dt)))
    # rolling sum of |dtheta| over w frames
    kernel = np.ones(w)
    cum_change = np.convolve(np.abs(dtheta), kernel, mode="valid")  # len n-w
    # net change over the same window
    net_change = np.convolve(dtheta, kernel, mode="valid")

    # candidate frames: index i in cum_change corresponds to window ending at frame i+w
    hot = np.where(cum_change >= min_event_heading_change_deg)[0]

    events: list[dict] = []
    used = np.zeros(n, dtype=bool)
    for i in hot:
        centre = int(i + w // 2)
        if centre <= 0 or centre >= n - 1 or used[centre]:
            continue
        lo = max(0, centre - w)
        hi = min(n - 1, centre + w)
        # plant = min smoothed speed in the neighbourhood
        c_local = int(np.argmin(ss[lo:hi + 1])) + lo
        net = unwrapped[min(c_local + w, n - 1)] - unwrapped[max(c_local - w, 0)]
        if abs(net) < min_turn_angle_deg:
            continue
        used[max(0, c_local - w):min(n, c_local + w + 1)] = True
        events.append({
            "centre_idx": int(c_local),
            "start_idx": int(max(0, c_local - w)),
            "end_idx": int(min(n - 1, c_local + w)),
            "turn_angle_deg": float(abs(net)),
            "turn_sign": int(np.sign(net)),
        })

    # merge close events
    merged: list[dict] = []
    for ev in sorted(events, key=lambda e: e["centre_idx"]):
        if merged and (ev["centre_idx"] - merged[-1]["centre_idx"]) * dt < merge_events_within_s:
            if ev["turn_angle_deg"] > merged[-1]["turn_angle_deg"]:
                merged[-1] = ev
        else:
            merged.append(ev)
    return merged

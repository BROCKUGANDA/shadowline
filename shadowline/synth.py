"""Deterministic synthetic fixtures for TESTS and the labelled algorithm demo.

RULES (research honesty):
* These fixtures are used ONLY to (a) unit-test mathematical functions against
  known ground truth, (b) run the integration pipeline end-to-end in CI, and
  (c) power a clearly-labelled "algorithm demonstration" in the Tracking
  Laboratory UI. They are NEVER used as competition evidence and never
  presented as NFL results. Every artifact that contains synthetic data is
  marked with ``synthetic: true``.
"""
from __future__ import annotations

import numpy as np

DEMO_SEED = 2027
DEMO_LABEL = "SYNTHETIC DEMONSTRATION FIXTURE — NOT NFL DATA"


def smoothstep_vel(profile_t: np.ndarray, dt: float, rng: np.random.Generator,
                   noise: float = 0.0) -> np.ndarray:
    raise NotImplementedError  # (kept minimal; not used)


def synthetic_shuttle_attempt(
    *,
    dt: float = 0.1,
    start_speed: float = 7.0,
    plant_speed: float = 1.2,
    exit_speed: float = 6.0,
    noise_m: float = 0.01,
    seed: int = DEMO_SEED,
) -> dict:
    """A 20-yard short-shuttle-like trajectory with TWO 180-degree reversals.

    Geometry (yards): start at (0, 5), sprint +x for 10 yd, 180 deg reversal,
    sprint -x for 10 yd, second reversal, sprint +x for 10 yd. Speeds dip to
    ``plant_speed`` at each reversal. Ground truth component values are
    computed analytically where possible.

    Returns dict with arrays x, y, t, speed, heading and ground-truth metadata.
    """
    rng = np.random.default_rng(seed)

    def leg(v0: float, v1: float, v2: float, length: float, direction: int):
        """One leg: accelerate v0->v2, decelerate into the plant at v1."""
        # simple trapezoidal profile in distance
        n_acc = max(2, int(0.4 / dt))
        n_dec = max(2, int(0.5 / dt))
        speeds = np.concatenate([
            np.linspace(v0, v2, n_acc),
            np.full(2, v2),
            np.linspace(v2, v1, n_dec),
        ])
        dists = speeds * dt
        # scale to exactly `length` by stretching the cruise portion
        total = dists.sum()
        if total > 0:
            n_cruise = max(1, int(round((length - 0.0) / (v2 * dt))))
            cruise = np.full(n_cruise, v2)
            all_spd = np.concatenate([np.linspace(v0, v2, n_acc), cruise,
                                      np.linspace(v2, v1, n_dec)])
            d = all_spd * dt
            d = d * (length / d.sum())
            return all_spd, d
        return speeds, dists

    legs = [
        leg(start_speed, plant_speed, 6.5, 10.0, +1),
        leg(plant_speed, plant_speed, exit_speed, 10.0, -1),
        leg(exit_speed, plant_speed, 6.5, 10.0, +1),
    ]
    speeds = np.concatenate([l[0] for l in legs])
    seg_dirs = np.concatenate([np.full(len(legs[0][0]), +1.0),
                               np.full(len(legs[1][0]), -1.0),
                               np.full(len(legs[2][0]), +1.0)])
    dists = np.concatenate([l[1] for l in legs])

    x = np.concatenate([[0.0], np.cumsum(dists * seg_dirs)])
    x = x + rng.normal(0, noise_m, size=len(x))
    y = np.full_like(x, 5.0) + rng.normal(0, noise_m, size=len(x))
    t = np.arange(len(x)) * dt

    step_speed = np.hypot(np.diff(x), np.diff(y)) / dt
    speed = np.concatenate([[0.0], step_speed])
    from .kinematics import heading, wrap_deg
    hd = np.full(len(x), 0.0)
    hd[1:] = np.where(np.diff(x) >= 0, 0.0, 180.0)
    hd = wrap_deg(hd)

    # ground truth: reversals at the two plants (speed minima away from edges)
    interior_minima = [i for i in range(3, len(speed) - 3)
                       if speed[i] == speed[max(0, i - 2):i + 3].min()
                       and speed[i] < 3.0]
    # keep the two deepest minima (one per interior plant)
    gt_plants = sorted(interior_minima, key=lambda i: speed[i])[:2]

    return {
        "label": DEMO_LABEL,
        "synthetic": True,
        "x": x.tolist(), "y": y.tolist(), "t": t.tolist(),
        "speed": speed.tolist(), "heading": hd.tolist(),
        "dt": dt,
        "ground_truth": {
            "n_reversals": 2,
            "plant_indices": gt_plants,
            "plant_speed": plant_speed,
            "exit_speed": exit_speed,
        },
        "description": (
            "Synthetic short-shuttle-style trajectory: two 180-degree reversals "
            "with known plant speeds, generated with a fixed random seed. Used "
            "for algorithm validation and UI demonstration only."
        ),
    }


def synthetic_coverage_play(*, dt: float = 0.1, seed: int = 4242) -> dict:
    """Synthetic coverage rep: a defender mirroring a receiver that breaks out.

    Receiver runs +x 8 yd then breaks 90 deg toward +y. Defender starts 3 yd
    inside (offset -y) and must re-orient. Ground truth: separation at pass
    forward ~ known; mirror latency measurable.
    """
    rng = np.random.default_rng(seed)
    n1 = 55  # frames before break
    n2 = 40  # frames after break
    t = np.arange(n1 + n2 + 1) * dt

    # receiver: straight upfield then break toward +y at frame n1
    rx = np.concatenate([np.linspace(0, 8.0, n1), np.full(n2 + 1, 8.0)])
    ry = np.concatenate([np.full(n1, 5.0), np.linspace(5.0, 10.0, n2 + 1)])

    # defender: mirrors, offset 2.5 yd inside, reacts with a delay
    delay = 6  # frames of reaction delay (0.6 s)
    dx = np.concatenate([
        np.linspace(0, 7.4, n1),
        np.linspace(7.4, 8.4, 12),
        np.linspace(8.4, 8.4, n2 - 11),
    ])[:n1 + n2 + 1]
    dy = np.concatenate([
        np.full(n1, 2.5),
        np.full(len(t) - n1, 2.5),
    ])
    # after receiver break, defender closes toward the receiver's new path
    idx = np.arange(n1, len(t))
    dy[idx] = 2.5 + np.clip((idx - n1 - delay) * 0.06, 0, 3.4)

    rx = rx + rng.normal(0, 0.005, len(t))
    ry = ry + rng.normal(0, 0.005, len(t))
    dx = dx + rng.normal(0, 0.005, len(t))
    dy = dy + rng.normal(0, 0.005, len(t))

    sep = np.hypot(rx - dx, ry - dy)
    return {
        "label": DEMO_LABEL,
        "synthetic": True,
        "t": t.tolist(), "dt": dt,
        "receiver": {"x": rx.tolist(), "y": ry.tolist()},
        "defender": {"x": dx.tolist(), "y": dy.tolist()},
        "separation": sep.tolist(),
        "break_index": n1,
        "pass_forward_index": n1 + 25,   # 2.5 s after snap-ish; arbitrary demo
        "ground_truth": {
            "receiver_break_frame": n1,
            "defender_reaction_delay_s": delay * dt,
            "separation_at_pass_forward": float(sep[n1 + 25]),
        },
        "description": (
            "Synthetic coverage rep (out-break route vs off-coverage corner) "
            "with a known reaction delay. Used for algorithm validation and "
            "UI demonstration only."
        ),
    }


def synthetic_player_level_dataset(n_players: int = 60, *, effect: float = -0.35,
                                   seed: int = 99) -> dict:
    """Synthetic player-level dataset with a KNOWN effect for statistical
    framework testing (Phase 5 tests). Never used as evidence.

    Returns dict of arrays: mri, forty, shuttle, separation (outcome). The
    outcome is generated as: sep = a + effect*mri + b1*forty + noise, so the
    true partial effect of MRI (given forty) is ``effect``.
    """
    rng = np.random.default_rng(seed)
    mri = rng.normal(0, 1, n_players)
    forty = rng.normal(4.55, 0.12, n_players)
    shuttle = 4.35 + 0.1 * mri + rng.normal(0, 0.15, n_players)  # correlated with mri
    noise = rng.normal(0, 0.6, n_players)
    separation = 3.0 + effect * mri + 1.5 * (forty - 4.55) + noise
    return {
        "n_players": n_players, "mri": mri, "forty": forty,
        "shuttle": shuttle, "separation": separation,
        "true_mri_partial_effect": effect,
        "synthetic": True,
    }

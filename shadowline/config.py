"""Central configuration: paths, competition file registry, constants, seeds.

Every path can be overridden through environment variables so the pipeline can
run inside a Kaggle notebook, locally, or in CI without code changes.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from . import METRIC_VERSION, PIPELINE_VERSION

# --------------------------------------------------------------------------
# Paths (environment-overridable)
# --------------------------------------------------------------------------
REPO_ROOT = Path(os.environ.get("SHADOWLINE_ROOT", Path(__file__).resolve().parent.parent))
DATA_DIR = Path(os.environ.get("SHADOWLINE_DATA_DIR", REPO_ROOT / "data" / "raw"))
ARTIFACTS_DIR = Path(os.environ.get("SHADOWLINE_ARTIFACTS_DIR", REPO_ROOT / "artifacts"))

# Kaggle notebook default attachment path (used only when SHADOWLINE_DATA_DIR
# is unset AND the Kaggle input directory exists).
KAGGLE_INPUT_CANDIDATES = [
    Path("/kaggle/input/nfl-big-data-bowl-2027"),
    Path("/kaggle/input/nfl-big-data-bowl-2027/NFL Big Data Bowl 2027"),
]

# --------------------------------------------------------------------------
# Competition dataset registry (9 files, ~2.31 GiB, CC BY-NC 4.0)
# Source of truth: competition data page + host-verified discussion facts.
# --------------------------------------------------------------------------
COMPETITION_FILES: list[str] = [
    "players.csv",
    "combine_results.csv",
    "combine_tracking.csv",
    "player_career_successes.csv",
    "games.csv",
    "player_play.csv",
    "game_tracking_2023.csv",
    "game_tracking_2024.csv",
    "game_tracking_2025.csv",
]

GAME_TRACKING_YEARS = [2023, 2024, 2025]

# --------------------------------------------------------------------------
# Domain constants
# --------------------------------------------------------------------------
SAMPLING_HZ = 10.0          # Zebra optical/radio tracking at 10 Hz (host-verified)
EXPECTED_DT = 1.0 / SAMPLING_HZ

NFL_FIELD_LENGTH_YD = 120.0  # including end zones (0..120 along x)
NFL_FIELD_WIDTH_YD = 53.3    # 0..53.3 along y

MAX_SPEED_YD_S = 12.0        # no NFL player sustains > ~12 yd/s; combine peaks ~11
MAX_ACCEL_YD_S2 = 15.0       # generous upper bound for elite sprint acceleration

REGULAR_SEASON = "REG"        # primary analyses use regular-season games only
POST_SEASON = "POST"
PRE_SEASON = "PRE"

# Draft cohorts in scope (host-verified: 510 rookies, 2023-2025)
DRAFT_COHORTS = [2023, 2024, 2025]

# Position focus of the SHADOWLINE research hypothesis: defensive backs.
# The 2027 player_play.csv uses granular alignment labels (CB, SLOT_CB,
# HIGH_SAFETY, ...) rather than the coarse CB/S labels of earlier editions.
DB_POSITIONS_RAW = {"CB", "S", "DB", "FS", "SS", "SAF", "CORNERBACK", "SAFETY",
                    "SLOT_CB", "SLOT_CORNER", "HIGH_SAFETY", "FREE_SAFETY",
                    "STRONG_SAFETY", "NICKEL", "DIME", "MIKE_SAFETY"}
POSITION_GROUPS = {
    "DB": DB_POSITIONS_RAW,
    "WR": {"WR", "WIDE_RECEIVER", "SLOT_WR", "SLOT", "X", "Z", "H", "Y"},
    "TE": {"TE", "TIGHT_END"},
    "OL": {"OL", "G", "T", "C", "OG", "OT", "CENTER", "GUARD", "TACKLE",
           "INTERIOR_LINE", "IOL", "EDGE_OL"},
    "DL": {"DL", "DE", "DT", "EDGE", "DEFENSIVE_END", "DEFENSIVE_TACKLE",
           "INTERIOR_D", "NT", "DE/DT"},
    "FB": {"FB", "RB", "HB", "FULLBACK", "RUNNING_BACK"},
    "LB": {"LB", "ILB", "OLB", "MLB", "LINEBACKER", "MIKE", "WILL", "SAM"},
    "QB": {"QB", "QUARTERBACK"},
    "ST": {"K", "P", "LS", "KICKER", "PUNTER", "LONG_SNAPPER"},
}

# Canonical Combine drill taxonomy. Raw drill labels in combine_results /
# combine_tracking are canonicalised through this map (case-insensitive,
# whitespace/underscore-normalised). Unmapped labels are reported, never
# silently dropped.
CANONICAL_DRILLS: dict[str, str] = {
    "40_yard_dash": "forty",
    "forty": "forty",
    "40": "forty",
    "forty_yard_dash": "forty",
    "three_cone": "three_cone",
    "3_cone": "three_cone",
    "three_cone_drill": "three_cone",
    "20_yard_shuttle": "short_shuttle",
    "short_shuttle": "short_shuttle",
    "shuttle": "short_shuttle",
    "5_10_5": "short_shuttle",
    "60_yard_shuttle": "long_shuttle",
    "long_shuttle": "long_shuttle",
    "broad_jump": "broad_jump",
    "vertical_jump": "vertical_jump",
    "bench_press": "bench_press",
    "position_drill": "position_drill",
    "positional_drill": "position_drill",
    "on_campus": "on_campus_workout",
    "pro_day": "pro_day_workout",
}

# Drills that contain direction reversals and therefore can yield MRI
# components. Linear sprints (forty) cannot by construction.
MRI_ELIGIBLE_DRILLS = {"short_shuttle", "long_shuttle", "three_cone", "position_drill"}

# --------------------------------------------------------------------------
# MRI (Mirror Response Index) parameters -- see shadowline/mri.py for the
# mathematical definitions of each component.
# --------------------------------------------------------------------------
MRI_PARAMETERS = {
    "heading_window_s": 0.5,        # rolling window for cumulative heading change
    "min_event_heading_change_deg": 60.0,  # heading change within window to flag event
    "min_turn_angle_deg": 90.0,     # net heading change to accept a reversal
    "merge_events_within_s": 0.4,   # merge reversal events closer than this
    "entry_band_s": [0.8, 0.2],     # [lookback start, end] before turn centre
    "local_min_band_s": 0.3,        # +/- band around centre for speed local min
    "recovery_threshold": 0.7,      # fraction of entry speed for latency
    "recovery_max_wait_s": 1.5,     # cap on latency measurement
    "path_window_s": 0.5,           # window for DTE path efficiency
    "exit_window_s": 0.5,           # window for exit acceleration
    "min_speed_for_heading_yd_s": 0.5,  # below this speed heading is undefined
    "smoothing_window_frames": 5,   # moving-average window (odd) for speed/heading
}

# Sensitivity grid (Phase 3 requirement: sensitivity analysis of parameters)
MRI_SENSITIVITY_GRID = {
    "recovery_threshold": [0.6, 0.7, 0.8],
    "path_window_s": [0.4, 0.5, 0.6],
    "exit_window_s": [0.4, 0.5, 0.6],
    "smoothing_window_frames": [3, 5, 7],
}

# --------------------------------------------------------------------------
# Coverage analysis parameters (Phase 4)
# --------------------------------------------------------------------------
COVERAGE_PARAMETERS = {
    "min_coverage_plays": 20,        # player-level exposure threshold
    "separation_open_yd": 3.0,       # "open" definition at pass forward
    "tight_window_yd": 1.0,          # tight-coverage exposure window
    "mirror_error_threshold_deg": 30.0,
    "mirror_sustain_s": 0.3,
    "recovery_cap_s": 2.0,
    "coverage_window_pre_snap_s": 0.0,   # from ball snap
    "coverage_window_post_whistle_s": 4.0,
}

# --------------------------------------------------------------------------
# Research / statistics parameters (Phase 5)
# --------------------------------------------------------------------------
RESEARCH_PARAMETERS = {
    "alpha": 0.05,
    "n_bootstrap": 1000,
    "n_permutation": 5000,
    "cv_folds": 5,
    "random_seed": 20271106,          # fixed for reproducibility
    "min_attempts_for_consistency": 2,
    "min_components_for_composite": 3,
    "outlier_mad_z": 4.0,
}

# Primary hypothesis (pre-registered before any outcome data is inspected;
# see artifacts/v1/experiment_register.json).
PRIMARY_OUTCOME = "sep_at_pass_forward_mean"   # exposure-weighted mean separation (yd)
PRIMARY_PREDICTOR = "mri_composite"
PRIMARY_HYPOTHESIS = (
    "Among defensive backs with >= 20 regular-season coverage opportunities, "
    "the Mirror Response Index composite (higher = better change-of-direction "
    "quality at the Combine) is associated with lower mean separation allowed "
    "at pass forward, after adjustment for traditional Combine measurements "
    "(Model B vs Model A)."
)


def resolve_data_dir() -> Path:
    """Resolve the raw data directory, falling back to Kaggle attachment paths."""
    env = os.environ.get("SHADOWLINE_DATA_DIR")
    if env:
        return Path(env)
    if DATA_DIR.exists() and any(DATA_DIR.glob("*.csv")):
        return DATA_DIR
    for cand in KAGGLE_INPUT_CANDIDATES:
        if cand.exists() and any(cand.rglob("players.csv")):
            return cand
    return DATA_DIR


def git_commit() -> str | None:
    """Best-effort current git commit hash (provenance)."""
    import subprocess
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT,
            capture_output=True, text=True, timeout=10, check=False,
        )
        return out.stdout.strip() or None
    except Exception:
        return None


@dataclass(frozen=True)
class Versions:
    pipeline: str = PIPELINE_VERSION
    metric: str = METRIC_VERSION
    python: str = field(default_factory=lambda: __import__("sys").version.split()[0])


VERSIONS = Versions()

/**
 * Methodology reference constants.
 *
 * IMPORTANT — these are NOT dataset content and are never rendered as data.
 * They are static documentation transcribed from the SHADOWLINE pipeline
 * source (shadowline/config.py, shadowline/schemas.py, shadowline/coverage.py,
 * docs/reproducibility.md) so the platform can explain its own methods while
 * the competition dataset is gated. Every table that uses them is labelled
 * "Methodology reference". Analytical values come only from artifacts/v1.
 */

export const METHOD_SOURCE_NOTE =
  "Methodology reference — transcribed from the SHADOWLINE pipeline source (shadowline/config.py, schemas.py, coverage.py, docs/reproducibility.md). Not dataset content.";

// ---------------------------------------------------------------------------
// Dataset ingestion / activation
// ---------------------------------------------------------------------------
export interface IngestStep {
  title: string;
  detail: string;
}

export const INGEST_STEPS: IngestStep[] = [
  {
    title: "Join the competition and download the data",
    detail:
      "Join nfl-big-data-bowl-2027 on Kaggle and download the 9 CSVs from the Data tab (CC BY-NC 4.0; must not be redistributed).",
  },
  {
    title: "Place the files in the raw data directory",
    detail:
      "Copy the 9 competition CSVs into data/raw/ (or point SHADOWLINE_DATA_DIR at the Kaggle input attachment).",
  },
  {
    title: "Re-run the pipeline",
    detail:
      "python -m shadowline all — data-gated stages switch on automatically and rewrite the artifacts under artifacts/v1/.",
  },
  {
    title: "Refresh this app",
    detail:
      "The web app never recomputes; it re-reads artifacts/v1 and the gated modules unlock.",
  },
];

export const INGEST_COMMAND = `# 1. place the 9 competition CSVs in the raw data directory
cp ~/Downloads/nfl-big-data-bowl-2027/*.csv /home/z/my-project/data/raw/
# (or: export SHADOWLINE_DATA_DIR=/kaggle/input/nfl-big-data-bowl-2027)

# 2. re-run every stage; gated stages switch on automatically
python -m shadowline all

# 3. refresh the web app (it only re-reads artifacts/v1)`;

export const REPRODUCTION_COMMANDS = `# Pin the environment
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Re-run the deterministic pipeline (fixed seeds, no wall-clock dependence)
python -m shadowline audit
python -m shadowline quality
python -m shadowline features
python -m shadowline coverage
python -m shadowline research
# or everything at once:
python -m shadowline all

# Verify with the test suite (89 tests)
python -m pytest tests/ -q`;

// ---------------------------------------------------------------------------
// Canonical Combine drill taxonomy (shadowline/config.py)
// ---------------------------------------------------------------------------
export interface DrillDoc {
  canonical: string;
  aliases: string;
  description: string;
  reversals: string;
  mriEligible: boolean;
}

export const DRILL_TAXONOMY: DrillDoc[] = [
  {
    canonical: "forty",
    aliases: "40_yard_dash · 40 · forty_yard_dash",
    description:
      "40-yard dash: linear sprint. Timed result (seconds); traditional Combine input for Model A.",
    reversals: "0 (linear sprint — cannot yield MRI by construction)",
    mriEligible: false,
  },
  {
    canonical: "short_shuttle",
    aliases: "20_yard_shuttle · shuttle · 5_10_5",
    description:
      "20-yard shuttle (5-10-5): lateral sprint out-and-back with two 180° direction reversals.",
    reversals: "2 (180° out-and-back; detected per attempt at ≥ 90° net heading change)",
    mriEligible: true,
  },
  {
    canonical: "long_shuttle",
    aliases: "60_yard_shuttle",
    description:
      "60-yard shuttle: extended out-and-back shuttle; the longest of the reversal drills.",
    reversals: "detected per attempt (multi-reversal by design)",
    mriEligible: true,
  },
  {
    canonical: "three_cone",
    aliases: "3_cone · three_cone_drill",
    description:
      "Three-cone drill (L-drill): tight 180°/90° cornering around three cones.",
    reversals: "detected per attempt (multiple direction changes by design)",
    mriEligible: true,
  },
  {
    canonical: "position_drill",
    aliases: "positional_drill",
    description:
      "Position-specific drills run at the Combine; labels are canonicalised, shape varies by position group.",
    reversals: "varies by drill design (detected per attempt)",
    mriEligible: true,
  },
  {
    canonical: "broad_jump",
    aliases: "—",
    description: "Broad jump: standing two-foot jump; measured in inches.",
    reversals: "0 (stationary jump event)",
    mriEligible: false,
  },
  {
    canonical: "vertical_jump",
    aliases: "—",
    description: "Vertical jump: standing leap; measured in inches.",
    reversals: "0 (stationary jump event)",
    mriEligible: false,
  },
  {
    canonical: "bench_press",
    aliases: "—",
    description: "Bench press: repetitions at 225 lb.",
    reversals: "0 (stationary event)",
    mriEligible: false,
  },
  {
    canonical: "on_campus_workout",
    aliases: "on_campus",
    description:
      "On-campus workout entries (pro-day style records); retained for audit, not MRI-eligible.",
    reversals: "n/a (record type, not a tracked drill)",
    mriEligible: false,
  },
  {
    canonical: "pro_day_workout",
    aliases: "pro_day",
    description:
      "Pro-day workout entries; retained for audit, not MRI-eligible.",
    reversals: "n/a (record type, not a tracked drill)",
    mriEligible: false,
  },
];

// ---------------------------------------------------------------------------
// players.csv expected schema (shadowline/schemas.py — PLAYERS FileSpec)
// ---------------------------------------------------------------------------
export interface ColumnDoc {
  name: string;
  required: boolean;
  dtype: string;
  description: string;
  verification: "VERIFIED" | "CONVENTION" | "INFERRED";
  aliases: string;
}

export const PLAYERS_SCHEMA: ColumnDoc[] = [
  {
    name: "nfl_id",
    required: true,
    dtype: "int64",
    description: "Player identity key (join key to all files).",
    verification: "VERIFIED",
    aliases: "nflId · nflId_combined",
  },
  {
    name: "display_name",
    required: true,
    dtype: "utf8",
    description: "Player name.",
    verification: "CONVENTION",
    aliases: "displayName · name",
  },
  {
    name: "position",
    required: true,
    dtype: "utf8",
    description: "Roster position (CB/S/WR/TE/OL/DL/...).",
    verification: "VERIFIED",
    aliases: "roster_position · position_group",
  },
  {
    name: "height",
    required: false,
    dtype: "utf8",
    description: "Height (format to be reconciled at ingest).",
    verification: "CONVENTION",
    aliases: "—",
  },
  {
    name: "weight",
    required: false,
    dtype: "float64",
    description: "Weight (lb).",
    verification: "CONVENTION",
    aliases: "—",
  },
  {
    name: "birth_date",
    required: false,
    dtype: "utf8",
    description: "Birth date.",
    verification: "CONVENTION",
    aliases: "birthDate · dob",
  },
  {
    name: "college_name",
    required: false,
    dtype: "utf8",
    description: "College.",
    verification: "CONVENTION",
    aliases: "collegeName",
  },
  {
    name: "draft_year",
    required: false,
    dtype: "int64",
    description: "Draft/cohort year 2023-2025.",
    verification: "INFERRED",
    aliases: "season · cohort_year",
  },
  {
    name: "draft_round",
    required: false,
    dtype: "int64",
    description: "Draft round (null = UDFA).",
    verification: "INFERRED",
    aliases: "—",
  },
  {
    name: "draft_pick",
    required: false,
    dtype: "int64",
    description: "Overall draft slot.",
    verification: "INFERRED",
    aliases: "—",
  },
];

export const PLAYERS_FILE_NOTE =
  "One row per player: the 510 rookies (draft classes 2023-2025). Key: nfl_id. Declared by shadowline/schemas.py; the audit stage reconciles actual columns (including alias drift) the moment the real file is present — see Dataset & Pipeline Health.";

// ---------------------------------------------------------------------------
// Coverage methodology (shadowline/coverage.py + config.py + schemas.py)
// ---------------------------------------------------------------------------
export const COVERAGE_ASSOCIATION_POLICY =
  "Receiver association: targeted first, else nearest at pass-forward. The proximity fallback is an approximation and is ALWAYS reported, never silently equated with the assigned defender-receiver matchup.";

export const COVERAGE_REG_FILTER =
  "Primary analyses use regular-season games only: the play universe is filtered to game_type == 'REG' before any coverage metric is computed (POST/PRE excluded).";

export const COVERAGE_OUTCOME_DEFINITION =
  "sep_at_pass_forward_mean — exposure-weighted mean separation allowed at pass forward (yards). The underlying per-play value (separation_at_pass_forward) is host-verified: distance to nearest opponent (receiver/defender) at pass forward.";

export const COVERAGE_EXPOSURE_NOTE =
  "Insufficient playing time is never treated as poor athletic ability: players below the exposure threshold are analysed as exposure, not ability (13 players never played a regular-season snap).";

/** Human labels for the machine coverage_parameters keys (config.py comments). */
export const COVERAGE_PARAM_NOTES: Record<string, string> = {
  min_coverage_plays: "player-level exposure threshold (plays)",
  separation_open_yd: "\"open\" definition at pass forward (yd)",
  tight_window_yd: "tight-coverage exposure window (yd)",
  mirror_error_threshold_deg: "mirror event: max tracking error (deg)",
  mirror_sustain_s: "mirror event: minimum sustain (s)",
  recovery_cap_s: "separation recovery cap (s)",
  coverage_window_pre_snap_s: "coverage window start (s before snap)",
  coverage_window_post_whistle_s: "coverage window end (s after whistle)",
};

export const UNITS_BY_COVERAGE_KEY: Record<string, string> = {
  min_coverage_plays: "plays",
  separation_open_yd: "yd",
  tight_window_yd: "yd",
  mirror_error_threshold_deg: "deg",
  mirror_sustain_s: "s",
  recovery_cap_s: "s",
  coverage_window_pre_snap_s: "s",
  coverage_window_post_whistle_s: "s",
};

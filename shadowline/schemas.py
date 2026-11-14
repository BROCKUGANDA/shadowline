"""Declared expected schemas for the 9 competition files + reconciliation.

Verification levels
-------------------
* ``verified``   : column name confirmed from host statements / competition
                   data-page excerpts (see docs/data_dictionary.md for sources).
* ``convention`` : expected from prior Big Data Bowl tracking datasets
                   (2020-2025); validated against the actual file at ingest.
* ``required``   : the pipeline's spatial/key dependencies. A missing required
                   column is a hard failure for that file.

The reconciler NEVER guesses silently: when a real file is present, actual
columns are compared against this registry and every mismatch is reported in
the dataset audit artifact. Alias sets handle snake_case/camelCase drift.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Verification(str, Enum):
    VERIFIED = "verified"        # host-confirmed
    CONVENTION = "convention"    # prior-BDB convention, runtime-validated
    INFERRED = "inferred"        # strongly implied by host descriptions


@dataclass(frozen=True)
class ColumnSpec:
    name: str
    dtype: str                     # polars-style: int64, float64, utf8, datetime
    required: bool = False
    description: str = ""
    verification: Verification = Verification.CONVENTION
    aliases: tuple[str, ...] = ()  # accepted alternative spellings


@dataclass(frozen=True)
class FileSpec:
    filename: str
    key_columns: tuple[str, ...]
    columns: tuple[ColumnSpec, ...]
    description: str = ""
    notes: str = ""
    # Optional suffix: file may carry additional undocumented columns; they are
    # captured dynamically and documented in the audit (e.g. career_* metrics).
    allow_extra: bool = True


def _c(name, dtype, required=False, desc="", ver=Verification.CONVENTION, aliases=()):
    return ColumnSpec(name=name, dtype=dtype, required=required,
                      description=desc, verification=ver, aliases=tuple(aliases))


PLAYERS = FileSpec(
    filename="players.csv",
    key_columns=("nfl_id",),
    description="One row per player: the 510 rookies (draft classes 2023-2025).",
    columns=(
        _c("nfl_id", "int64", True, "Player identity key (join key to all files).",
           Verification.VERIFIED, ("nflId", "nflId_combined")),
        _c("display_name", "utf8", True, "Player name.", Verification.VERIFIED,
           ("displayName", "name")),
        _c("nfl_position", "utf8", True,
           "Roster position (CB/S/WR/TE/OL/DL/EDGE/...).", Verification.VERIFIED,
           ("position", "roster_position", "position_group")),
        # height/weight live in combine_results.csv (combine_height/combine_weight)
        _c("birth_date", "utf8", False, "Birth date.", Verification.VERIFIED,
           ("birthDate", "dob")),
        _c("college_name", "utf8", False, "College.", Verification.VERIFIED,
           ("collegeName",)),
        _c("college_conference", "utf8", False, "College conference.",
           Verification.VERIFIED),
        _c("draft_year", "int64", False, "Draft/cohort year 2023-2025.",
           Verification.VERIFIED, ("season", "cohort_year")),
        _c("draft_round", "int64", False, "Draft round (null = UDFA).",
           Verification.VERIFIED),
        _c("draft_pick_within_round", "int64", False, "Pick within round.",
           Verification.VERIFIED),
        _c("draft_overall_pick", "int64", False, "Overall draft slot.",
           Verification.VERIFIED, ("draft_pick",)),
    ),
)

COMBINE_RESULTS = FileSpec(
    filename="combine_results.csv",
    key_columns=("nfl_id",),
    description=(
        "Traditional, stop-watch/measured Combine drill results per player, "
        "WIDE format: one column per drill (forty, three_cone, short_shuttle, "
        "broad_jump, vertical, ten_yd_split, bench_reps) + NGS scores."
    ),
    columns=(
        _c("nfl_id", "int64", True, "Player key.", Verification.VERIFIED, ("nflId",)),
        _c("draft_year", "int64", False, "Combine/cohort year.", Verification.VERIFIED,
           ("year", "combine_year")),
        _c("combine_position", "utf8", False, "Position group at the Combine.",
           Verification.VERIFIED),
        _c("combine_height", "float64", False,
           "Height in inches (decimal, e.g. 77.875).", Verification.VERIFIED),
        _c("combine_weight", "float64", False, "Weight (lb).", Verification.VERIFIED),
        _c("hand_size", "float64", False, "Hand size (in).", Verification.VERIFIED),
        _c("arm_length", "float64", False, "Arm length (in).", Verification.VERIFIED),
        _c("wing_span", "float64", False, "Wingspan (in).", Verification.VERIFIED),
        _c("ten_yd_split", "float64", False, "10-yard split (s).",
           Verification.VERIFIED, ("result", "time")),
        _c("forty", "float64", False, "40-yard dash (s).", Verification.VERIFIED,
           ("result", "time")),
        _c("vertical", "float64", False, "Vertical jump (in).", Verification.VERIFIED),
        _c("broad_jump", "float64", False, "Broad jump (in).", Verification.VERIFIED),
        _c("three_cone", "float64", False, "3-cone drill (s).", Verification.VERIFIED),
        _c("short_shuttle", "float64", False, "20-yard short shuttle (s).",
           Verification.VERIFIED),
        _c("bench_reps", "float64", False, "225 lb bench reps.", Verification.VERIFIED),
        _c("ngs_athleticism_score", "float64", False, "NGS athleticism score.",
           Verification.VERIFIED),
        _c("ngs_college_production_score", "float64", False,
           "NGS college production score.", Verification.VERIFIED),
        _c("ngs_final_score", "float64", False, "NGS final score.",
           Verification.VERIFIED),
    ),
    notes=(
        "WIDE format: SHADOWLINE reshapes to long (nfl_id, drill, result) at "
        "load via combine.py:load_results."
    ),
)

COMBINE_TRACKING = FileSpec(
    filename="combine_tracking.csv",
    key_columns=("nfl_id", "drill_type", "drill_name", "attempt", "event_id"),
    description=(
        "10 Hz optical/radio sensor tracking across 6,307 Combine drill attempts "
        "(Zebra chips, host-verified). One row per player per 0.1 s frame; "
        "entity_type separates PLAYER and BALL tracks."
    ),
    columns=(
        _c("draft_year", "int64", False, "Combine/cohort year.", Verification.VERIFIED),
        _c("event_id", "utf8", True,
           "Stable attempt identifier: <session>_<event_id> (player x drill x run).",
           Verification.VERIFIED),
        _c("nfl_id", "int64", True,
           "Player key. Ball rows are marked by entity_type and filtered at ingest.",
           Verification.VERIFIED, ("nflId",)),
        _c("entity_type", "utf8", True,
           "Track entity: PLAYER or BALL.", Verification.VERIFIED,
           ("entity", "track_type", "track")),
        _c("time", "utf8", False,
           "ISO-8601 timestamp at 10 Hz (e.g. 2025-03-02T18:56:38.200).",
           Verification.VERIFIED, ("timestamp", "time_s", "t")),
        _c("drill_type", "utf8", True,
           "Drill family (FORTY_YARD_DASH, SHORT_SHUTTLE, THREE_CONE_DRILL, "
           "SKILL_DRILLS_DB/DL/OL/TE/WR/LB).", Verification.VERIFIED,
           ("drill", "drill_name")),
        _c("drill_name", "utf8", True,
           "Specific drill label (e.g. BACK_PEDAL_AND_TRANSITION_45_DEGREE_REACTION, "
           "POST_CORNER_ROUTE_RIGHT); canonicalised at ingest.",
           Verification.VERIFIED, ("drill", "drill_type")),
        _c("attempt", "int64", False, "Attempt/run number within player+drill.",
           Verification.VERIFIED, ("attempt_id", "attempt_number", "run")),
        _c("x", "float64", True, "Long-axis position (yards).", Verification.VERIFIED),
        _c("y", "float64", True, "Short-axis position (yards).", Verification.VERIFIED),
        _c("s", "float64", False, "Speed (yd/s).", Verification.VERIFIED, ("speed",)),
        _c("a", "float64", False, "Acceleration (yd/s^2).", Verification.VERIFIED,
           ("accel", "acceleration")),
        _c("dis", "float64", False, "Distance travelled since previous frame (yd).",
           Verification.VERIFIED, ("distance", "dist")),
        _c("dir", "float64", False, "Movement direction (deg, 0-360).",
           Verification.VERIFIED, ("direction", "o", "orientation")),
    ),
    notes=(
        "No frame_id column: frame index is reconstructed as a 10 Hz counter "
        "per (nfl_id, event_id) at load (combine.py:load_frames). Long-format "
        "wide drill results live in combine_results.csv instead."
    ),
)

CAREER_SUCCESSES = FileSpec(
    filename="player_career_successes.csv",
    key_columns=("nfl_id",),
    description=(
        "Career success counters per player (career_* int64 columns; "
        "host-verified examples: career_special_teams_snaps, career_games_active)."
    ),
    columns=(
        _c("nfl_id", "int64", True, "Player key.", Verification.VERIFIED, ("nflId",)),
        _c("career_special_teams_snaps", "int64", False,
           "Cumulative career special-teams snaps.", Verification.VERIFIED),
        _c("career_games_active", "int64", False,
           "Total career games active.", Verification.VERIFIED),
        _c("career_games_played", "int64", False,
           "Total career games played.", Verification.INFERRED),
        _c("career_defensive_snaps", "int64", False,
           "Cumulative career defensive snaps.", Verification.INFERRED),
        _c("career_offensive_snaps", "int64", False,
           "Cumulative career offensive snaps.", Verification.INFERRED),
    ),
    notes=(
        "This file is expected to carry additional undocumented career_* columns; "
        "they are captured dynamically, typed and documented in the audit."
    ),
)

GAMES = FileSpec(
    filename="games.csv",
    key_columns=("game_id",),
    description="One row per game (1,002 regular-season and playoff games, host-verified).",
    columns=(
        _c("game_id", "int64", True, "Game key.", Verification.VERIFIED, ("gameId",)),
        _c("game_key", "utf8", False, "Host game key.", Verification.VERIFIED),
        _c("season", "int64", True, "Season year (2023-2025).", Verification.VERIFIED),
        _c("season_type", "utf8", True,
           "REG / POST / PRE. Primary analyses filter REG.",
           Verification.VERIFIED, ("gameType", "game_type")),
        _c("week", "int64", False, "Week number.", Verification.VERIFIED),
        _c("home_team_abbr", "utf8", False, "Home club.", Verification.VERIFIED,
           ("homeTeamAbbr", "home_team")),
        _c("visitor_team_abbr", "utf8", False, "Visitor club.", Verification.VERIFIED,
           ("visitorTeamAbbr", "away_team")),
    ),
)

PLAYER_PLAY = FileSpec(
    filename="player_play.csv",
    key_columns=("game_id", "play_id", "nfl_id"),
    description=(
        "Per-play participation and outcome (314,197 rows, host-verified). "
        "Composite key (game_id, play_id, nfl_id) verified."
    ),
    columns=(
        _c("game_id", "int64", True, "Game key.", Verification.VERIFIED, ("gameId",)),
        _c("play_id", "int64", True, "Play key.", Verification.VERIFIED, ("playId",)),
        _c("nfl_id", "int64", True, "Player key.", Verification.VERIFIED, ("nflId",)),
        _c("team_abbr", "utf8", False, "Player's club on the play.",
           Verification.VERIFIED),
        _c("lined_up_position", "utf8", False,
           "Lined-up position (CB, S, SLOT_CB, HIGH_SAFETY, WR, EDGE, ...); "
           "integer/blank marks a play killed by pre-snap penalty.",
           Verification.VERIFIED),
        _c("pass_result", "utf8", False,
           "Pass outcome class (e.g. 2x2 = caught).", Verification.VERIFIED),
        _c("separation_at_pass_forward", "float64", False,
           "Distance to nearest opponent (receiver/defender) at pass forward "
           "(yards). Primary coverage outcome in SHADOWLINE.",
           Verification.VERIFIED),
        _c("cushion", "float64", False, "Receiver cushion at the snap (yd).",
           Verification.VERIFIED),
        _c("route_ran", "utf8", False, "Route the receiver ran.", Verification.VERIFIED),
        _c("coverage_assignment", "utf8", False, "Coverage assignment.",
           Verification.VERIFIED),
        _c("coverage_assignment_at_snap", "utf8", False,
           "Coverage assignment at the snap.", Verification.VERIFIED),
        _c("team_coverage_type", "utf8", False, "Team coverage type (man/zone).",
           Verification.VERIFIED),
    ),
    notes=(
        "player_play.csv in prior BDB editions carries 100+ per-play columns "
        "(targets, PFF roles, pressures, ...). They are captured dynamically at "
        "ingest and catalogued in the audit."
    ),
)


def _game_tracking(year: int) -> FileSpec:
    return FileSpec(
        filename=f"game_tracking_{year}.csv",
        key_columns=("game_id", "play_id", "nfl_id"),
        description=(
            f"Frame-level 10 Hz tracking for the {year} season. One row per "
            f"(play, player, frame); events are marked by the `event` column "
            f"(ball_snap, pass_forward, ...). No frame_id column: the frame index "
            f"is reconstructed at load from the 10 Hz cadence."
        ),
        columns=(
            _c("game_id", "int64", True, "Game key.", Verification.VERIFIED, ("gameId",)),
            _c("play_id", "int64", True, "Play key.", Verification.VERIFIED, ("playId",)),
            _c("nfl_id", "int64", True, "Player key.", Verification.VERIFIED, ("nflId",)),
            _c("time", "utf8", False, "Timestamp (ISO, 10 Hz).",
               Verification.VERIFIED, ("timestamp",)),
            _c("x", "float64", True, "Long-axis position (yd, 0-120).",
               Verification.VERIFIED),
            _c("y", "float64", True, "Short-axis position (yd, 0-53.3).",
               Verification.VERIFIED),
            _c("s", "float64", False, "Speed (yd/s).", Verification.VERIFIED),
            _c("a", "float64", False, "Acceleration (yd/s^2).", Verification.VERIFIED),
            _c("dis", "float64", False, "Distance since previous frame (yd).",
               Verification.VERIFIED),
            _c("o", "float64", False, "Body orientation (deg).", Verification.VERIFIED),
            _c("dir", "float64", False, "Movement direction (deg).", Verification.VERIFIED),
            _c("event", "utf8", False,
               "Play event marker (ball_snap, pass_forward, pass_arrived, ...).",
               Verification.VERIFIED),
        ),
    )


FILE_SPECS: dict[str, FileSpec] = {
    spec.filename: spec for spec in (
        PLAYERS, COMBINE_RESULTS, COMBINE_TRACKING, CAREER_SUCCESSES,
        GAMES, PLAYER_PLAY,
        *[_game_tracking(y) for y in (2023, 2024, 2025)],
    )
}


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------
@dataclass
class SchemaReconciliation:
    """Result of comparing actual file columns against the declared spec."""
    filename: str
    present: bool
    actual_columns: list[str] = field(default_factory=list)
    matched: list[str] = field(default_factory=list)
    alias_matched: dict[str, str] = field(default_factory=dict)  # actual -> declared
    missing_required: list[str] = field(default_factory=list)
    missing_optional: list[str] = field(default_factory=list)
    unexpected: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.present and not self.missing_required

    def to_dict(self) -> dict:
        return {
            "filename": self.filename,
            "present": self.present,
            "actual_columns": self.actual_columns,
            "matched": self.matched,
            "alias_matched": self.alias_matched,
            "missing_required": self.missing_required,
            "missing_optional": self.missing_optional,
            "unexpected": self.unexpected,
            "ok": self.ok,
        }


def reconcile_columns(actual_columns: list[str] | None, spec: FileSpec) -> SchemaReconciliation:
    """Compare actual columns against a FileSpec with alias resolution."""
    rec = SchemaReconciliation(filename=spec.filename, present=actual_columns is not None)
    if actual_columns is None:
        return rec
    rec.actual_columns = list(actual_columns)
    actual_lower = {a.lower(): a for a in actual_columns}
    declared_names = {c.name for c in spec.columns}

    for col in spec.columns:
        if col.name in actual_columns:
            rec.matched.append(col.name)
            continue
        hit = None
        for alias in col.aliases:
            if alias.lower() in actual_lower:
                hit = actual_lower[alias.lower()]
                break
        if hit is not None:
            rec.alias_matched[hit] = col.name
            rec.matched.append(col.name)
        elif col.required:
            rec.missing_required.append(col.name)
        else:
            rec.missing_optional.append(col.name)

    matched_actual = {c.name for c in spec.columns if c.name in actual_columns} | set(rec.alias_matched.keys())
    for a in actual_columns:
        if a not in declared_names and a not in matched_actual:
            rec.unexpected.append(a)
    return rec

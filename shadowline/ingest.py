"""Data ingestion, audit and governance (Phase 1).

Principles
----------
* Raw competition files stay OUTSIDE version control (data/raw, gitignored).
* Every file is audited before any analytical use: presence, size, SHA-256,
  row count, actual schema, reconciliation against the declared registry.
* Heavy tracking files are never fully materialised: DuckDB SQL with column
  projection + predicate pushdown, or lazy Polars scans.
* Player IDs, positions and drill names are normalised through explicit,
  reported mappings. Nothing is silently dropped.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import polars as pl

from .artifacts import sha256_file, utc_now_iso
from .config import (CANONICAL_DRILLS, COMPETITION_FILES, DATA_DIR, DRAFT_COHORTS,
                     POSITION_GROUPS, REGULAR_SEASON, resolve_data_dir)
from .schemas import FILE_SPECS, FileSpec, SchemaReconciliation, reconcile_columns


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------
def normalize_key(col: str) -> str:
    """snake_case normalisation of a column name."""
    s = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", col)
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s)
    return s.lower()


def canonical_drill(raw: str | None) -> tuple[str | None, bool]:
    """Canonicalise a raw drill label. Returns (canonical, was_recognised)."""
    if raw is None:
        return None, False
    key = re.sub(r"[\s\-]+", "_", str(raw).strip().lower())
    key = re.sub(r"[^a-z0-9_]", "", key)
    if key in CANONICAL_DRILLS:
        return CANONICAL_DRILLS[key], True
    # try without trailing tokens like "__(yards)", "_attempt"
    for k, v in CANONICAL_DRILLS.items():
        if key.startswith(k):
            return v, True
    return key or None, False


def position_group(raw: str | None) -> str | None:
    """Map a raw roster position to its canonical group (DB/WR/TE/OL/DL/...)."""
    if raw is None:
        return None
    key = str(raw).strip().upper()
    for group, variants in POSITION_GROUPS.items():
        if key in variants:
            return group
    return key or None


HEIGHT_RE = re.compile(r"(\d)'\s*(\d{1,2})\"?|(\d)-(\d{1,2})")


def parse_height_inches(raw) -> float | None:
    """Accept 6-1 / 6'1 / 73 formats -> inches."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw) if 60 <= float(raw) <= 90 else None
    m = HEIGHT_RE.search(str(raw))
    if m:
        ft = int(m.group(1) or m.group(3))
        inch = int(m.group(2) or m.group(4))
        return float(ft * 12 + inch)
    try:
        v = float(raw)
        return v if 60 <= v <= 90 else None
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------
@dataclass
class FileAudit:
    filename: str
    path: Path | None
    present: bool
    size_bytes: int | None = None
    sha256: str | None = None
    row_count: int | None = None
    actual_columns: list[str] = field(default_factory=list)
    reconciliation: SchemaReconciliation | None = None
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            "filename": self.filename,
            "present": self.present,
            "path": str(self.path) if self.path else None,
            "size_bytes": self.size_bytes,
            "sha256": self.sha256,
            "row_count": self.row_count,
            "actual_columns": self.actual_columns,
            "reconciliation": self.reconciliation.to_dict() if self.reconciliation else None,
            "error": self.error,
        }


def read_header(path: Path) -> list[str]:
    """Header names, CSV-quote-aware (players.csv etc. quote every column)."""
    import csv as _csv
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as f:
        return next(_csv.reader(f), [])


def count_rows(path: Path) -> int:
    """Fast row count (newline count minus header) without parsing values."""
    n = 0
    with open(path, "rb") as f:
        while True:
            b = f.read(1 << 22)
            if not b:
                break
            n += b.count(b"\n")
    # last line may lack newline
    with open(path, "rb") as f:
        f.seek(0, 2)
        size = f.tell()
        if size:
            f.seek(size - 1)
            if f.read(1) != b"\n":
                n += 1
    return max(0, n - 1)


def audit_raw_data(data_dir: Path | None = None, compute_checksums: bool = True) -> dict:
    """Full Phase-1 audit of the raw data directory. Machine-readable."""
    data_dir = data_dir or resolve_data_dir()
    files: list[FileAudit] = []
    for fname in COMPETITION_FILES:
        spec = FILE_SPECS[fname]
        path = data_dir / fname
        fa = FileAudit(filename=fname, path=path, present=path.exists())
        if fa.present:
            try:
                fa.size_bytes = path.stat().st_size
                if compute_checksums:
                    fa.sha256 = sha256_file(path)
                fa.actual_columns = read_header(path)
                fa.row_count = count_rows(path)
                fa.reconciliation = reconcile_columns(fa.actual_columns, spec)
                if not fa.reconciliation.ok:
                    fa.error = "required columns missing: " + ", ".join(fa.reconciliation.missing_required)
            except Exception as exc:  # pragma: no cover - defensive
                fa.error = f"audit_failed: {exc}"
        files.append(fa)

    n_present = sum(f.present for f in files)
    audit = {
        "generated_at": utc_now_iso(),
        "data_dir": str(data_dir),
        "expected_files": COMPETITION_FILES,
        "n_expected": len(COMPETITION_FILES),
        "n_present": n_present,
        "n_missing": len(COMPETITION_FILES) - n_present,
        "all_present": n_present == len(COMPETITION_FILES),
        "files": [f.to_dict() for f in files],
        "policy": (
            "Raw competition data is kept outside version control. Checksums "
            "pin the exact audited input. No analytical stage runs until the "
            "files it requires are present; absence is reported, never "
            "substituted with synthetic data."
        ),
    }
    return audit


# ---------------------------------------------------------------------------
# Typed loaders (light files)
# ---------------------------------------------------------------------------
def _scan_csv(path: Path, **kw) -> pl.LazyFrame:
    # The 2027 package writes `NA` for missing values in several float columns
    # (separation_at_pass_forward among them). polars' default null set covers
    # the bare/quoted forms; `NA` is added explicitly.
    kw.setdefault("null_values",
                  ["", "NA", "N/A", "na", "n/a", "null", "NULL", "None", "NaN"])
    return pl.scan_csv(path, infer_schema_length=10000, **kw)


def _resolve_cols(lf: pl.LazyFrame, spec: FileSpec) -> dict[str, str]:
    """Map declared column names -> actual column names (with aliases)."""
    actual = set(lf.collect_schema().names())
    mapping = {}
    for c in spec.columns:
        if c.name in actual:
            mapping[c.name] = c.name
            continue
        for alias in c.aliases:
            if alias in actual:
                mapping[c.name] = alias
                break
    return mapping


def load_players(data_dir: Path | None = None) -> pl.DataFrame:
    """players.csv -> normalised player table.

    Accepts `nfl_position` (actual 2027 column) or `position`; always emits
    both `position` and `position_group`.
    """
    data_dir = data_dir or resolve_data_dir()
    lf = _scan_csv(data_dir / "players.csv")
    m = _resolve_cols(lf, FILE_SPECS["players.csv"])
    df = lf.collect()
    ren = {v: k for k, v in m.items()}
    df = df.rename({c: normalize_key(c) for c in df.columns if c not in ren})
    df = df.rename(ren)
    df = df.with_columns(pl.col("nfl_id").cast(pl.Int64))
    # height: `height` in some vintages, combine_height (already inches) in others
    if "height" in df.columns:
        df = df.with_columns(
            pl.col("height").map_elements(parse_height_inches, return_dtype=pl.Float64)
            .alias("height_inches"))
    # normalise the roster position column to `position`
    if "position" not in df.columns and "nfl_position" in df.columns:
        df = df.with_columns(pl.col("nfl_position").alias("position"))
    if "position" in df.columns:
        df = df.with_columns(
            pl.col("position").map_elements(position_group, return_dtype=pl.Utf8)
            .alias("position_group"))
    return df


def load_games(data_dir: Path | None = None) -> pl.DataFrame:
    data_dir = data_dir or resolve_data_dir()
    lf = _scan_csv(data_dir / "games.csv")
    m = _resolve_cols(lf, FILE_SPECS["games.csv"])
    df = lf.collect()
    df = df.rename({v: k for k, v in m.items()})
    df = df.with_columns([
        pl.col("game_id").cast(pl.Int64),
        pl.col("season").cast(pl.Int64),
    ])
    # coverage.py filters on `game_type`; the 2027 file ships `season_type`
    if "game_type" not in df.columns and "season_type" in df.columns:
        df = df.with_columns(pl.col("season_type").cast(pl.Utf8, strict=False).alias("game_type"))
    if "game_type" not in df.columns:
        df = df.with_columns(pl.lit(None, dtype=pl.Utf8).alias("game_type"))
    return df


def load_career_successes(data_dir: Path | None = None) -> pl.DataFrame:
    data_dir = data_dir or resolve_data_dir()
    lf = _scan_csv(data_dir / "player_career_successes.csv")
    df = lf.collect()
    df = df.rename({c: normalize_key(c) for c in df.columns})
    df = df.with_columns(pl.col("nfl_id").cast(pl.Int64))
    # dynamically capture every career_* column (host may add more)
    career_cols = [c for c in df.columns if c.startswith("career_")]
    for c in career_cols:
        df = df.with_columns(pl.col(c).cast(pl.Float64, strict=False))
    return df


def load_player_play(data_dir: Path | None = None,
                     positions: list[str] | None = None) -> pl.DataFrame:
    """player_play.csv; optionally filter to position groups (DB etc.)."""
    data_dir = data_dir or resolve_data_dir()
    lf = _scan_csv(data_dir / "player_play.csv")
    m = _resolve_cols(lf, FILE_SPECS["player_play.csv"])
    df = lf.collect()
    df = df.rename({v: k for k, v in m.items()})
    df = df.rename({c: normalize_key(c) for c in df.columns if normalize_key(c) not in df.columns})
    df = df.with_columns([
        pl.col("game_id").cast(pl.Int64),
        pl.col("play_id").cast(pl.Int64),
        pl.col("nfl_id").cast(pl.Int64),
    ])
    return df


# ---------------------------------------------------------------------------
# Heavy tracking access (DuckDB, projection + predicate pushdown)
# ---------------------------------------------------------------------------
def duckdb_conn(data_dir: Path | None = None):
    """DuckDB connection. Uses a persistent database when SHADOWLINE_DUCKDB is
    set or a tracking.duckdb already exists next to data/raw (see
    build_tracking_db) — per-game queries then hit zonemaps instead of
    re-scanning the 2 GiB CSVs. Opens read-only: the database is produced by
    build_tracking_db and never mutated during a pipeline run.
    """
    import duckdb
    data_dir = data_dir or resolve_data_dir()
    db_path = Path(os.environ.get("SHADOWLINE_DUCKDB",
                                  data_dir.parent / "tracking.duckdb"))
    if os.environ.get("SHADOWLINE_DUCKDB") or db_path.exists():
        if not db_path.exists():
            build_tracking_db(data_dir, db_path=db_path)
        conn = duckdb.connect(str(db_path), read_only=True)
        conn.execute(f"SET threads TO {max(1, __import__('os').cpu_count() or 2)}")
        conn.execute("SET memory_limit='8GB'")
        return conn
    conn = duckdb.connect(database=":memory:")
    conn.execute(f"SET threads TO {max(1, __import__('os').cpu_count() or 2)}")
    conn.execute("SET memory_limit='4GB'")
    register_tracking_views(conn, data_dir)
    return conn


def build_tracking_db(data_dir: Path | None = None, years=(2023, 2024, 2025),
                      db_path: Path | None = None) -> Path:
    """One-time import of the tracking CSVs into a persistent DuckDB file,
    sorted by (game_id, play_id, nfl_id) so per-game zonemap reads are cheap."""
    data_dir = data_dir or resolve_data_dir()
    db_path = Path(db_path or os.environ.get("SHADOWLINE_DUCKDB",
                                             data_dir.parent / "tracking.duckdb"))
    conn = __import__("duckdb").connect(str(db_path))
    conn.execute(f"SET threads TO {max(1, __import__('os').cpu_count() or 2)}")
    conn.execute("SET memory_limit='8GB'")
    _create_tracking_table(conn, data_dir, years=years)
    conn.close()
    return db_path


def _create_tracking_table(conn, data_dir: Path, years=(2023, 2024, 2025)):
    union = " UNION ALL ".join(
        f"SELECT * FROM read_csv_auto('{(data_dir / f'game_tracking_{y}.csv').as_posix()}', "
        f"sample_size=100000, all_varchar=false)"
        for y in years if (data_dir / f"game_tracking_{y}.csv").exists())
    if not union:
        raise FileNotFoundError("no game_tracking_*.csv found for " + str(data_dir))
    conn.execute("DROP TABLE IF EXISTS gt_all")
    conn.execute(
        f"CREATE TABLE gt_all AS SELECT * FROM ({union}) "
        f"ORDER BY game_id, play_id, nfl_id, time")
    conn.execute("CHECKPOINT")


def register_tracking_views(conn, data_dir: Path | None = None, years=(2023, 2024, 2025)) -> None:
    """Create DuckDB views gt2023/gt2024/gt2025 + gt_all over the raw CSVs."""
    data_dir = data_dir or resolve_data_dir()
    # Persistent table already present? Expose it as-is (it IS gt_all).
    try:
        tables = {r[0] for r in conn.execute("SHOW TABLES").fetchall()}
        if "gt_all" in tables:
            return
    except Exception:
        pass
    for y in years:
        path = data_dir / f"game_tracking_{y}.csv"
        if path.exists():
            conn.execute(
                f"CREATE OR REPLACE VIEW gt{y} AS SELECT * FROM "
                f"read_csv_auto('{path.as_posix()}', header=true, "
                f"sample_size=100000, all_varchar=false)")
    union = " UNION ALL ".join(f"SELECT * FROM gt{y}" for y in years
                               if (data_dir / f"game_tracking_{y}.csv").exists())
    if union:
        conn.execute(f"CREATE OR REPLACE VIEW gt_all AS {union}")


def load_combine_attempts(data_dir: Path | None = None) -> pl.DataFrame:
    """combine_tracking.csv -> attempt-level table (canonical drills, entities).

    Returns one row per (nfl_id, drill, attempt) with frame counts and quality
  pre-checks; full frames are streamed per-attempt by quality/feature stages.
    """
    data_dir = data_dir or resolve_data_dir()
    lf = _scan_csv(data_dir / "combine_tracking.csv")
    df = lf.collect()
    df = df.rename({c: normalize_key(c) for c in df.columns})
    # entity detection: any column whose values include BALL marks entity type
    entity_col = None
    for cand in ("entity", "track_type", "track", "entity_type"):
        if cand in df.columns:
            entity_col = cand
            break
    drill_col = next((c for c in ("drill_name", "drill", "drill_type") if c in df.columns), None)
    attempt_col = next((c for c in ("attempt", "attempt_id", "attempt_number", "run") if c in df.columns), None)

    df = df.with_columns(pl.col("nfl_id").cast(pl.Utf8, strict=False))
    if attempt_col is None:
        df = df.with_columns(pl.lit(1).cast(pl.Int64).alias("attempt"))
        attempt_col = "attempt"
    grouped = df.group_by(["nfl_id", drill_col, attempt_col]).agg([
        pl.len().alias("n_frames"),
        pl.col("x").min().alias("x_min"), pl.col("x").max().alias("x_max"),
        pl.col("y").min().alias("y_min"), pl.col("y").max().alias("y_max"),
        (pl.col("x").null_count()).alias("x_nulls"),
        (pl.col("y").null_count()).alias("y_nulls"),
    ])
    if entity_col:
        grouped = grouped.with_columns(pl.lit(True).alias("has_entity_col"))
    return grouped.sort(["nfl_id", drill_col, attempt_col])


# ---------------------------------------------------------------------------
# Referential integrity + duplicate detection
# ---------------------------------------------------------------------------
def referential_integrity(players: pl.DataFrame, games: pl.DataFrame,
                          player_play: pl.DataFrame | None,
                          tracking_keys_by_year: dict[int, set] | None = None) -> dict:
    """Cross-file key validation. Returns machine-readable report.

    Includes the two directions of the player_play <-> tracking linkage, the
    gap documented by competitors in competition discussion thread 747584.
    """
    rep: dict = {"checked_at": utc_now_iso(), "checks": []}

    def add(name, ok, detail):
        rep["checks"].append({"check": name, "ok": bool(ok), "detail": detail})

    player_ids = set(players["nfl_id"].to_list())
    add("players_unique_nfl_id",
        players.height == players["nfl_id"].n_unique(),
        {"n_rows": players.height, "n_unique": players["nfl_id"].n_unique()})

    if games is not None:
        add("games_unique_game_id",
            games.height == games["game_id"].n_unique(),
            {"n_rows": games.height})
        known_games = set(games["game_id"].to_list())
    else:
        known_games = set()

    if player_play is not None:
        add("player_play_players_in_players",
            player_play.filter(~pl.col("nfl_id").is_in(list(player_ids))).height == 0,
            {"orphan_rows": player_play.filter(~pl.col("nfl_id").is_in(list(player_ids))).height})
        if known_games:
            add("player_play_games_in_games",
                player_play.filter(~pl.col("game_id").is_in(list(known_games))).height == 0,
                {"orphan_rows": player_play.filter(~pl.col("game_id").is_in(list(known_games))).height})
        dup = (player_play.group_by(["game_id", "play_id", "nfl_id"]).len()
               .filter(pl.col("len") > 1))
        add("player_play_key_unique", dup.height == 0, {"duplicate_keys": dup.height})

    if tracking_keys_by_year:
        for year, keys in sorted(tracking_keys_by_year.items()):
            orphan = sum(1 for (g, p, n) in keys if known_games and g not in known_games)
            add(f"gt{year}_games_in_games", orphan == 0,
                {"tracking_keys": len(keys), "orphan_game_keys": orphan})
            if player_play is not None:
                pp_keys = {(r[0], r[1], r[2]) for r in player_play.select(
                    ["game_id", "play_id", "nfl_id"]).iter_rows()}
                untracked = len(pp_keys - keys) if keys else 0
                no_pp = len({k for k in keys if k[:2] in {(g, p) for (g, p, _) in pp_keys}} - pp_keys) if keys else 0
                add(f"gt{year}_player_play_linkage", True, {
                    "tracking_keys_without_player_play": len(keys - pp_keys) if keys else 0,
                    "player_play_keys_without_tracking": untracked,
                })
    return rep


def regular_season_games(games: pl.DataFrame) -> pl.DataFrame:
    """Primary analyses use REGULAR-SEASON games only (documented decision).

    The dataset also contains POST and PRE games; we report the excluded
    counts so exposure denominators are always explicit.
    """
    if "game_type" in games.columns:
        return games.filter(pl.col("game_type") == REGULAR_SEASON)
    return games

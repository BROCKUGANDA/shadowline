"""Combine feature extraction orchestration (Phase 3).

Pipeline: combine_tracking frames -> attempt segmentation -> quality verdict
-> MRI components (shadowline.mri) -> player-level aggregation -> cohort-
standardised composite -> distribution diagnostics + sensitivity analysis.

Gated on data: with no combine_tracking.csv present this module emits a
gated_on_data artifact and returns empty frames (never synthetic values).
"""
from __future__ import annotations

import numpy as np
import polars as pl

from .config import MRI_ELIGIBLE_DRILLS, MRI_SENSITIVITY_GRID, RESEARCH_PARAMETERS
from .ingest import canonical_drill, position_group, resolve_data_dir
from .kinematics import cumulative_distance
from .mri import (COMPONENTS, AttemptFeatures, attempt_components, attempt_consistency,
                  mri_composite, robust_z, sensitivity_scan)
from .quality import attempt_quality_verdict


def canonical_drill_series(raw: pl.Series) -> pl.Series:
    return raw.map_elements(lambda v: canonical_drill(v)[0], return_dtype=pl.Utf8)


def load_attempt_frames(data_dir=None) -> pl.DataFrame | None:
    """Full combine_tracking frame table with canonical drills (heavy but
    bounded: ~6,310 attempts * ~50-80 frames). Returns None when absent."""
    data_dir = resolve_data_dir() if data_dir is None else data_dir
    path = data_dir / "combine_tracking.csv"
    if not path.exists():
        return None
    df = pl.read_csv(path, infer_schema_length=100000,
                     null_values=["NA", "N/A", "na", ""])
    df = df.rename({c: c for c in df.columns})
    cols = {c.lower(): c for c in df.columns}
    rename = {}
    for decl, aliases in [("nfl_id", ("nflid",)), ("drill_name", ("drill", "drill_type")),
                          ("attempt", ("attempt_id", "attempt_number", "run")),
                          ("frame_id", ("frame", "frameid")), ("time", ("timestamp", "t")),
                          ("x", ("x",)), ("y", ("y",)), ("s", ("speed",)),
                          ("a", ("accel",)), ("dis", ("distance", "dist"))]:
        if decl not in df.columns:
            for al in aliases:
                if al in cols:
                    rename[cols[al]] = decl
                    break
    df = df.rename(rename)
    df = df.with_columns([
        pl.col("nfl_id").cast(pl.Utf8, strict=False),
        pl.col("x").cast(pl.Float64, strict=False),
        pl.col("y").cast(pl.Float64, strict=False),
    ])
    if "attempt" not in df.columns:
        df = df.with_columns(pl.lit(1).cast(pl.Int64).alias("attempt"))
    else:
        df = df.with_columns(pl.col("attempt").cast(pl.Int64, strict=False).fill_null(1))
    if "frame_id" not in df.columns:
        df = df.with_columns(pl.int_range(pl.len()).over(["nfl_id", "drill_name", "attempt"])
                             .alias("frame_id"))
    if "drill_name" not in df.columns:
        return None
    df = df.with_columns(canonical_drill_series(pl.col("drill_name")).alias("drill_canonical"))
    # entity separation (BALL rows etc.)
    if "entity" in df.columns:
        df = df.filter(pl.col("entity").str.to_lowercase().str.contains("ball").is_not_null())
        df = df.filter(~pl.col("entity").str.to_lowercase().contains("ball"))
    df = df.filter(pl.col("nfl_id").is_not_null() & pl.col("nfl_id").ne("BALL"))
    return df.sort(["nfl_id", "drill_name", "attempt", "frame_id"])


def extract_attempt_features(frames: pl.DataFrame, players: pl.DataFrame | None = None,
                             params: dict | None = None) -> tuple[list[dict], list[dict]]:
    """Run quality verdict + MRI components for every attempt. Returns
    (feature_rows, quality_rows)."""
    feature_rows, quality_rows = [], []
    key_cols = ["nfl_id", "drill_name", "attempt"]
    for (nfl_id, drill_raw, attempt), g in frames.group_by(key_cols, maintain_order=True):
        g = g.sort("frame_id")
        drill, _ = canonical_drill(drill_raw)
        x = g["x"].to_numpy()
        y = g["y"].to_numpy()
        if "time" in g.columns:
            try:
                t = g["time"].str.to_datetime("%Y-%m-%dT%H:%M:%S%.f", strict=False).dt.epoch(
                    time_unit="ns").to_numpy() / 1e9
                if np.nanmedian(np.diff(t)) <= 0:
                    t = np.arange(len(g)) / 10.0
            except Exception:
                t = np.arange(len(g)) / 10.0
        else:
            t = np.arange(len(g)) / 10.0
        dt = float(np.nanmedian(np.diff(t))) if len(t) > 2 else 0.1
        if not (0.05 <= dt <= 0.2):
            dt = 0.1
        s = g["s"].to_numpy() if "s" in g.columns else None
        dis = g["dis"].to_numpy() if "dis" in g.columns else None
        frame = g["frame_id"].to_numpy()

        verdict = attempt_quality_verdict(x, y, t, frame, s, dis, domain="combine")
        qrow = {"nfl_id": nfl_id, "drill": drill, "drill_raw": drill_raw,
                "attempt": attempt, **{k: v for k, v in verdict.items()
                                       if k not in ("sampling", "gaps", "discontinuities", "bounds")}}
        qrow["flags"] = verdict["flags"]
        quality_rows.append(qrow)
        if not verdict["usable"]:
            fr = AttemptFeatures(nfl_id=nfl_id, drill=drill, attempt=attempt)
            fr.quality_flags = ["unusable_attempt"] + verdict["flags"]
            feature_rows.append(fr.to_dict())
            continue
        feats = attempt_components(x, y, dt, params=params)
        fdict = feats.to_dict()
        fdict.update({"nfl_id": nfl_id, "drill": drill, "drill_raw": drill_raw, "attempt": attempt})
        fdict["quality_flags"] = fdict.get("quality_flags", []) + verdict["flags"]
        feature_rows.append(fdict)
    return feature_rows, quality_rows


def player_level_mri(feature_rows: list[dict], players: pl.DataFrame,
                     primary_drills=("short_shuttle", "three_cone")) -> dict:
    """Aggregate attempt features to player level + cohort-standardised composite.

    Returns {'players': [...], 'distributions': {...}, 'consistency': {...},
             'sensitivity': {...}} -- all real-data derived or empty when gated.
    """
    if not feature_rows:
        return {"players": [], "distributions": {}, "consistency": {}, "sensitivity": {}}
    pgroup = {str(r["nfl_id"]): r for r in players.iter_rows(named=True)} if players is not None else {}
    df = pl.DataFrame(feature_rows)
    df = df.filter(pl.col("drill").is_in(list(MRI_ELIGIBLE_DRILLS)))

    player_rows = []
    for (nfl_id,), g in df.group_by("nfl_id", maintain_order=True):
        info = pgroup.get(str(nfl_id), {})
        row = {"nfl_id": nfl_id,
               "position": info.get("position"),
               "position_group": info.get("position_group") or position_group(info.get("position")),
               "draft_year": info.get("draft_year"),
               "n_attempts": g.height}
        for c in COMPONENTS:
            vals = g[c].drop_nulls().to_list()
            row[f"{c}_mean"] = float(np.mean(vals)) if vals else None
        # attempt-to-attempt consistency on drill time and latency
        for c in ("reorientation_latency", "directional_transition_efficiency"):
            vals = [v for v in g[c].drop_nulls().to_list() if v is not None]
            row[f"{c}_consistency"] = attempt_consistency(
                vals, RESEARCH_PARAMETERS["min_attempts_for_consistency"])
        row["consistency"] = attempt_consistency(
            [v for v in g["attempt_time_s"].drop_nulls().to_list() if v is not None],
            RESEARCH_PARAMETERS["min_attempts_for_consistency"])
        player_rows.append(row)

    # composite within position_group x draft_year cohorts
    out_rows = []
    cohorts: dict[tuple, list[dict]] = {}
    for r in player_rows:
        cohorts.setdefault((r.get("position_group"), r.get("draft_year")), []).append(r)
    for _, rows in sorted(cohorts.items(), key=lambda kv: str(kv[0])):
        out_rows.extend(mri_composite(
            rows, min_components=RESEARCH_PARAMETERS["min_components_for_composite"]))

    distributions = {}
    for c in list(COMPONENTS) + ["mri_composite"]:
        vals = np.array([r.get(c) if r.get(c) is not None else np.nan for r in out_rows], float)
        vals = vals[np.isfinite(vals)]
        if len(vals):
            distributions[c] = {
                "n": int(len(vals)), "mean": float(np.mean(vals)),
                "sd": float(np.std(vals, ddof=1)) if len(vals) > 1 else None,
                "median": float(np.median(vals)),
                "q05": float(np.quantile(vals, 0.05)), "q95": float(np.quantile(vals, 0.95)),
                "min": float(vals.min()), "max": float(vals.max()),
                "skew": float(len(vals) > 2 and float(((vals - vals.mean()) ** 3).mean() / (vals.std() + 1e-12) ** 3)),
            }
    consistency = {
        "median_attempt_latency_consistency": float(np.median([
            r["reorientation_latency_consistency"] for r in out_rows
            if r.get("reorientation_latency_consistency") is not None])) if any(
        r.get("reorientation_latency_consistency") is not None for r in out_rows) else None,
        "n_players_with_repeat_attempts": int(sum(
            1 for r in out_rows if r.get("n_attempts", 0) >= 2)),
    }
    return {"players": out_rows, "distributions": distributions,
            "consistency": consistency, "sensitivity": {}}


def sensitivity_from_frames(frames: pl.DataFrame, max_attempts: int = 40) -> dict:
    """Parameter sensitivity scan on a bounded sample of real attempts."""
    if frames is None or frames.height == 0:
        return {}
    out = {}
    taken = 0
    for (nfl_id, drill_raw, attempt), g in frames.group_by(
            ["nfl_id", "drill_name", "attempt"], maintain_order=True):
        if taken >= max_attempts:
            break
        g = g.sort("frame_id")
        x, y = g["x"].to_numpy(), g["y"].to_numpy()
        if len(x) < 20:
            continue
        out[f"{nfl_id}|{drill_raw}|{attempt}"] = sensitivity_scan(x, y, 0.1, MRI_SENSITIVITY_GRID)
        taken += 1
    return out


def traditional_combine_table(data_dir=None) -> pl.DataFrame | None:
    """combine_results.csv -> traditional-metric table (Model A inputs).

    The 2027 package ships WIDE: one row per player, one column per drill
    (`forty`, `three_cone`, `short_shuttle`, `broad_jump`, `vertical`,
    `ten_yd_split`, `bench_reps`, `ngs_*`). Returns a player-keyed table with
    `combine_<column>` names -- exactly what the research stage joins.
    """
    from pathlib import Path
    data_dir = resolve_data_dir() if data_dir is None else data_dir
    path = data_dir / "combine_results.csv"
    if not path.exists():
        return None
    df = pl.read_csv(path, infer_schema_length=100000,
                     null_values=["", "NA", "N/A", "na", "n/a", "null", "NULL", "None", "NaN"])
    df = df.rename({c: c.lower() for c in df.columns})
    if "nfl_id" not in df.columns:
        return None
    df = df.with_columns(pl.col("nfl_id").cast(pl.Utf8, strict=False))
    out = df.rename({c: f"combine_{c}" for c in df.columns if c != "nfl_id"})
    return out

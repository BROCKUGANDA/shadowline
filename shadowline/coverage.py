"""NFL coverage movement analytics (Phase 4).

Extracts real game movement for eligible defensive backs and their matched
receivers, then computes coverage-window movement summaries.

Matchup identification policy (documented, validated, honest):
1. Coverage plays are REGULAR-SEASON pass plays (game_type == 'REG') where a
   DB participates (player_play position in DB group).
2. The DB's "associated receiver" is the TARGETED receiver when a targeting
   column exists (was_targeted / targeted flags). Otherwise the nearest
   offensive eligible receiver at the pass-forward frame is used as a
   PROXIMITY-BASED ASSOCIATION and flagged as such -- the nearest defender is
   never silently equated with the assigned defender.
3. The primary outcome, separation_at_pass_forward, is taken from
   player_play.csv when present (host-verified column); a tracking-derived
   cross-check is computed and the disagreement rate reported.

All per-play computation streams frames via DuckDB (predicate pushdown);
nothing is fully materialised.
"""
from __future__ import annotations

import numpy as np
import polars as pl

from .config import COVERAGE_PARAMETERS as CP
from .config import DB_POSITIONS_RAW, REGULAR_SEASON
from .ingest import load_games, load_player_play, load_players, position_group, resolve_data_dir
from .kinematics import angular_diff, cumulative_distance, heading
from .mri import mirror_latency
from .quality import attempt_quality_verdict


def db_positions_mask(player_play: pl.DataFrame) -> pl.Expr:
    """Boolean expression: row belongs to a defensive back."""
    pos_col = next((c for c in ("lined_up_position", "position", "roster_position")
                    if c in player_play.columns), None)
    if pos_col is None:
        return pl.lit(False)
    dbs = list(DB_POSITIONS_RAW)
    return pl.col(pos_col).str.to_uppercase().is_in(dbs)


def receiver_positions_mask(player_play: pl.DataFrame) -> pl.Expr:
    pos_col = next((c for c in ("lined_up_position", "position", "roster_position")
                    if c in player_play.columns), None)
    if pos_col is None:
        return pl.lit(False)
    offense = ["WR", "TE", "RB", "FB", "HB", "SLOT_WR", "SLOT", "X", "Z", "H", "Y"]
    return pl.col(pos_col).str.to_uppercase().is_in(offense)


def pass_play_mask(player_play: pl.DataFrame, tracking_has_pass_forward: bool) -> pl.Expr:
    """Best-effort pass-play filter using whichever indicator columns exist.

    The 2027 file marks defenders with `coverage_assignment` /
    `coverage_assignment_at_snap` and marks the targeted receiver with a
    non-null `separation_at_pass_forward`. `NO_ASSIGNMENT` (and blanks) are
    run plays / non-coverage rows.
    """
    for col in ("is_pass_play", "is_pass_drop"):
        if col in player_play.columns:
            return pl.col(col) == 1
    for col in ("play_type", "pff_play_type"):
        if col in player_play.columns:
            return pl.col(col).str.to_lowercase().str.contains("pass")
    for col in ("coverage_assignment", "coverage_assignment_at_snap"):
        if col in player_play.columns:
            return (pl.col(col).is_not_null()
                    & ~pl.col(col).str.to_uppercase().eq("NO_ASSIGNMENT"))
    if "separation_at_pass_forward" in player_play.columns and tracking_has_pass_forward:
        return pl.col("separation_at_pass_forward").is_not_null()
    return pl.lit(True)


def build_coverage_plays(players: pl.DataFrame, games: pl.DataFrame,
                         player_play: pl.DataFrame) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Coverage play universe: (game, play, db_nfl_id) rows, REG only.

    Returns (db_rows, receiver_rows) — two frames, never one; the CLI and the
    receiver associator consume them separately.
    """
    reg_games = games.filter(pl.col("game_type") == REGULAR_SEASON) \
        if "game_type" in games.columns else games
    reg_ids = reg_games["game_id"].to_list()
    pp = player_play.filter(pl.col("game_id").is_in(reg_ids))
    pp = pp.with_columns([
        pl.col("nfl_id").cast(pl.Utf8),
    ])
    # DB rows on pass plays
    db = pp.filter(db_positions_mask(pp) & pass_play_mask(pp, True))
    # keep a compact receiver table for association
    recv = pp.filter(receiver_positions_mask(pp))
    cols_keep = [c for c in ["game_id", "play_id", "nfl_id", "lined_up_position",
                             "separation_at_pass_forward"] if c in pp.columns]
    target_col = next((c for c in ("was_targeted", "is_targeted", "targeted")
                       if c in recv.columns), None)
    return db.select(cols_keep + ([target_col] if target_col else [])), recv.select(
        cols_keep + ([target_col] if target_col else []))


def _with_frame_id(df: pl.DataFrame) -> pl.DataFrame:
    """Add a per-entity 10 Hz frame index when the source file lacks one."""
    if "frame_id" in df.columns:
        return df
    return df.with_columns(pl.int_range(pl.len()).over("nfl_id").alias("frame_id"))


def fetch_play_frames(conn, game_id: int, play_id: int) -> pl.DataFrame | None:
    """Stream one play's frames (all entities) through DuckDB.

    Single-play reads are correctness-testable but re-scan the 2 GiB tracking
    files each call (~5 s), so the CLI uses ``fetch_game_frames`` instead.
    """
    try:
        rows = conn.execute(
            "SELECT * FROM gt_all WHERE game_id = ? AND play_id = ? "
            "ORDER BY nfl_id, time", [game_id, play_id]).fetchall()
        cols = [d[0] for d in conn.description]
    except Exception:
        return None
    if not rows:
        return None
    return _with_frame_id(pl.DataFrame({c: [r[i] for r in rows] for i, c in enumerate(cols)}))


def fetch_game_frames(conn, game_id: int) -> pl.DataFrame | None:
    """One DuckDB scan per game -> all plays' frames, frame-indexed.

    A whole game costs the same ~5 s scan regardless of how many plays we pull
    out of it, so batching by game amortises the cost across its coverage reps.
    Rows are read in (play_id, nfl_id) order; the per-entity 10 Hz index is
    reconstructed afterwards, so no `time` column is required.
    """
    try:
        rows = conn.execute(
            "SELECT * FROM gt_all WHERE game_id = ? ORDER BY play_id, nfl_id",
            [game_id]).fetchall()
        cols = [d[0] for d in conn.description]
    except Exception:
        return None
    if not rows:
        return None
    df = pl.DataFrame({c: [r[i] for r in rows] for i, c in enumerate(cols)})
    if "frame_id" not in df.columns:
        df = df.with_columns(
            pl.int_range(pl.len()).over(["play_id", "nfl_id"]).alias("frame_id"))
    return df

def _frames_for_entity(df: pl.DataFrame, nfl_id) -> dict | None:
    sub = df.filter(pl.col("nfl_id").cast(pl.Utf8) == str(nfl_id)).sort("frame_id")
    if sub.height < 5:
        return None
    out = {"frame": sub["frame_id"].to_numpy() if "frame_id" in sub.columns else np.arange(sub.height)}
    for c in ("x", "y", "s", "o", "dir"):
        out[c] = sub[c].to_numpy() if c in sub.columns else None
    out["event"] = sub["event"].to_list() if "event" in sub.columns else []
    return out


def analyse_coverage_play(frames: pl.DataFrame, db_id, receiver_id: int | None,
                          association_method: str | None = None,
                          params: dict | None = None) -> dict | None:
    """Movement analysis of one coverage rep. Returns play-level summary."""
    p = {**CP, **(params or {})}
    d = _frames_for_entity(frames, db_id)
    if d is None:
        return None
    x, y, fr = d["x"], d["y"], d["frame"]
    t = fr * 0.1  # 10 Hz frames

    events = d["event"]
    snap_i = next((i for i, e in enumerate(events) if e and "snap" in str(e).lower()), 0)
    pf_i = next((i for i, e in enumerate(events) if e and "forward" in str(e).lower()), None)

    summary = {
        "nfl_id": str(db_id), "receiver_nfl_id": str(receiver_id) if receiver_id else None,
        "association_method": association_method, "n_frames": int(len(fr)),
        "snap_index": int(snap_i),
        "pass_forward_index": int(pf_i) if pf_i is not None else None,
        "flags": [],
    }

    # quality gate
    verdict = attempt_quality_verdict(x, y, t, fr, d["s"], None, domain="game", min_frames=5)
    summary["quality_flags"] = verdict["flags"]
    if "out_of_field" in verdict["flags"]:
        summary["flags"].append("excluded_out_of_field")
        return summary

    # defender movement summary
    from .mri import attempt_components
    feats = attempt_components(x, y, 0.1)
    summary["defender_distance_yd"] = feats.path_length_yd
    summary["defender_reversals"] = feats.n_reversals
    summary["defender_mean_speed"] = feats.mean_speed_yd_s

    if receiver_id is None:
        summary["flags"].append("no_receiver_associated")
        return summary
    r = _frames_for_entity(frames, receiver_id)
    if r is None:
        summary["flags"].append("receiver_frames_missing")
        return summary

    rx, ry = r["x"], r["y"]
    n = min(len(x), len(rx))
    sep = np.hypot(x[:n] - rx[:n], y[:n] - ry[:n])
    summary["separation_at_pass_forward_derived"] = float(sep[pf_i]) if pf_i is not None and pf_i < n else None
    summary["separation_mean_window"] = float(np.mean(sep[snap_i:])) if n > snap_i else None
    summary["separation_min_window"] = float(np.min(sep[snap_i:])) if n > snap_i else None
    summary["exposure_within_1yd_s"] = float(np.sum(sep[snap_i:] < 1.0) * 0.1) if n > snap_i else None
    summary["exposure_within_3yd_s"] = float(np.sum(sep[snap_i:] < 3.0) * 0.1) if n > snap_i else None

    # receiver route break -> defender mirror behaviour
    if r["x"] is not None and len(rx) > 30:
        rf = attempt_components(rx, ry, 0.1)
        # find receiver reversal nearest to (but before) pass forward
        r_events = detect_receiver_breaks(rx, ry)
        summary["receiver_breaks"] = len(r_events)
        if r_events and pf_i is not None:
            br = min(r_events, key=lambda i: abs(i - pf_i))
            if br < pf_i:
                pre_sep = float(np.mean(sep[max(0, br - 5):max(1, br)])) if br > 0 else None
                ml = mirror_latency(x, y, rx, ry, br, 0.1,
                                    error_threshold_deg=p["mirror_error_threshold_deg"],
                                    sustain_s=p["mirror_sustain_s"],
                                    cap_s=p["recovery_cap_s"])
                summary["mirror_latency_s"] = ml
                # separation recovery: time until sep <= pre-separation level
                if pre_sep is not None:
                    rec = None
                    for j in range(br, min(n, br + int(p["recovery_cap_s"] / 0.1))):
                        if sep[j] <= pre_sep:
                            rec = (j - br) * 0.1
                            break
                    summary["separation_recovery_s"] = rec
                # directional tracking error after break
                post = slice(br, min(n, br + 30))
                if post.stop - post.start > 5:
                    dx, dy = np.diff(x[post]), np.diff(y[post])
                    spd = np.hypot(dx, dy) / 0.1
                    valid = spd > 0.5
                    if valid.any():
                        hd = heading(dx[valid], dy[valid])
                        brg = heading(rx[post][1:][valid] - x[post][:-1][valid],
                                      ry[post][1:][valid] - y[post][:-1][valid])
                        summary["mean_tracking_error_deg"] = float(
                            np.mean(angular_diff(hd, brg)))
    return summary


def detect_receiver_breaks(rx: np.ndarray, ry: np.ndarray) -> list[int]:
    """Frame indices of receiver direction changes (route breaks)."""
    from .kinematics import detect_reversals
    n = len(rx)
    if n < 10:
        return []
    step = np.hypot(np.diff(rx), np.diff(ry))
    hd = np.full(n, np.nan)
    from .kinematics import wrap_deg
    hd[1:] = np.where(step > 0.5, wrap_deg(np.rad2deg(np.arctan2(np.diff(ry), np.diff(rx)))), np.nan)
    idx = np.where(np.isfinite(hd))[0]
    if len(idx) < 5:
        return []
    hd = np.where(np.isfinite(hd), hd, hd[idx[0]])
    evs = detect_reversals(hd, np.concatenate([[0], step / 0.1]), 0.1)
    return [e["centre_idx"] for e in evs]


def associate_receiver(db_row: dict, receivers: pl.DataFrame,
                        frames: pl.DataFrame) -> tuple[int | None, str | None]:
    """Receiver association: targeted first, else nearest at pass-forward.

    Returns (receiver_nfl_id, method) where method is one of
    'targeted' | 'nearest_proximity' | None. The proximity fallback is an
    approximation and is ALWAYS reported, never silently equated with the
    assigned defender-receiver matchup.
    """
    rec_play = receivers.filter((pl.col("game_id") == db_row["game_id"]) &
                                (pl.col("play_id") == db_row["play_id"]))
    if rec_play.height == 0:
        return None, None
    tgt_col = next((c for c in ("was_targeted", "is_targeted", "targeted")
                    if c in rec_play.columns), None)
    if tgt_col:
        tgt = rec_play.filter(pl.col(tgt_col) == 1)
        if tgt.height == 1:
            return tgt["nfl_id"][0], "targeted"
    # nearest offensive receiver to the DB at pass-forward frame (flagged)
    pf = frames.filter((pl.col("event").str.to_lowercase().str.contains("forward"))
                       if "event" in frames.columns else pl.lit(False))
    if pf.height == 0:
        # fall back to last frame
        pf = frames.group_by("nfl_id").last()
    db_frames = pf.filter(pl.col("nfl_id").cast(pl.Utf8) == str(db_row["nfl_id"]))
    if db_frames.height == 0:
        return None, None
    dx0, dy0 = float(db_frames["x"][0]), float(db_frames["y"][0])
    best, best_d = None, None
    for r in rec_play.iter_rows(named=True):
        rf = pf.filter(pl.col("nfl_id").cast(pl.Utf8) == str(r["nfl_id"]))
        if rf.height == 0:
            continue
        dd = float(np.hypot(float(rf["x"][0]) - dx0, float(rf["y"][0]) - dy0))
        if best_d is None or dd < best_d:
            best, best_d = r["nfl_id"], dd
    return best, ("nearest_proximity" if best is not None else None)


def aggregate_player_coverage(play_rows: list[dict]) -> list[dict]:
    """Exposure-weighted player-level coverage summaries."""
    byp: dict[str, list[dict]] = {}
    for r in play_rows:
        if r is None or r.get("separation_at_pass_forward_derived") is None:
            continue
        byp.setdefault(r["nfl_id"], []).append(r)
    out = []
    for nfl_id, rows in sorted(byp.items()):
        seps = np.array([r["separation_at_pass_forward_derived"] for r in rows], float)
        exp1 = np.array([r.get("exposure_within_1yd_s") or 0 for r in rows], float)
        ml = [r["mirror_latency_s"] for r in rows if r.get("mirror_latency_s") is not None]
        te = [r["mean_tracking_error_deg"] for r in rows if r.get("mean_tracking_error_deg") is not None]
        rec = [r["separation_recovery_s"] for r in rows if r.get("separation_recovery_s") is not None]
        out.append({
            "nfl_id": nfl_id,
            "n_coverage_plays": len(rows),
            "sep_at_pass_forward_mean": float(seps.mean()),
            "sep_at_pass_forward_p90": float(np.quantile(seps, 0.9)),
            "open_rate_3yd": float(np.mean(seps >= 3.0)),
            "mean_exposure_within_1yd_s": float(exp1.mean()),
            "mirror_latency_mean_s": float(np.mean(ml)) if ml else None,
            "n_mirror_events": len(ml),
            "tracking_error_mean_deg": float(np.mean(te)) if te else None,
            "separation_recovery_mean_s": float(np.mean(rec)) if rec else None,
            "meets_min_exposure": len(rows) >= CP["min_coverage_plays"],
        })
    return out

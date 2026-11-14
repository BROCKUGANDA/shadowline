"""SHADOWLINE pipeline CLI.

Commands (each writes versioned artifacts under artifacts/v1/):
  audit       -- Phase 1 dataset audit (presence, checksums, schemas, linkage)
  quality     -- Phase 2 tracking data-quality report (requires data)
  features    -- Phase 3 MRI feature extraction + distributions (requires data)
  coverage    -- Phase 4 NFL coverage movement analytics (requires data)
  research    -- Phase 5 statistical validation (requires data)
  demo        -- regenerate the clearly-labelled synthetic algorithm demo
  all         -- run everything; data-gated stages report gated_on_data

Exit codes: 0 = completed (including data-gated), 1 = hard failure.
Deterministic: fixed seeds, no wall-clock dependence in analytical values.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import ARTIFACT_SCHEMA_VERSION, METRIC_VERSION, PIPELINE_VERSION
from .artifacts import ArtifactStore, gated_payload
from .config import (COVERAGE_PARAMETERS, DATA_DIR, MRI_PARAMETERS, PRIMARY_HYPOTHESIS,
                     PRIMARY_OUTCOME, PRIMARY_PREDICTOR, RESEARCH_PARAMETERS,
                     resolve_data_dir)


def stage_metric_catalog(store: ArtifactStore) -> Path:
    from .mri import COMPONENTS
    catalog = {
        "metric_family": "Mirror Response Index (MRI)",
        "metric_version": METRIC_VERSION,
        "status": "implemented_and_unit_tested",
        "validation_status": "components_validated_on_synthetic_ground_truth; "
                             "population_validation_gated_on_competition_data",
        "description": (
            "MRI quantifies change-of-direction movement quality from 10 Hz "
            "Combine drill tracking: how efficiently an athlete decelerates, "
            "re-orients, and re-accelerates through direction reversals."
        ),
        "components": {
            "reorientation_latency": {
                "definition": "Mean time (s) from speed minimum (plant) to recovery of "
                              "70% of pre-turn entry speed, across reversals in an attempt.",
                "units": "seconds", "direction": "lower_is_better",
                "missing_data": "null when no reversal or recovery not observed within 1.5 s"},
            "turn_speed_retention": {
                "definition": "Speed retained through the plant relative to entry speed "
                              "(v_min / v_entry).",
                "units": "ratio (dimensionless)", "direction": "higher_is_better",
                "missing_data": "null when entry speed is zero or no reversal"},
            "directional_transition_efficiency": {
                "definition": "Net displacement / path length across a +/-0.5 s window "
                              "centred on the plant (1.0 = no wasted mileage).",
                "units": "ratio (dimensionless)", "direction": "higher_is_better",
                "missing_data": "null when no usable reversal window"},
            "exit_acceleration": {
                "definition": "Mean tangential acceleration over 0.5 s after the plant.",
                "units": "yd/s^2", "direction": "higher_is_better",
                "missing_data": "null when insufficient post-plant frames"},
            "attempt_consistency": {
                "definition": "1 - coefficient of variation across a player's attempts "
                              "of the same drill.",
                "units": "ratio (dimensionless)", "direction": "higher_is_better",
                "missing_data": "null with fewer than 2 attempts"},
        },
        "composite": {
            "definition": "Reliability-weighted mean of robust (median/MAD) z-scores "
                          "within position x draft-year cohorts; latency sign-flipped. "
                          "Requires >= 3 available components.",
            "units": "standard deviations", "direction": "higher_is_better",
            "validity_rule": "composite is NOT assumed valid; Model A/B/C comparison "
                             "and component-level FDR control are pre-registered",
        },
        "parameters": MRI_PARAMETERS,
        "sensitivity_grid": RESEARCH_PARAMETERS,
        "components_list": list(COMPONENTS),
    }
    return store.write("metric_catalog.json", catalog)


def stage_experiment_register(store: ArtifactStore) -> Path:
    register = {
        "registered_at": "pipeline initialisation (before any outcome inspection)",
        "primary_hypothesis": PRIMARY_HYPOTHESIS,
        "primary_predictor": PRIMARY_PREDICTOR,
        "primary_outcome": PRIMARY_OUTCOME,
        "primary_test": (
            "Partial Spearman correlation of MRI composite with mean separation "
            "allowed at pass forward, controlling traditional Combine measures; "
            "player-clustered permutation p-value (n=2000) and clustered "
            "bootstrap 95% CI (n=500)."
        ),
        "decision_rule": (
            "MRI adds information beyond traditional Combine results iff "
            "(a) two-sided permutation p < 0.05 AND (b) out-of-sample Model B "
            "beats Model A with the clustered-bootstrap CI of delta excluding 0."
        ),
        "models": {
            "A": "Traditional Combine measurements (40-yard dash, short shuttle, "
                 "three-cone, vertical, broad jump as available)",
            "B": "A + MRI composite (and pre-registered components)",
            "C": "B + context (draft round, height, weight, exposure mix)",
        },
        "secondary_analyses": [
            "Each MRI component individually vs primary outcome (BH-FDR corrected)",
            "Combine MRI vs game mirror latency (test-retest translation)",
            "Coverage exposure descriptives by cohort (13 players never played: "
            "exposure analysis, not ability)",
        ],
        "validation": {
            "out_of_sample": "GroupKFold by player (5 folds, leakage-asserted)",
            "external_validity": "leave-one-draft-cohort-out (2023/2024/2025)",
            "multiple_testing": "BH-FDR q < 0.05 for secondary analyses",
            "alpha": RESEARCH_PARAMETERS["alpha"],
            "seed": RESEARCH_PARAMETERS["random_seed"],
        },
        "honesty_rules": [
            "Null results are reported as null results.",
            "Insufficient playing time is never treated as poor athletic ability.",
            "Exploratory findings are labelled exploratory, never confirmatory.",
            "No statistical claim is produced while the dataset is absent.",
        ],
        "coverage_parameters": COVERAGE_PARAMETERS,
    }
    return store.write("experiment_register.json", register)


def cmd_audit(store: ArtifactStore, args) -> int:
    from .ingest import audit_raw_data
    audit = audit_raw_data(compute_checksums=not args.no_checksums)
    store.write("dataset_audit.json", audit)
    ok = audit["all_present"]
    store.stage("audit", "ok" if ok else "partial",
                {"n_present": audit["n_present"], "n_missing": audit["n_missing"]},
                "dataset_audit.json")
    print(f"[audit] {audit['n_present']}/{audit['n_expected']} competition files present in "
          f"{audit['data_dir']}")
    for f in audit["files"]:
        status = "PRESENT" if f["present"] else "MISSING "
        extra = (f" rows={f['row_count']}" if f["present"] else "")
        print(f"  {status}  {f['filename']}{extra}")
        if f["present"] and f["error"]:
            print(f"          ! {f['error']}")
    if not ok:
        print("[audit] Missing files listed above. Analytical stages are gated until "
              "the competition package is placed in the raw data directory.")
    return 0


def _require(store: ArtifactStore, stage: str, files: list[str]) -> bool:
    from .ingest import audit_raw_data
    audit = audit_raw_data(compute_checksums=False)
    missing = [f for f in files if not any(x["filename"] == f and x["present"] for x in audit["files"])]
    if missing:
        store.stage(stage, "gated_on_data", {"missing": missing}, None)
        store.write(f"{stage}_results.json",
                    gated_payload(stage, "required competition files absent", missing,
                                  f"Place the competition CSVs in {resolve_data_dir()} and re-run."))
        print(f"[{stage}] GATED ON DATA -- missing: {', '.join(missing)}")
        return False
    return True


def cmd_quality(store: ArtifactStore, args) -> int:
    if not _require(store, "quality", ["combine_tracking.csv"]):
        return 0
    from .combine import extract_attempt_features, load_attempt_frames
    from .ingest import load_players
    from .quality import quality_report_from_attempts
    frames = load_attempt_frames()
    players = load_players()
    _, quality_rows = extract_attempt_features(frames, players)
    report = quality_report_from_attempts(quality_rows)
    report["stage"] = "combine_tracking_quality"
    store.write("data_quality_report.json", report)
    store.stage("quality", "ok", {"n_attempts": report.get("n_attempts")},
                "data_quality_report.json")
    print(f"[quality] {report.get('n_attempts', 0)} combine attempts audited; "
          f"{report.get('n_usable', 0)} usable")
    return 0


def cmd_features(store: ArtifactStore, args) -> int:
    if not _require(store, "features", ["combine_tracking.csv", "players.csv"]):
        return 0
    from .combine import (load_attempt_frames, player_level_mri, sensitivity_from_frames,
                          extract_attempt_features, traditional_combine_table)
    from .ingest import load_players
    frames = load_attempt_frames()
    players = load_players()
    feature_rows, _ = extract_attempt_features(frames, players)
    result = player_level_mri(feature_rows, players)
    result["sensitivity"] = sensitivity_from_frames(frames)
    trad = traditional_combine_table()
    result["traditional_available"] = trad is not None
    store.write("combine_features.json", {k: v for k, v in result.items() if k != "sensitivity"})
    store.write("mri_sensitivity.json", result["sensitivity"])
    # parquet for the app/API layer
    import polars as pl
    pl.DataFrame(result["players"]).write_parquet(store.root / "combine_players.parquet")
    store.stage("features", "ok",
                {"n_players_with_features": len(result["players"])}, "combine_features.json")
    print(f"[features] MRI extracted for {len(result['players'])} players")
    return 0


def cmd_coverage(store: ArtifactStore, args) -> int:
    needed = ["players.csv", "games.csv", "player_play.csv",
              "game_tracking_2023.csv", "game_tracking_2024.csv", "game_tracking_2025.csv"]
    if not _require(store, "coverage", needed):
        return 0
    import polars as pl
    from .coverage import (aggregate_player_coverage, analyse_coverage_play,
                           associate_receiver, build_coverage_plays,
                           fetch_game_frames)
    from .ingest import (duckdb_conn, load_games, load_player_play, load_players,
                         register_tracking_views)
    players, games = load_players(), load_games()
    player_play = load_player_play()
    db_rows, receivers = build_coverage_plays(players, games, player_play)
    conn = duckdb_conn()
    register_tracking_views(conn)
    play_rows, unresolved = [], 0
    # One tracking scan per GAME, not per play: the 2027 files have no play
    # index, so a per-play query re-reads ~2 GiB each time (~5 s).
    by_game: dict[int, list[dict]] = {}
    for r in db_rows.iter_rows(named=True):
        by_game.setdefault(r["game_id"], []).append(r)
    for i, (game_id, rows) in enumerate(sorted(by_game.items()), 1):
        frames = fetch_game_frames(conn, game_id)
        if frames is None:
            unresolved += len(rows)
            continue
        for db_row in rows:
            play = frames.filter(pl.col("play_id") == db_row["play_id"])
            if play.height == 0:
                unresolved += 1
                continue
            recv_id, assoc_method = associate_receiver(db_row, receivers, play)
            summary = analyse_coverage_play(play, db_row["nfl_id"], recv_id,
                                            association_method=assoc_method)
            if summary:
                summary["game_id"], summary["play_id"] = db_row["game_id"], db_row["play_id"]
                play_rows.append(summary)
        if i % 25 == 0 or i == len(by_game):
            print(f"[coverage]   game {i}/{len(by_game)} — {len(play_rows)} reps, "
                  f"{unresolved} unresolved", flush=True)
    player_rows = aggregate_player_coverage(play_rows)
    store.write("coverage_features.json", {
        "status": "ok",
        "n_db_plays": len(play_rows), "n_unresolved_plays": unresolved,
        "association_methods": {
            "targeted_receiver": sum(1 for r in play_rows if r.get("association_method") == "targeted"),
            "nearest_receiver_proximity": sum(1 for r in play_rows if r.get("association_method") == "nearest"),
        },
        "players": player_rows,
    })
    import polars as pl
    # No DB rows survived (or none yielded a summary): emit a schema-correct
    # empty parquet instead of failing — the JSON above is the record of truth.
    if player_rows:
        pl.DataFrame(player_rows).write_parquet(store.root / "coverage_players.parquet")
    else:
        pl.DataFrame(schema={c: pl.Utf8 for c in
                             ("nfl_id", "sep_at_pass_forward_mean",
                              "sep_at_pass_forward_p90", "open_rate_3yd",
                              "meets_min_exposure")}
                    ).write_parquet(store.root / "coverage_players.parquet")
    store.stage("coverage", "ok", {"n_plays": len(play_rows), "n_players": len(player_rows)},
                "coverage_features.json")
    print(f"[coverage] {len(play_rows)} coverage reps analysed across {len(player_rows)} DBs "
          f"({unresolved} unresolved plays reported)")
    return 0


def cmd_research(store: ArtifactStore, args) -> int:
    if not store.exists("combine_features.json") or not store.exists("coverage_features.json"):
        store.stage("research", "gated_on_data",
                    {"reason": "upstream feature artifacts absent"})
        store.write("research_results.json", gated_payload(
            "research", "features/coverage artifacts absent (data-gated upstream)",
            ["combine_tracking.csv", "game_tracking_*.csv"],
            "Run `audit`, `features`, `coverage` with the competition data present."))
        print("[research] GATED ON DATA (upstream features absent)")
        return 0
    from .research import run_research
    mri = store.read("combine_features.json") or {}
    cov = store.read("coverage_features.json") or {}
    from .combine import traditional_combine_table
    from .ingest import load_career_successes, load_players
    trad = traditional_combine_table()
    career = load_career_successes() if (resolve_data_dir() / "player_career_successes.csv").exists() else None
    try:
        players = load_players()
        ctx = players.select(["nfl_id", "draft_year", "draft_round"])
        if trad is not None:
            # height/weight live in combine_results.csv (combine_height/combine_weight)
            height_cols = [c for c in ("combine_combine_height", "combine_combine_weight")
                           if c in trad.columns]
            if height_cols:
                trad_h = trad.select(["nfl_id"] + height_cols).rename(
                    {c: c.replace("combine_combine_height", "height_inches")
                       .replace("combine_combine_weight", "weight") for c in height_cols})
                ctx = ctx.join(trad_h, on="nfl_id", how="left")
        context = ctx
    except Exception:
        context = None
    result = run_research(mri.get("players", []), cov.get("players", []), trad, career, context)
    store.write("research_results.json", result)
    store.stage("research", result.get("status", "ok"),
                {"n_players": result.get("n_players")}, "research_results.json")
    print(f"[research] status={result.get('status')} n={result.get('n_players')}")
    if result.get("status") == "ok":
        pr = result["primary_hypothesis_result"]
        print(f"  partial rho={pr['partial_spearman_rho']} perm-p={pr['permutation_p']}")
    return 0


def cmd_build_tracking_db(args) -> int:
    """One-time import of game_tracking CSVs into a sorted persistent DuckDB."""
    import time
    from .ingest import build_tracking_db
    t0 = time.time()
    db_path = build_tracking_db()
    size_mb = db_path.stat().st_size / 1e6
    print(f"[build-tracking-db] {db_path} ({size_mb:.1f} MiB) built in {time.time() - t0:.1f}s")
    return 0

def cmd_demo(store: ArtifactStore, args) -> int:
    """Regenerate the clearly-labelled synthetic algorithm demonstration."""
    import numpy as np
    from .mri import attempt_components, sensitivity_scan
    from .synth import synthetic_coverage_play, synthetic_shuttle_attempt
    drill = synthetic_shuttle_attempt()
    f = attempt_components(np.array(drill["x"]), np.array(drill["y"]), drill["dt"])
    demo = {
        "synthetic": True,
        "label": drill["label"],
        "generated_by": f"shadowline {PIPELINE_VERSION} demo stage",
        "drill_trajectory": drill,
        "computed_components": f.to_dict(),
        "sensitivity": sensitivity_scan(np.array(drill["x"]), np.array(drill["y"]),
                                        drill["dt"],
                                        {"recovery_threshold": [0.6, 0.7, 0.8]}),
        "coverage_play": synthetic_coverage_play(),
    }
    store.write("demo/synthetic_drill.json", demo)
    store.stage("demo", "ok", {"synthetic": True, "clearly_labelled": True},
                "demo/synthetic_drill.json")
    print("[demo] Synthetic algorithm demonstration regenerated (clearly labelled, "
          "never used as evidence)")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="shadowline", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", type=Path, default=None,
                    help="Override raw data directory (default: data/raw or Kaggle input)")
    ap.add_argument("--no-checksums", action="store_true",
                    help="Skip SHA-256 computation for large-file audits")
    ap.add_argument("--run-id", default=None)
    sub = ap.add_subparsers(dest="command", required=True)
    for name, help_ in [("audit", "Phase 1 dataset audit"),
                        ("quality", "Phase 2 tracking quality report"),
                        ("features", "Phase 3 MRI feature extraction"),
                        ("coverage", "Phase 4 coverage analytics"),
                        ("research", "Phase 5 statistical validation"),
                        ("demo", "Regenerate synthetic algorithm demo"),
                        ("build-tracking-db", "One-time: import tracking CSVs into a sorted persistent DuckDB"),
                        ("all", "Run every stage (data-gated stages report honestly)")]:
        sub.add_parser(name, help=help_)
    pf = sub.add_parser(
        "preflight",
        help="Dataset activation check: presence + required columns per file "
             "(no ingestion, no artifacts touched)")
    pf.add_argument("--rows", action="store_true",
                    help="Also count data rows (byte-scan; slower on the full package)")

    args = ap.parse_args(argv)
    if args.data_dir:
        import shadowline.config as cfg
        cfg.DATA_DIR = args.data_dir
        import os
        os.environ["SHADOWLINE_DATA_DIR"] = str(args.data_dir)

    # Preflight is deliberately side-effect free: no artifact store, no run,
    # no stage recording — an instant readiness answer for the operator.
    if args.command == "preflight":
        from .preflight import main as preflight_main
        return preflight_main(count_rows=args.rows)
    if args.command == "build-tracking-db":
        return cmd_build_tracking_db(args)

    store = ArtifactStore(run_id=args.run_id)
    print(f"SHADOWLINE v{PIPELINE_VERSION} | metric {METRIC_VERSION} | "
          f"artifacts v{ARTIFACT_SCHEMA_VERSION} | data dir: {resolve_data_dir()}")

    # stages that always run (no data required)
    stage_metric_catalog(store)
    stage_experiment_register(store)
    cmd_demo(store, args)

    rc = 0
    try:
        if args.command == "audit":
            rc = cmd_audit(store, args)
        elif args.command == "quality":
            rc = cmd_quality(store, args)
        elif args.command == "features":
            rc = cmd_features(store, args)
        elif args.command == "coverage":
            rc = cmd_coverage(store, args)
        elif args.command == "research":
            rc = cmd_research(store, args)
        elif args.command == "all":
            rc = max(cmd_audit(store, args), cmd_quality(store, args),
                     cmd_features(store, args), cmd_coverage(store, args),
                     cmd_research(store, args))
    except Exception as exc:  # hard failure: report, never hide
        store.stage(args.command, "failed", {"error": str(exc), "type": type(exc).__name__})
        print(f"[{args.command}] FAILED: {exc}", file=sys.stderr)
        rc = 1

    store.write_manifest()
    print(f"[done] run_id={store.run_id} artifacts={store.root}")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())

"""Integration tests: ingestion, schema reconciliation, referential integrity,
quality checks (injected anomalies), and the full pipeline end-to-end on the
synthetic mini package. Proves MECHANICS only -- no analytical claims derive
from these fixtures."""
import json

import numpy as np
import polars as pl
import pytest

from shadowline.ingest import (audit_raw_data, canonical_drill, count_rows,
                               load_games, load_player_play, load_players,
                               parse_height_inches, position_group,
                               referential_integrity, regular_season_games)
from shadowline.quality import (attempt_quality_verdict, dt_stats, frame_gap_stats,
                                ks_cohort_test, quality_report_from_attempts)


class TestNormalisation:
    def test_drill_canonicalisation(self):
        assert canonical_drill("40 Yard Dash")[0] == "forty"
        assert canonical_drill("40_YARD_DASH")[0] == "forty"
        assert canonical_drill("20-Yard Shuttle")[0] == "short_shuttle"
        assert canonical_drill("3-Cone Drill")[0] == "three_cone"
        raw, recognised = canonical_drill("Mystery Drill X")
        assert raw == "mystery_drill_x" and not recognised

    def test_position_groups(self):
        assert position_group("CB") == "DB"
        assert position_group("FS") == "DB"
        assert position_group("WR") == "WR"
        assert position_group("OT") == "OL"

    def test_height_parsing(self):
        assert parse_height_inches("6-1") == 73
        assert parse_height_inches("6'1\"") == 73
        assert parse_height_inches(73) == 73
        assert parse_height_inches("garbage") is None


class TestAudit:
    def test_audit_detects_absence(self, tmp_path):
        audit = audit_raw_data(tmp_path)
        assert audit["n_present"] == 0
        assert audit["n_missing"] == 9
        assert audit["all_present"] is False

    def test_audit_mini_package(self, mini_dataset_dir):
        audit = audit_raw_data(mini_dataset_dir, compute_checksums=True)
        assert audit["all_present"] is True
        assert all(f["sha256"] for f in audit["files"])
        for f in audit["files"]:
            assert f["reconciliation"]["ok"], (f["filename"], f["reconciliation"])
        players_audit = next(f for f in audit["files"] if f["filename"] == "players.csv")
        assert players_audit["row_count"] == 6

    def test_audit_flags_missing_required_column(self, tmp_path):
        (tmp_path / "players.csv").write_text("display_name,position\nA,CB\n")
        audit = audit_raw_data(tmp_path)
        pa = next(f for f in audit["files"] if f["filename"] == "players.csv")
        assert "nfl_id" in pa["reconciliation"]["missing_required"]
        assert pa["error"]

    def test_camel_case_aliases_reconcile(self, tmp_path):
        (tmp_path / "games.csv").write_text(
            "gameId,season,game_type\n2001,2023,REG\n")
        audit = audit_raw_data(tmp_path)
        ga = next(f for f in audit["files"] if f["filename"] == "games.csv")
        assert ga["reconciliation"]["ok"]
        assert "gameId" in ga["reconciliation"]["alias_matched"]

    def test_row_count(self, tmp_path):
        p = tmp_path / "x.csv"
        p.write_text("a,b\n1,2\n3,4\n5,6\n")
        assert count_rows(p) == 3


class TestLoaders:
    def test_load_players(self, mini_dataset_dir):
        df = load_players(mini_dataset_dir)
        assert df.height == 6
        assert set(df["position_group"].to_list()) <= {"DB", "WR"}
        assert df["nfl_id"].dtype == pl.Int64
        assert df["height_inches"].to_list()[0] == 72  # 6-0

    def test_regular_season_filter(self, mini_dataset_dir):
        games = load_games(mini_dataset_dir)
        reg = regular_season_games(games)
        assert reg.height == 4  # one POST game excluded
        assert "game_type" in games.columns

    def test_player_play_typed(self, mini_dataset_dir):
        pp = load_player_play(mini_dataset_dir)
        assert pp.height == 10
        assert "separation_at_pass_forward" in pp.columns


class TestReferentialIntegrity:
    def test_linkage_report(self, mini_dataset_dir):
        players = load_players(mini_dataset_dir)
        games = load_games(mini_dataset_dir)
        pp = load_player_play(mini_dataset_dir)
        # tracking keys for 2023 (game 2001 lives in game_tracking_2023.csv)
        keys = {(2001, 10, 100001), (2001, 11, 100001), (2001, 10, 100002),
                (2001, 11, 100002), (2001, 10, 100004), (2001, 11, 100004)}
        pp_2023 = pp.filter(pl.col("game_id") == 2001)
        rep = referential_integrity(players, games, pp_2023, {2023: keys})
        assert any(c["check"] == "player_play_key_unique" and c["ok"] for c in rep["checks"])
        linkage = next(c for c in rep["checks"] if c["check"] == "gt2023_player_play_linkage")
        # every 2023 player_play row has tracking in the mini package
        assert linkage["detail"]["player_play_keys_without_tracking"] == 0

    def test_orphan_detection(self, mini_dataset_dir):
        players = load_players(mini_dataset_dir)
        games = load_games(mini_dataset_dir)
        pp = load_player_play(mini_dataset_dir)
        pp = pp.with_columns(pl.when(pl.col("nfl_id") == 100001)
                             .then(pl.lit(999999)).otherwise(pl.col("nfl_id"))
                             .alias("nfl_id"))
        rep = referential_integrity(players, games, pp, None)
        orphan = next(c for c in rep["checks"] if c["check"] == "player_play_players_in_players")
        assert orphan["ok"] is False
        assert orphan["detail"]["orphan_rows"] == 2


class TestQualityChecks:
    def _clean_attempt(self, n=60):
        t = np.arange(n) * 0.1
        x = 5.0 * t
        y = np.full(n, 5.0)
        return x, y, t

    def test_clean_attempt_usable(self):
        x, y, t = self._clean_attempt()
        v = attempt_quality_verdict(x, y, t)
        assert v["usable"] is True
        assert v["flags"] == []
        assert v["sampling"]["share_within_tolerance"] == 1.0

    def test_missing_frames_detected(self):
        x, y, t = self._clean_attempt()
        keep = np.ones(len(t), bool)
        keep[20:25] = False  # 0.5 s gap
        f_orig = np.arange(len(t))
        v = attempt_quality_verdict(x[keep], y[keep], t[keep], f_orig[keep])
        assert "missing_frames" in v["flags"]

    def test_repeated_frames_detected(self):
        x, y, t = self._clean_attempt()
        x2 = np.insert(x, 30, x[30])
        y2 = np.insert(y, 30, y[30])
        t2 = np.insert(t, 30, t[30])
        f2 = np.insert(np.arange(len(t)), 30, 30)
        v = attempt_quality_verdict(x2, y2, t2, f2)
        assert "repeated_frames" in v["flags"]

    def test_teleport_detected(self):
        x, y, t = self._clean_attempt()
        x = x.copy()
        x[40] = x[40] + 15.0  # 15-yard instantaneous jump
        v = attempt_quality_verdict(x, y, t)
        assert "implausible_speed" in v["flags"]

    def test_impossible_accel_detected(self):
        t = np.arange(60) * 0.1
        s = np.full(60, 5.0)
        s[30:33] = [5.0, 11.0, 5.0]  # |ds|=6 yd/s in one 0.1 s step
        x = np.concatenate([[0.0], np.cumsum(s[1:] * 0.1)])
        y = np.zeros_like(x)
        v = attempt_quality_verdict(x, y, t, None, s)
        assert "impossible_accel" in v["flags"]

    def test_out_of_field_detected_game_domain(self):
        x, y, t = self._clean_attempt()
        x = x.copy()
        x[10] = 130.0
        v = attempt_quality_verdict(x, y, t, domain="game")
        assert "out_of_field" in v["flags"]
        assert v["usable"] is False

    def test_short_attempt(self):
        v = attempt_quality_verdict(np.arange(8) * 0.5, np.full(8, 5.0),
                                    np.arange(8) * 0.1)
        assert "short_attempt" in v["flags"]

    def test_unreliable_dis_field_recommends_reconstruction(self):
        x, y, t = self._clean_attempt()
        dis = np.full(len(x), 0.9)  # claimed 0.9 yd/frame vs true 0.5
        v = attempt_quality_verdict(x, y, t, supplied_dis=dis)
        assert "dis_field_unreliable" in v["flags"]
        assert v["use_reconstructed_distance"] is True

    def test_dt_stats(self):
        d = dt_stats(np.arange(50) * 0.1)
        assert d["share_within_tolerance"] == 1.0
        assert d["n_zero_or_negative"] == 0

    def test_cohort_ks_test(self):
        rng = np.random.default_rng(3)
        a = rng.normal(0.100, 0.002, 200)
        b = rng.normal(0.100, 0.002, 200)
        c = rng.normal(0.104, 0.002, 200)  # shifted cohort (e.g. different vendor config)
        rep = ks_cohort_test({"2023": a, "2024": b}, "dt")
        assert all(not p["materially_different"] for p in rep["pairs"])
        rep2 = ks_cohort_test({"2023": a, "2025": c}, "dt")
        assert all(p["materially_different"] for p in rep2["pairs"])

    def test_quality_report_aggregation(self):
        rows = [{"nfl_id": 1, "drill": "d", "attempt": 1, "flags": ["short_attempt"],
                 "usable": False, "use_reconstructed_distance": True},
                {"nfl_id": 2, "drill": "d", "attempt": 1, "flags": [],
                 "usable": True, "use_reconstructed_distance": False}]
        rep = quality_report_from_attempts(rows)
        assert rep["n_attempts"] == 2 and rep["n_usable"] == 1
        assert rep["flag_counts"] == {"short_attempt": 1}
        assert rep["reconstructed_distance_recommended"] is True

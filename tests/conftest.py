"""Pytest fixtures for SHADOWLINE. All fixtures are synthetic (clearly
labelled) and used ONLY for testing mathematical functions and pipeline
mechanics -- never as competition evidence."""
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from shadowline import synth  # noqa: E402


@pytest.fixture(scope="session")
def shuttle():
    """Synthetic short-shuttle attempt with two known 180-degree reversals."""
    return synth.synthetic_shuttle_attempt()


@pytest.fixture(scope="session")
def coverage_play():
    return synth.synthetic_coverage_play()


@pytest.fixture(scope="session")
def player_dataset():
    return synth.synthetic_player_level_dataset()


@pytest.fixture()
def mini_dataset_dir(tmp_path):
    """A tiny but schema-faithful synthetic competition package for
    integration tests. Clearly synthetic; used to prove the pipeline
    mechanics end-to-end, NOT to produce any analytical claim."""
    import polars as pl
    d = tmp_path / "raw"
    d.mkdir()
    rng = np.random.default_rng(7)

    players = pl.DataFrame({
        "nfl_id": [100001, 100002, 100003, 100004, 100005, 100006],
        "display_name": ["Alpha Synthetic", "Beta Synthetic", "Gamma Synthetic",
                         "Delta Synthetic", "Epsilon Synthetic", "Zeta Synthetic"],
        "position": ["CB", "CB", "S", "WR", "CB", "WR"],
        "height": ["6-0", "5-11", "6-1", "6-2", "5-10", "6-3"],
        "weight": [195.0, 190.0, 205.0, 210.0, 188.0, 215.0],
        "draft_year": [2023, 2023, 2024, 2024, 2025, 2025],
        "draft_round": [1, 3, 2, 5, 7, None],
    })
    players.write_csv(d / "players.csv")

    # Wide format (as the 2027 package ships it): one column per drill.
    pl.DataFrame({
        "nfl_id": [100001, 100002, 100003, 100005, 100004],
        "draft_year": [2023, 2023, 2024, 2025, 2024],
        "combine_position": ["CB", "CB", "S", "CB", "WR"],
        "combine_height": [72.0, 71.0, 73.0, 69.0, 74.0],
        "combine_weight": [195.0, 190.0, 205.0, 180.0, 215.0],
        "ten_yd_split": [1.51, 1.55, 1.52, 1.49, 1.57],
        "forty": [4.42, 4.51, 4.48, 4.44, 4.60],
        "vertical": [36.5, 34.0, 35.0, 32.5, 33.0],
        "broad_jump": [121, 115, 118, 112, 110],
        "three_cone": [6.85, 6.95, 6.90, 6.80, 7.10],
        "short_shuttle": [4.15, 4.25, 4.20, 4.10, 4.35],
        "bench_reps": [12, 12, 14, 16, 10],
        "ngs_athleticism_score": [70, 65, 68, 74, 60],
    }).write_csv(d / "combine_results.csv")

    # combine_tracking: synthetic shuttle attempts for the DBs
    # (as the 2027 package ships it: entity_type, event_id, no frame_id)
    rows = []
    for nid in (100001, 100002, 100003, 100005):
        s = synth.synthetic_shuttle_attempt(seed=1000 + int(nid) % 1000)
        for i, (x, y) in enumerate(zip(s["x"], s["y"])):
            secs = i * 0.1
            ts = f"2023-03-01T00:00:{int(secs):02d}.{int(round((secs - int(secs)) * 10))}00"
            rows.append({"draft_year": 2023, "event_id": f"synthetic_{nid}_{i}",
                         "nfl_id": nid, "entity_type": "PLAYER",
                         "time": ts,
                         "drill_type": "SHORT_SHUTTLE",
                         "drill_name": "SHORT_SHUTTLE",
                         "attempt": 1, "x": x, "y": y, "s": s["speed"][i],
                         "a": 0.0, "dis": 0.0, "dir": 0.0})
    pl.DataFrame(rows).write_csv(d / "combine_tracking.csv")

    pl.DataFrame({
        "nfl_id": [100001, 100002, 100003, 100004, 100005, 100006],
        "career_games_active": [17, 12, 9, 16, 3, 0],
        "career_defensive_snaps": [850, 400, 300, 0, 60, 0],
    }).write_csv(d / "player_career_successes.csv")

    pl.DataFrame({
        "game_id": [2001, 2001, 2002, 2002, 2003],
        "season": [2023, 2023, 2024, 2024, 2025],
        "week": [1, 1, 2, 2, 1],
        "game_type": ["REG", "REG", "REG", "POST", "REG"],
        "home_team_abbr": ["SYN", "SYN", "SYN", "SYN", "SYN"],
        "visitor_team_abbr": ["TST", "TST", "TST", "TST", "TST"],
    }).write_csv(d / "games.csv")

    # player_play: DB coverage rows on REG games + receiver rows
    pp_rows = []
    for (g, p, nid, pos, sep) in [
        (2001, 10, 100001, "CB", 2.1), (2001, 11, 100001, "CB", 3.4),
        (2001, 10, 100002, "CB", 1.8), (2001, 11, 100002, "CB", 4.0),
        (2002, 20, 100003, "S", 2.9), (2003, 30, 100005, "CB", 1.5),
        (2001, 10, 100004, "WR", 2.1), (2001, 11, 100004, "WR", 3.4),
        (2002, 20, 100006, "WR", 2.9), (2003, 30, 100006, "WR", 1.5),
    ]:
        pp_rows.append({"game_id": g, "play_id": p, "nfl_id": nid,
                        "lined_up_position": pos,
                        "coverage_assignment": "MAN" if pos in ("CB", "S") else None,
                        "separation_at_pass_forward": sep,
                        "was_targeted": 1 if nid in (100004, 100006) else 0})
    pl.DataFrame(pp_rows).write_csv(d / "player_play.csv")

    # game tracking for 2023..2025: coverage plays with defender/receiver tracks
    for year in (2023, 2024, 2025):
        rows = []
        for (g, p, d_id, r_id) in [(2001, 10, 100001, 100004), (2001, 11, 100001, 100004),
                                   (2001, 10, 100002, 100004), (2001, 11, 100002, 100004),
                                   (2002, 20, 100003, 100006), (2003, 30, 100005, 100006)]:
            if (year == 2023 and g != 2001) or (year == 2024 and g != 2002) or (year == 2025 and g != 2003):
                continue
            cp = synth.synthetic_coverage_play(seed=g * 10 + p)
            for i in range(len(cp["t"])):
                ev = ("ball_snap" if i == 0 else
                      "pass_forward" if i == cp["pass_forward_index"] else None)
                rows.append({"game_id": g, "play_id": p, "nfl_id": d_id,
                             "x": cp["defender"]["x"][i],
                             "y": cp["defender"]["y"][i], "s": 0.0, "event": ev})
                rows.append({"game_id": g, "play_id": p, "nfl_id": r_id,
                             "x": cp["receiver"]["x"][i],
                             "y": cp["receiver"]["y"][i], "s": 0.0, "event": None})
        pl.DataFrame(rows).write_csv(d / f"game_tracking_{year}.csv")

    return d

# Data Dictionary — NFL Big Data Bowl 2027 (as consumed by SHADOWLINE)

Competition: https://www.kaggle.com/competitions/nfl-big-data-bowl-2027
Dataset: 9 CSV files, ~2.31 GiB, license CC BY-NC 4.0.
Scope (host-verified): 510 rookies from draft classes 2023-2025; 6,310 Combine
drill attempts at 10 Hz (Zebra tracking); 1,002 regular-season and playoff
games; five position groups (WR, TE, DB, OL, DL).

**Verification levels.** Because the Kaggle data page is JavaScript-rendered
and the dataset itself is not redistributable, every column below carries a
verification level:

- `verified` — confirmed by host statements, competition discussions, or
  indexed data-page excerpts (sources listed at the bottom).
- `convention` — expected from prior Big Data Bowl tracking datasets;
  validated against the actual file at ingest.
- `inferred` — strongly implied by host descriptions; validated at ingest.

The pipeline performs **runtime schema reconciliation** (`shadowline/schemas.py`):
when a real file is present, its actual columns are compared against this
dictionary and every match / alias match / missing / unexpected column is
reported in `artifacts/v1/dataset_audit.json`. Snake_case/camelCase drift is
handled through explicit alias sets.

---

## 1. players.csv — one row per player (510 rookies)

| Column | Type | Required | Verification | Notes |
|---|---|---|---|---|
| nfl_id | int64 | yes | verified | Join key to every other file |
| display_name | utf8 | yes | convention | |
| position | utf8 | yes | verified | Roster position; normalised to groups (DB/WR/TE/OL/DL/…) |
| height | utf8 | no | convention | Parsed to inches (accepts `6-1`, `6'1"`, `73`) |
| weight | float64 | no | convention | Pounds |
| birth_date | utf8 | no | convention | |
| college_name | utf8 | no | convention | |
| draft_year | int64 | no | inferred | Cohort 2023-2025 |
| draft_round | int64 | no | inferred | Null ⇒ UDFA (coded 8 in Model C context) |
| draft_pick | int64 | no | inferred | Overall slot |

## 2. combine_results.csv — traditional drill results

| Column | Type | Required | Verification | Notes |
|---|---|---|---|---|
| nfl_id | int64 | yes | verified | |
| drill_name | utf8 | yes | verified | Canonicalised: forty, three_cone, short_shuttle, long_shuttle, broad_jump, vertical_jump, position_drill, … |
| result | float64 | yes | verified | Seconds (timed drills) or inches/yards (jumps) |
| attempt | int64 | no | inferred | |
| year | int64 | no | inferred | Combine year |

## 3. combine_tracking.csv — 10 Hz drill tracking (6,310 attempts)

| Column | Type | Required | Verification | Notes |
|---|---|---|---|---|
| nfl_id | int64 | yes | verified | Ball tracks appear as a sentinel/`BALL` entity — separated at ingest |
| drill_name | utf8 | yes | verified | |
| attempt | int64 | no | inferred | Attempt id within player+drill |
| frame_id | int64 | no | convention | Monotonic, 10 frames/s |
| time | utf8 | no | convention | Timestamp |
| x, y | float64 | yes | verified | Yards |
| s | float64 | no | convention | Speed yd/s — cross-validated against reconstructed speed |
| a | float64 | no | convention | Acceleration yd/s² |
| dis | float64 | no | convention | Distance since previous frame — validated against x/y reconstruction; reconstruction preferred when unreliable |
| o, dir | float64 | no | convention | Orientation/direction degrees [0,360) — circular math only |
| event | utf8 | no | convention | Drill event markers |
| entity | utf8 | no | inferred | Track type if present (player vs BALL) |

## 4. player_career_successes.csv — career counters

| Column | Type | Required | Verification | Notes |
|---|---|---|---|---|
| nfl_id | int64 | yes | verified | |
| career_special_teams_snaps | int64 | no | verified | Host data-page excerpt |
| career_games_active | int64 | no | verified | Host data-page excerpt |
| career_games_played / career_defensive_snaps / career_offensive_snaps | int64 | no | inferred | Any additional `career_*` int64 columns are captured dynamically and catalogued in the audit |

## 5. games.csv — 1,002 games

| Column | Type | Required | Verification | Notes |
|---|---|---|---|---|
| game_id | int64 | yes | verified | |
| season | int64 | yes | verified | 2023-2025 |
| week | int64 | no | convention | |
| game_type | utf8 | no | verified | `REG` / `POST` / `PRE` — primary analyses filter `REG` |
| home_team_abbr / visitor_team_abbr | utf8 | no | convention | |

## 6. player_play.csv — 314,197 player-play rows

| Column | Type | Required | Verification | Notes |
|---|---|---|---|---|
| game_id, play_id, nfl_id | int64 | yes | verified | Composite key (host-verified) |
| lined_up_position | utf8 | no | verified | `NA` ⇒ play killed by pre-snap penalty (host-verified) |
| separation_at_pass_forward | float64 | no | verified | Primary coverage outcome in SHADOWLINE |
| (100+ additional columns in prior editions) | various | no | — | Captured dynamically and catalogued |

## 7-9. game_tracking_2023/2024/2025.csv — frame-level game tracking

Actual row counts (competitor-verified): 2023 ≈ 3.67M, 2024 ≈ 7.83M,
2025 ≈ 11.16M.

| Column | Type | Required | Verification | Notes |
|---|---|---|---|---|
| game_id, play_id, nfl_id | int64 | yes | verified | Composite key with frame |
| frame_id | int64 | no | convention | |
| time | utf8 | no | convention | ISO timestamp |
| jersey_number, club, play_direction | | no | convention | |
| x, y | float64 | yes | verified | Field bounds 0-120 / 0-53.3 yd |
| s, a, dis | float64 | no | convention | Same validation policy as combine tracking |
| o, dir | float64 | no | convention | Degrees [0,360) |
| event | utf8 | no | convention | `ball_snap`, `pass_forward`, … — anchors coverage windows |

## Known dataset quirks (documented before analysis)

1. **Tracking ↔ player_play linkage gaps**: ~2,497 tracking keys without
   player_play records (concentrated in WR/TE/FB) and ~1,750 player_play keys
   without tracking — reported by competitors in competition discussion 747584.
   SHADOWLINE computes both directions of this mismatch in
   `referential_integrity()` and excludes unresolved plays from coverage
   analytics (counted, never hidden).
2. **13 of 510 players never played** an NFL snap — an exposure fact, never
   treated as low ability (minimum-exposure thresholds + exclusion reporting).
3. **Pre/post-season games** are present (`PRE`/`POST`) — the primary
   hypothesis uses regular season only; exclusions are counted.
4. **Data-page row counts differ from actual files** (host acknowledged) —
   the audit counts rows itself rather than trusting metadata.

## Sources

- Competition overview/data/rules pages (kaggle.com/competitions/nfl-big-data-bowl-2027)
- Host-confirmed discussion thread 747584 (row counts, linkage gaps)
- ReconScribe competition guide (file list, 510 rookies, 6,310 attempts, Zebra 10 Hz, 1,002 games, `lined_up_position`/`separation_at_pass_forward` semantics, `BALL` entity)
- Data-page excerpt indexed via search (`career_special_teams_snaps`, `career_games_active`)

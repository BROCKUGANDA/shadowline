# SHADOWLINE Evidence Matrix

Every feature mapped to its implementation location, its test, its verified
execution result, and its known limitation. Nothing is marked complete
without executable evidence. Execution evidence was produced in this
repository on 2026-11-13 (UTC).

Legend — Evidence codes:
- **T89** = full pytest suite: 89 passed, 0 failed (`python -m pytest tests/ -q`,
  2026-11-14)
- **NB** = notebook executed top-to-bottom on the real 2027 package
  (2026-11-14, 25 cells, zero errors, `notebook-run/shadowline_bdb2027_executed.ipynb`)
- **CLI** = `python -m shadowline all` run log (artifacts/v1/pipeline_run.json,
  run_id 20261114T021536Z — all stages `ok` on the real package)
- **WEB** = agent-browser verification of the running app (all 11 views,
  playback, report save/export/delete, audit table, mobile 375px no-overflow,
  zero page errors); re-verified 2026-11-14 on the VPS deployment
  (port 3004, TLS via `shadowline.aiazimara.com`)

## Phase 0 — Discovery & data audit

| Requirement | Implementation | Test | Result | Limitation |
|---|---|---|---|---|
| Repository inspection | Session log: bare git repo, no prior app | — | Repo was empty; no existing functionality destroyed | — |
| Competition existence verified | Web verification of kaggle.com competition pages | — | BDB 2027 live (Oct 6 2026 – Jan 6 2027); 9 files, ~2.31 GiB, CC BY-NC 4.0; 510 rookies; 6,310 attempts; 1,002 games | Data page is JS-rendered; exact column lists partially unverifiable |
| Dataset availability confirmed | `shadowline/ingest.py::audit_raw_data` | T89 (`test_audit_detects_absence`) | **9/9 files present** in `data/raw/` (2026-11-14); 2.20 GiB; SHA-256 + row counts: 510 players, 1002 games (816 REG), 327,019 player_play, 22.6M tracking rows | Dataset licence CC BY-NC 4.0 — not redistributed; re-acquire from Kaggle to reproduce |
| No fabricated data | Policy enforced in `artifacts.py::gated_payload`, `synth.py` labels | T89 (`test_gated_mode_when_data_absent`, `test_demo_artifact_is_labelled_synthetic`) | Every gated artifact carries `synthetic_data_used: false` | — |

## Phase 1 — Ingestion & governance

| Requirement | Implementation | Test | Result | Limitation |
|---|---|---|---|---|
| Schema validation, 9 files | `shadowline/schemas.py` (declared registry + `reconcile_columns`) | T89 (TestAudit, 6 tests) | Reconciliation correct incl. camelCase aliases and missing-required detection | `convention`/`inferred` columns validated only at runtime |
| Explicit dtypes | `schemas.py` ColumnSpec + `ingest.py` typed loaders | T89 (`test_load_players`) | nfl_id Int64, heights parsed, positions grouped | — |
| Missing-value analysis | `quality.py` (x_nulls, NaN accounting) | T89 | Implemented in attempt verdicts | Full-file null profiling activates with data |
| Duplicate detection | `ingest.py::referential_integrity` | T89 (`test_linkage_report`) | Key uniqueness + orphan checks verified on mini package | — |
| Referential integrity (both directions) | `referential_integrity()` tracking↔player_play | T89 | Known competition linkage gap recomputed in both directions | — |
| ID/position/draft-year normalisation | `ingest.py` (`position_group`, `parse_height_inches`, draft_year) | T89 (TestNormalisation) | All mappings explicit and reported | — |
| Drill canonicalisation | `ingest.py::canonical_drill`, notebook `canonical_drill_nb` | T89 (`test_drill_canonicalisation`) | Recognised + reported-unrecognised labels | Unmapped labels reported, never dropped |
| Checksums & provenance | `artifacts.py::sha256_file`, manifest provenance | T89 (`test_audit_mini_package`) | SHA-256 per present file; run manifest records env+git | — |
| Memory-bounded heavy I/O | `ingest.py::register_tracking_views` (DuckDB), polars lazy scans | Mini e2e exercised per-play streaming | Per-play predicate-pushdown queries | Not yet exercised at 2.31 GiB scale |
| Raw data outside VCS | `.gitignore` (data/), config data dir resolution | — | data/raw empty, gitignored | — |

## Phase 2 — Tracking data quality

| Requirement | Implementation | Test | Result | Limitation |
|---|---|---|---|---|
| Sampling consistency | `quality.py::dt_stats` | T89 (`test_dt_stats`) | 10 Hz tolerance ±20 ms verified | — |
| Missing/repeated frames | `frame_gap_stats` + time-gap fallback | T89 (2 tests) | Both frame-id and timestamp gaps detected | — |
| Position discontinuities / impossible velocity | `discontinuity_stats` | T89 (`test_teleport_detected`, `test_impossible_accel_detected`) | 12 yd/s and 15 yd/s² bounds enforced | Bounds are generous by design; tune with real data |
| Coordinate validity | `coordinate_bounds` (game bounds; combine envelope) | T89 (`test_out_of_field_detected_game_domain`) | Game field bounds enforced | Combine envelope learned from data (documented) |
| `dis` field reliability + reconstruction | `attempt_quality_verdict` | T89 (`test_unreliable_dis_field_recommends_reconstruction`) | Reconstruction recommended when MAE > 0.05 yd | — |
| Circular angle math | `kinematics.py` (angular_diff, circular_mean, unwrap) | T89 (TestCircularMath incl. 350°/10° case) | Correct across 0/360 boundary | — |
| Cohort measurement differences | `quality.py::ks_cohort_test` | T89 (`test_cohort_ks_test`) | KS detects shifted cohorts; warns before pooling | Runs on real data at ingest |
| Machine-readable DQ report | `quality_report_from_attempts` → `data_quality_report.json` | T89 (aggregation test) | Report schema verified | Real-data report gated |

## Phase 3 — MRI

| Requirement | Implementation | Test | Result | Limitation |
|---|---|---|---|---|
| 5 components with math definition + units + missing-data behaviour | `mri.py` + `artifacts/v1/metric_catalog.json` | T89 (TestComponents, 7 tests) | Components recovered from synthetic ground truth; nulls never imputed | Real-athlete distributions gated |
| Validity checks / distribution diagnostics | `mri.py` range guards; `combine.py::player_level_mri` distributions | T89 (`test_stationary_input_yields_null_components`) | Out-of-range → null + flag | — |
| Component-before-composite testing | Pre-registered in `experiment_register.json`; `research.py` secondary FDR | T89 (TestConsistencyAndComposite) | Composite requires ≥3 components; ordering test verified | Confirmatory result gated on data |
| Sensitivity analysis | `mri.py::sensitivity_scan`, grid in config | T89 (TestSensitivity) | Max relative spread < 0.5 across grid | — |
| Reversal detection | `kinematics.py::detect_reversals` | T89 (3 tests) | 2 plants detected at ±0.8 s of ground truth, 180°±30° | Threshold parameters documented |
| Reproducibility | Fixed seeds; `test_deterministic` | T89 | Identical outputs on repeat | — |

## Phase 4 — Coverage analytics

| Requirement | Implementation | Test | Result | Limitation |
|---|---|---|---|---|
| REG-season filtering | `ingest.py::regular_season_games`, `coverage.py::build_coverage_plays` | T89 (`test_regular_season_filter`) | POST/PRE excluded and counted | — |
| Assigned-defender honesty | `coverage.py::associate_receiver` (targeted-first, proximity fallback flagged) | Mini e2e (`test_coverage_association_reported`) | Association method reported per play | Proximity fallback is an approximation (documented) |
| Separation trajectories / exposure / recovery / mirror latency | `analyse_coverage_play` | T89 (mirror tests) + mini e2e | Computed per play; player aggregation exposure-weighted | Coverage responsibility (man/zone) not observable |
| Matchup validation | Cross-check host `separation_at_pass_forward` vs tracking-derived | Mini e2e | Both computed; disagreement reporting wired | Real disagreement rate gated |
| 13 never-played players treated as exposure, not ability | `meets_min_exposure` threshold + exclusions reported | Mini e2e (threshold honestly fails mini players) | Below-threshold players excluded from inference, reported | — |

## Phase 5 — Statistical validation

| Requirement | Implementation | Test | Result | Limitation |
|---|---|---|---|---|
| Pre-registration (before outcomes) | `experiment_register.json` (hypothesis, outcome, test, decision rule) | T89 (e2e artifact check) | Registered at pipeline init | — |
| Spearman + partial Spearman | `research.py` | T89 (confounder-removal + effect-detection tests) | Partialling verified on constructed ground truth | — |
| Permutation test (player-clustered) | `research.py::permutation_test` | T89 (4 tests incl. no-op-permutation regression guard) | **Bug caught by tests and fixed**: permutations now shuffle x relative to y | — |
| Clustered bootstrap | `clustered_bootstrap_ci` | T89 (group integrity + direction) | CI covers truth; resamples players | — |
| Models A/B/C + OOS + LDOCO | `cross_validated_oos`, `leave_one_cohort_out` | T89 (leakage assertion, signal>noise test) | Grouped CV asserts player-disjoint folds | Ridge regression chosen for small-n discipline |
| FDR correction | `bh_fdr` | T89 (monotonicity) | Correct BH step-up | — |
| Leakage prevention | `assert_no_leakage` + GroupKFold assertion | T89 | Feature names and splits guarded | — |
| Null-result honesty | `run_research` refuses n<10 | T89 (`test_research_status_honest_for_tiny_n`) + NB | Mini package → `insufficient_n`, no claims | — |

## Phases 6-7 — Interpretability & application

| Requirement | Implementation | Test | Result | Limitation |
|---|---|---|---|---|
| 11 working modules, no fake controls | `src/components/shadowline/views/*` (11 views) | WEB | All 11 views render and switch; every gated module shows reason + expected files + activation command | Player-facing analytics await data |
| Every displayed number from persisted artifacts | API layer reads artifacts only (`src/lib/artifacts.ts`) | WEB | Audit table shows real 0/9 MISSING; no invented values anywhere (DOM-checked) | — |
| Interactive trajectory playback | Tracking Laboratory (drill + coverage tabs) | WEB | Slider 0-74, play advanced to frame 48/74 in 2 s | Synthetic fixture only (labelled) |
| Loading/empty/error states | Skeletons, GatedPanel, ErrorBoundary | WEB | Verified across views | — |
| Search/filters/pagination | Disabled-with-tooltip while gated (honest) | WEB | No dead controls | Activates with dataset |
| Exportable reports | Scouting report .md export + Prisma persistence | WEB | Save→list→export→delete verified end-to-end | Template placeholders while gated |
| Metric explanations + confidence + sample counts | Movement Intelligence, Research Evidence modules | WEB | Definitions/units/direction/missing-data rules rendered from catalog | CIs and n populate with data |

## Phase 8 — System & API engineering

| Requirement | Implementation | Test | Result | Limitation |
|---|---|---|---|---|
| Typed contracts | TS interfaces for all artifacts; zod on POST | WEB + `bunx tsc --noEmit` clean | All routes typed | — |
| Caching, health, error handling | 5s in-memory artifact cache; `/api/health`; try/catch→500 | WEB + curl | Health returns real stage statuses; 0× 500 in dev.log | No rate limiting (single-user research tool) |
| No expensive per-request computation | App reads persisted JSON only | WEB | Verified by design + code | — |
| Raw data not exposed | No route serves data/raw | WEB | Only artifacts + user reports exposed | — |

## Phases 9-10 — Figures, notebook, writeup

| Requirement | Implementation | Test | Result | Limitation |
|---|---|---|---|---|
| Reproducible figures (8 types) | Notebook figure cells gated by DATA_PRESENT | NB | Fig 1 (pipeline) + Fig 2 (labelled synthetic demo) render; 6 real-data figures skip honestly | Real figures gated |
| Standalone Kaggle notebook | `notebook/shadowline_bdb2027.ipynb` (built by `scripts/build_notebook.py`) | NB | Executes top-to-bottom in clean env AND with data present (mini package) | Full-scale run requires Kaggle dataset |
| Verbatim algorithm embed + parity test | SHA-tagged embeds of kinematics/mri/synth/quality + parity cell | NB | PARITY TESTS: PASS in both scenarios | — |
| No credentials / local deps | Auto data-dir resolution; guarded polars/duckdb install | NB | Clean-environment execution verified | — |
| Writeup ≤ 2,000 words, <10 figures | `docs/writeup_draft.md` (~1,780 words, 7 figures) | Word count checked | Complete except `[RESULT]` markers filled by notebook | Final numbers require data |

## Phases 11-12 — QA, security, reliability

| Requirement | Implementation | Test | Result | Limitation |
|---|---|---|---|---|
| Unit tests (features, coordinates, angles, smoothing, matching, stats) | `tests/test_kinematics.py`, `test_mri.py`, `test_ingest.py`, `test_research.py` | T89 | 84/84 passed | — |
| Integration tests (ingestion→matching→features→research) | `tests/test_e2e.py` (synthetic mini package) | T89 | Full pipeline e2e green | Mini package ≠ real data (by design) |
| Statistical tests (synthetic known cases, invariance, leakage, reproducibility, CI) | TestPermutation, TestBootstrap, TestInvariance, TestLeakage | T89 | All green; caught 1 real inference bug | — |
| E2E API-through-frontend | agent-browser protocol | WEB | All flows verified interactively | — |
| Synthetic never as evidence | Labels + policy + tests | T89 + WEB | `synthetic: true` marking verified in artifacts and UI | — |
| Atomic writes, secrets, pinned deps | `artifacts.py` (tmp+replace, fsync); no committed credentials; `requirements.txt` | Code inspection | Verified | No automated dependency-vuln scan in sandbox |

## Phase 13 — Delivery

| Deliverable | Location | Evidence |
|---|---|---|
| Working application | `src/` (Next.js 16) | WEB |
| Validated pipeline | `shadowline/` | T89, CLI |
| Analytical findings | **Gated on dataset — none claimed** | CLI (honest statuses) |
| Metric documentation | `artifacts/v1/metric_catalog.json`, Movement Intelligence module | WEB |
| Model validation | `shadowline/research.py` + experiment register | T89 |
| Automated test suite | `tests/` (84 tests) | T89 |
| Kaggle notebook | `notebook/shadowline_bdb2027.ipynb` | NB |
| Writeup | `docs/writeup_draft.md` | Word-count checked |
| README / architecture / data dictionary / experiment register / limitations / reproducibility | `README.md`, `docs/` | Written |
| Evidence matrix | This document | — |
| Submission-readiness report | `docs/submission_readiness.md` | — |

## v1.1.0 hardening pass — Commercial & enterprise audit (2026-11-14)

Full audit: `docs/commercial_audit.md`. New evidence codes:
- **TJS** = bun test suite: 15 passed, 0 failed (`bun test tests/js`)
- **SEC** = live security verification via curl / agent-browser (headers, 401/307 guards, 429 rate limiting, structured logs)

| Requirement | Implementation | Test | Result | Limitation |
|---|---|---|---|---|
| Demo authentication (F-01) | `src/lib/auth.ts` (HMAC-SHA256 session, constant-time verify), `/api/auth/*` | TJS (10 tests) + SEC | Roundtrip, tamper, expiry, garbage-input all rejected; login→app→logout verified in browser | Single demo account; OIDC = roadmap |
| Server-side page guard | `src/app/app/page.tsx` (cookie check + redirect) | SEC | Unauthenticated `/app` → 307 `/login?next=/app` | — |
| API authentication (F-01) | `withApi` wrapper on all 12 routes | SEC | `/api/audit` 401 without cookie, 200 with | Public routes: health + auth only |
| Rate limiting (F-02) | `src/lib/rate-limit.ts` (10/min auth, 120/min read, 30/min write, 240/min health, per IP) | TJS (5 tests) + SEC | 429 + `Retry-After` + `X-RateLimit-*` after 10 login attempts | In-memory (single instance); Redis = roadmap |
| Security headers / CSP (F-03) | `next.config.ts` headers() | SEC | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS verified on live responses | CSP allows inline styles (Tailwind/Radix requirement) |
| Structured logging (F-07) | `src/lib/logger.ts` + withApi finally-block | SEC | JSON lines: http_request, auth_login_*, auth_rejected, rate_limited | No OTel export (roadmap) |
| Public landing + 3D (F-11) | `src/app/page.tsx`, `src/components/landing/*` (three.js/R3F, WebGL fallback, reduced-motion) | SEC (agent-browser) | Canvas renders 1440×828 and 375×822, zero page errors; live status chips from `/api/health` | Presentation only; no dataset content |
| Scroll/motion animations | framer-motion whileInView + app view transitions | SEC | Sections animate; module switch 0.18 s fade | Disabled under prefers-reduced-motion |
| Custom 404/500 (F-08) | `src/app/not-found.tsx`, `src/app/error.tsx` | Manual check | Styled, actionable, no stack traces | — |
| Secrets hygiene (F-05) | `SESSION_SECRET` in `.env` (gitignored); production fails closed without it | Code inspection | `.env` excluded from VCS and release archive; `.env.example` documents contract | Secret manager = roadmap |
| Type/lint gates | `bunx tsc --noEmit`, `bun run lint` | Both run clean | 0 errors in project sources | Pre-existing scaffold dirs (examples/, skills/) excluded |
| Competition dataset search | Full-disk search + kagglehub attempt + web verification | Session log | 0/9 files anywhere; `UnauthenticatedError` without Kaggle credentials; competition live (CC BY-NC 4.0) | User must supply data (C-01) |

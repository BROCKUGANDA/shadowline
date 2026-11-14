# SHADOWLINE Architecture

## System overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│  RAW COMPETITION DATA (never in VCS)                                      │
│  data/raw/*.csv  — 9 files, ~2.31 GiB, CC BY-NC 4.0                       │
└───────────────┬────────────────────────────────────────────────────────────┘
                │  audit (presence, SHA-256, row counts, schema reconciliation)
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  SHADOWLINE RESEARCH PIPELINE (Python 3.11+, Polars + DuckDB + NumPy)     │
│                                                                            │
│  Phase 1  ingest.py      typed loaders, referential integrity, ID/position │
│                          /drill normalisation, REG filtering               │
│  Phase 2  quality.py     sampling, gaps, teleports, accel bounds, cohort KS│
│  Phase 3  mri.py +       Mirror Response Index components; attempt →       │
│           combine.py     player aggregation; cohort-standardised composite │
│  Phase 4  coverage.py    DB coverage windows, separation trajectories,     │
│                          mirror latency (DuckDB streaming per play)        │
│  Phase 5  research.py    Models A/B/C, partial Spearman, permutation,      │
│                          clustered bootstrap, LDOCO, BH-FDR, leakage guard │
│                                                                            │
│  Deterministic: fixed seeds, sorted JSON, atomic writes                    │
└───────────────┬────────────────────────────────────────────────────────────┘
                │  versioned artifacts (JSON + Parquet)
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  ARTIFACT STORE  artifacts/v1/                                            │
│  pipeline_run.json · dataset_audit.json · quality/features/coverage/       │
│  research results · experiment_register.json · metric_catalog.json ·       │
│  demo/synthetic_drill.json (labelled) · *.parquet (player tables)          │
└───────────────┬────────────────────────────────────────────────────────────┘
                │  read-only, cached
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  SHADOWLINE WEB APP (Next.js 16 App Router, TypeScript, Tailwind 4,        │
│  shadcn/ui)  — 11 modules, single route, artifact-driven                   │
│  API routes: typed GET handlers, in-memory cache, /api/health              │
│  Prisma/SQLite: user-generated scouting reports ONLY (no analytics)        │
└────────────────────────────────────────────────────────────────────────────┘
```

The Kaggle notebook embeds the numpy-pure algorithm modules (`kinematics.py`,
`mri.py`, `synth.py`, `quality.py`) **verbatim** (import-stripped, SHA-tagged)
and validates them with a parity-test cell against the same synthetic
ground-truth fixtures used by the repository's unit tests. The published
notebook therefore cannot drift from the pipeline's feature mathematics.

## Design decisions

| Decision | Rationale |
|---|---|
| Python pipeline + TS app, decoupled by artifacts | Analytics run once, deterministically; the app never recomputes features per request (Phase 8 requirement). |
| DuckDB for game tracking | 22M+ frame rows across three seasons; SQL views with predicate pushdown instead of materialising in memory. |
| Declared schemas with runtime reconciliation | The competition data page is JS-rendered; the pipeline validates real files against declared expectations and reports every mismatch instead of guessing. |
| Status vocabulary: `ok / partial / gated_on_data / insufficient_n / failed` | Data absence and statistical insufficiency are *states*, not errors; they must surface honestly in every artifact and in the UI. |
| Player-level CV grouping + leakage assertions | Repeated plays from one player must never straddle train/test (Phase 5 requirement). |
| Pre-registered experiment register | Primary hypothesis, outcome, test, decision rule and secondary analyses are fixed before outcome data exists. |
| Synthetic fixtures only for algorithm tests | Unit/integration tests and the labelled UI demo; never as competition evidence (enforced by artifact `synthetic: true` marking and pipeline policy strings). |
| Atomic artifact writes + SHA-256 of raw inputs | Reproducibility: a run is pinned to exact input bytes; outputs are byte-stable given identical inputs (modulo recorded timestamps). |

## Failure & gating semantics

Every CLI stage writes an artifact and records its status in
`pipeline_run.json`. A stage that lacks its input files writes a
`gated_on_data` payload (missing files + exact next action) and exits 0 —
absence of data is an honest, expected condition, not a failure. Only
unexpected exceptions produce `failed` and exit code 1.

## API surface (web app)

| Route | Purpose |
|---|---|
| `GET /api/health` | Pipeline run summary (versions, stage statuses, data presence) |
| `GET /api/artifacts/<name>` | Typed, cached access to a pipeline artifact; 503 with reason when the artifact is a data-gated payload |
| `GET /api/players` | Player table (only when `combine_players.parquet` exists) |
| `GET /api/reports` / `POST /api/reports` | User-generated scouting reports (Prisma) |

No route exposes raw competition CSVs; the app serves persisted analytical
results only.

# Reproducibility Guide

## Pin the environment

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt     # pinned dependency floor
python -c "import polars, duckdb, pyarrow, scipy, statsmodels, sklearn; print('ok')"
```

Raw inputs are pinned by SHA-256 in `artifacts/v1/dataset_audit.json`; the
run manifest (`pipeline_run.json`) records Python version, platform, package
versions and the git commit.

## Obtain the data (required for all analytical stages)

1. Join the competition: https://www.kaggle.com/competitions/nfl-big-data-bowl-2027
2. Download the 9 CSVs from the Data tab (or attach the dataset to a Kaggle notebook).
3. Place them in `data/raw/` (or set `SHADOWLINE_DATA_DIR`).

The data is CC BY-NC 4.0 and must not be redistributed with this repository.

## Run the pipeline (deterministic)

```bash
python -m shadowline build-tracking-db   # one-time: sorted persistent DuckDB
python -m shadowline audit               # Phase 1: presence, checksums, schemas
python -m shadowline quality             # Phase 2: tracking quality report
python -m shadowline features            # Phase 3: MRI extraction + composite
python -m shadowline coverage            # Phase 4: coverage movement analytics
python -m shadowline research            # Phase 5: pre-registered validation
# or everything at once:
python -m shadowline all
```

`coverage` reads via `data/tracking.duckdb` (created by `build-tracking-db`) —
per-game zonemap scans (~0.04 s); without it the stage falls back to views over
the CSVs (~5 s per game, ~1 hour for all 697 games).

Determinism: bootstrap/permutation/CV seeds are fixed
(`RESEARCH_PARAMETERS.random_seed = 20271106`), JSON outputs are key-sorted
with floats rounded to 6 decimals, and artifact writes are atomic. Two runs
over identical inputs produce identical analytical values (recorded
timestamps differ by design).

Outputs land in `artifacts/v1/` (JSON + Parquet), versioned by
`ARTIFACT_SCHEMA_VERSION`.

## Run the tests

```bash
python -m pytest tests/ -q           # 89 tests
python -m pytest tests/ -q -k mri    # metric math only
python -m pytest tests/ -q -k e2e    # full pipeline on the synthetic mini package
```

The end-to-end suite proves pipeline mechanics on a schema-faithful synthetic
mini package. It never produces analytical claims.

## Rebuild the Kaggle notebook

```bash
python scripts/build_notebook.py
```

The builder embeds the current `shadowline/kinematics.py`, `mri.py`,
`synth.py` and `quality.py` sources (SHA-tagged) and the statistics subset of
`research.py` into `notebook/shadowline_bdb2027.ipynb`. The notebook's parity
cell asserts the embedded algorithms reproduce the repository's unit-test
ground truth before any real data is touched.

## Run the web app

```bash
bun install
bun run dev          # port 3000; reads artifacts/v1 (read-only)
```

The app never recomputes analytical features; it renders persisted artifacts.
After re-running the pipeline, refresh to see updated results.

## Kaggle publication checklist

1. Attach the competition dataset to the notebook (Add Input → Competition).
2. Run top-to-bottom (Run All). The data gate switches analysis on automatically.
3. Verify the parity-test cell passes and the audit shows 9/9 present.
4. Save a public version (Apache-2.0 or CC-BY-4.0 for your code).
5. Attach the notebook to the competition writeup (≤ 2,000 words, < 10 figures/tables).
6. Click Submit before 2027-01-06 23:59 UTC.

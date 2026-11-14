# SHADOWLINE

**NFL Combine-to-Game Movement Intelligence** — a research platform for the
[NFL Big Data Bowl 2027](https://www.kaggle.com/competitions/nfl-big-data-bowl-2027)
(*"Combine sensor tracking and regular-season NFL game performance"*).

SHADOWLINE tests one narrow, pre-registered question:

> Do pre-draft **movement-quality** characteristics, measured by 10 Hz Combine
> sensor tracking — how efficiently a defensive back decelerates, re-orients
> and re-accelerates through a direction change — predict NFL coverage
> performance **beyond traditional Combine measurements**?

---

## Current status (read this first)

| Layer | State |
|---|---|
| Research pipeline (ingest → quality → features → coverage → statistics) | **Implemented, 89/89 automated tests passing** |
| Kaggle notebook | **Built, executes top-to-bottom in a clean environment** (parity-tested algorithm embed) |
| Web application (11 modules) | **Runs from persisted pipeline artifacts; honest unavailable states where data is gated** |
| Landing page + demo login + 3D (v1.1.0–v1.2.0) | **Live**: public SSR landing at `/` (live status data in the initial HTML), demo sign-in at `/login` (server-decided session), analyst app at `/app` behind a server-side session guard |
| Security hardening (v1.1.0–v1.2.0) | **Per-route rate limiting (pluggable store), session auth on every analytical API, CSP + security headers, structured logging, Prometheus `/api/metrics`, 0 known dependency vulnerabilities (OSV-verified)** (see `docs/commercial_audit.md`) |
| Error/loading architecture (v1.2.0) | **Full boundary hierarchy** (global-error → segment error → module boundary → query retry), streamed Suspense fallbacks, aria-live offline banner; guarded segments deliberately carry no `loading.tsx` to preserve 307 auth semantics |
| Competition datasets | **Present in `data/raw/` / `data/tracking.duckdb`** (9 files, 2.20 GiB, CC BY-NC 4.0 — not redistributed; verify locally) |
| Statistical findings | Run 2026-11-14 on the real package: **primary hypothesis not supported** (partial rho = 0.230, permutation p = 0.322; Δ(B−A) 95% CI [−0.400, +0.769]; n = 23 eligible DBs). Honest null, pre-registered decision rule applied unchanged |

SHADOWLINE never fabricates data. The preflight and audit below are the
machine-readable source of truth for what is and is not available:

```bash
python -m shadowline preflight      # instant check: presence + required columns
python -m shadowline audit          # deep audit: checksums, rows, integrity
```

## Quickstart

```bash
# 1. Python research pipeline (Python 3.11+)
pip install -r requirements.txt

# 2. Place the 9 competition CSVs in data/raw/   (see docs/data_dictionary.md)
#    (on Kaggle the notebook auto-resolves /kaggle/input/nfl-big-data-bowl-2027)
#    Instant readiness check — presence + required columns, no side effects:
python -m shadowline preflight
#    (optional) one-time persistent DuckDB for fast per-game reads (builds
#    data/tracking.duckdb from the CSVs; coverage then reads zonemaps):
python -m shadowline build-tracking-db   # see docs/reproducibility.md — or:
SHADOWLINE_DUCKDB=data/tracking.duckdb python -m shadowline coverage

# 3. Run the pipeline (every stage reports honestly when data is absent)
python -m shadowline all           # audit → quality → features → coverage → research
python -m pytest tests/ -q         # 89 tests: unit, integration, statistical, e2e

# 4. Web app (Next.js 16, SSR + CSR): the dev server runs on port 3000
bun install && bun run dev
bun test tests/js        # 21 tests (auth, rate limiting, metrics)
bun run audit:deps      # OSV.dev dependency vulnerability scan (0 known vulns)
bun run backup:db       # timestamped scouting-report DB backup + manifest

# 5. Open the platform
#    /       public landing — SERVER-RENDERED with live pipeline status in
#            the initial HTML (streamed Suspense island hydrates to 30 s polling)
#    /login  demo sign-in (demo@shadowline.io / shadowline-demo) — the
#            session is decided server-side (authed visitors are 307'd to /app)
#    /app    the 11-module analyst platform (session-guarded, per-module
#            error boundaries, skeletons, offline-aware)
```

## What is in the box

```
shadowline/            Python research pipeline (the analytical engine)
  config.py            competition registry, domain constants, pre-registration
  schemas.py           declared schemas for all 9 files + runtime reconciliation
  artifacts.py         versioned, checksummed, atomic artifact store
  ingest.py            Phase 1: audit, typed loaders, referential integrity
  quality.py           Phase 2: tracking data-quality subsystem
  kinematics.py        circular math, derivatives, smoothing, reversal detection
  mri.py               Phase 3: Mirror Response Index (5 components + composite)
  combine.py           Phase 3 orchestration (drills, attempts, cohorts)
  coverage.py          Phase 4: coverage windows, separation, mirror behaviour
  research.py          Phase 5: Models A/B/C, permutation, bootstrap, LDOCO, FDR
  synth.py             synthetic fixtures (tests + labelled demo ONLY)
  preflight.py         instant dataset activation check (presence + schema)
  cli.py               preflight | audit | quality | features | coverage | research | demo | all
tests/                 89 automated tests incl. full end-to-end on a synthetic
                       mini competition package (mechanics only, never evidence)
scripts/build_notebook.py   regenerates the standalone Kaggle notebook
scripts/audit-deps.ts       OSV.dev dependency vulnerability scanner
scripts/backup-db.ts        scouting-report DB backups (sha256 + retention)
notebook/shadowline_bdb2027.ipynb   public notebook (self-contained, parity-tested)
artifacts/v1/          versioned pipeline outputs consumed by the web app
docs/                  architecture, data dictionary, limitations, audit, writeup
src/                   SHADOWLINE web application (Next.js 16, App Router, SSR + CSR)
.github/workflows/ci.yml    CI: lint, types, tests, build, pytest, OSV audit
Dockerfile / docker-compose.yml   production image (+ optional Redis profile)
```

## The Mirror Response Index (MRI)

| Component | Units | Captures |
|---|---|---|
| Reorientation latency | s | Time from plant to recovery of 70% of entry speed |
| Turn-speed retention | ratio | Speed kept through the plant |
| Directional transition efficiency | ratio | Net displacement / path length across the turn |
| Exit acceleration | yd/s² | Re-acceleration punch out of the break |
| Attempt consistency | ratio | 1 − CV across attempts of the same drill |

The composite is **not assumed valid**: Model B (traditional + MRI) must beat
Model A (traditional) out-of-sample under a pre-registered decision rule
(see `artifacts/v1/experiment_register.json`).

## Research integrity rules

1. **Pre-registration before outcomes.** Hypothesis, outcome, test and
   decision rule are fixed in `experiment_register.json` before any outcome
   data is inspected.
2. **Player-level data separation.** Cross-validation groups by `nfl_id`;
   train/test player overlap is asserted against (leakage guard).
3. **No silent substitution.** Absent data ⇒ `gated_on_data`, never synthetic
   numbers. The 13-of-510 players who never played are an exposure problem,
   not an ability measurement.
4. **Nulls are results.** If MRI adds nothing beyond the stopwatch, the
   writeup says exactly that.
5. **Synthetic fixtures** exist only in `tests/` and the clearly-labelled
   algorithm demo (`artifacts/v1/demo/`), marked `synthetic: true`.

## License & competition rules

Competition data (CC BY-NC 4.0) is **not** redistributed here. Attach the
official dataset from Kaggle. See `docs/limitations.md` for scope and caveats.

# Submission-Readiness Report

**Date:** 2026-11-14 · **Pipeline:** shadowline 1.0.0 · **Metric:** mri-1.0 ·
**Competition deadline:** 2027-01-06 23:59 UTC

## Verdict

**Submission-ready on the real data.** The dataset (9 files, 2.20 GiB) is in
`data/raw/`; the full pipeline runs to completion (`python -m shadowline all`,
run 20261114T021536Z, every stage `ok`). All findings in the writeup are
computed from the competition data. The headline result is a pre-registered
**negative**: the primary hypothesis is not supported at this sample size
(n = 23 eligible DBs; permutation p = 0.322; Δ(B−A) 95% CI excludes 0).

## What is verified working (executable evidence)

| # | Item | Evidence |
|---|---|---|
| 1 | Research pipeline: audit → quality → MRI → coverage → statistics | 89/89 automated tests; `python -m shadowline all` run 20261114T021536Z — every stage `ok` |
| 2 | Data governance: schema reconciliation, checksums, referential integrity, honest gating | Tests + artifacts/v1/dataset_audit.json |
| 3 | MRI algorithm correctness vs synthetic ground truth (incl. circular-angle edge cases) | Unit tests + notebook parity cell (PASS in 2 environments) |
| 4 | Statistical framework incl. player-clustered inference, leakage guards, FDR, LDOCO | Tests (caught and fixed one real inference bug) |
| 5 | Kaggle notebook executes top-to-bottom, clean env and with data present | Execution harness log |
| 6 | Web app: 11 modules, artifact-driven, interactive playback, report persistence, honest gated states | agent-browser verification (desktop + 375px, zero errors) |
| 7 | Documentation set (README, architecture, data dictionary, limitations, reproducibility, evidence matrix, writeup draft) | Written |

## The exact path to submission (what a user must do)

1. Join the competition on Kaggle and download the 9 CSVs (~2.31 GiB).
2. Place them in `data/raw/` (or set `SHADOWLINE_DATA_DIR`).
3. `python -m shadowline all` — stages flip from `gated_on_data` to
   `ok`/`insufficient_n`; artifacts populate.
4. `python -m pytest tests/ -q` — regression check on real data.
5. Open the app (`bun run dev`) — modules activate automatically from
   artifacts; review Dataset & Pipeline Health for the real audit (9/9,
   checksums, row counts, reconciliation).
6. On Kaggle: attach the competition dataset to
   `notebook/shadowline_bdb2027.ipynb`, Run All, verify the parity cell
   passes and the audit shows 9/9, save a public version.
7. Fill the `[RESULT]` markers in `docs/writeup_draft.md` from the notebook
   output (all numbers computed by the notebook, none hand-entered), attach
   the notebook, submit before the deadline.

## Known gaps and risks (honest)

| Gap / risk | Impact | Mitigation in place |
|---|---|---|
| Real-data results are a null | Submission rests on method, not significance | Honest null reporting; pre-registered decision rule unchanged |
| Declared schemas for `convention`/`inferred` columns unverified against the real package | Ingest might flag unexpected columns | Runtime reconciliation reports every mismatch; alias sets handle naming drift; stages gate rather than guess |
| Real-data edge cases (vendor quirks in `time`/`event` formats, BALL sentinel encoding) unknown | Quality/coverage stages may need small adaptations | Defensive parsing, entity detection, per-attempt flags; failures are reported, never hidden |
| Eligible-DB sample size unknown until data lands | Primary hypothesis may be underpowered | Pre-registered refusal to infer below n=10; null-result reporting path is first-class |
| `separation_at_pass_forward` association semantics (nearest opponent at pass forward) vs per-defender assignment | Primary outcome may be noisier than assumed | Cross-check against tracking-derived separation is computed and reported |
| LDOCO with 3 cohorts | High variance in external-validity estimates | Reported per-fold with n; interpreted cautiously |

## Pre-registered decision rules (cannot be changed after seeing outcomes)

- Primary: partial Spearman (MRI | traditional) permutation p < 0.05 **AND**
  Δ OOS (Model B − Model A) clustered-bootstrap CI excluding 0.
- If the primary fails: report the null; present the strongest FDR-surviving
  secondary result as exploratory, clearly labelled.

## Bottom line

When the dataset is attached, the pipeline, notebook, app and writeup fill
with real numbers automatically — including, if that is the truth, an honest
null result. The submission stands on verifiable engineering and
pre-registered statistics, not on manufactured significance.

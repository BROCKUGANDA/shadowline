# Limitations & Model Caveats

Declared **before** any outcome analysis. These bounds apply to every claim
SHADOWLINE can make, and they are reproduced verbatim in the competition
writeup and the public notebook.

## 1. Data-availability boundary

The competition datasets are not part of this repository (license and size).
They live in `data/raw/` (this workspace) or on Kaggle under
`/kaggle/input/nfl-big-data-bowl-2027/`. The full pipeline has since been
run on the real package; every quantitative claim in the writeup is computed
from it. Algorithm code remains validated additionally against synthetic
mathematical ground truth (the *mathematics*, not the *football*).

## 2. Exposure bias is not ability

- 13 of 510 players never played an NFL snap; others played sparingly.
- The primary analysis requires ≥ 20 regular-season coverage opportunities and
  reports exactly who is excluded and why.
- Career-success counters (snaps, games) are treated as **exposure
  descriptors**, never as an ability outcome.

## 3. Matchup association quality

- Receiver association prefers the **targeted** receiver (when a targeting
  column exists); otherwise the nearest eligible receiver at the pass-forward
  frame is used as a **flagged proximity approximation**.
- The nearest defender is never silently equated with the assigned defender.
- Unresolved play associations are counted and reported
  (`coverage_features.json` → `association_methods`, `n_unresolved_plays`).
- Coverage responsibility (man vs zone, match concepts) is not directly
  observable in the provided files; the analysis does not claim it.

## 4. Metric validity boundaries (MRI)

- The MRI composite is **not assumed valid because its components compute**.
  Component-level results are BH-FDR corrected; the composite must beat
  Model A out-of-sample under the pre-registered decision rule.
- MRI is defined for change-of-direction drills (shuttles, three-cone,
  position drills). Linear sprints yield no reversals by construction — this
  is a property of the metric, not missing data.
- Components are sensitive, within tested bounds, to the recovery threshold
  (0.6-0.8), window lengths (0.4-0.6 s) and smoothing windows (3-7 frames);
  the full sensitivity scan is emitted per attempt in `mri_sensitivity.json`.
- Combine drills are **practice-environment** movements: no opponent, no pad
 -level game constraints, no fatigue accumulation. Translation to games is an
  empirical hypothesis, not an assumption.

## 5. Statistical-inference limits

- The eligible-DB sample (MRI + ≥20 coverage plays) is modest; inference uses
  rank statistics, robust regression, player-clustered bootstrap and
  permutation tests rather than asymptotic normality.
- Cohort pooling assumes no material measurement drift between 2023-2025
  Combines; this is **tested** (KS tests on sampling intervals and
  noise proxies by cohort) before pooling, and reported either way.
- Multiple-hypothesis control covers the pre-registered secondary analyses;
  any post-hoc exploration is labelled exploratory and excluded from
  confirmatory claims.
- Out-of-sample metrics use player-grouped folds and leave-one-cohort-out;
  with three cohorts, LDOCO variance is inherently high.
- Imputation of missing traditional drill results uses cohort medians and is
  reported with each result.

## 6. What MRI cannot establish

- It cannot measure cognition, anticipation, route recognition, or technique
  (hand usage, leverage discipline).
- It cannot separate physical capacity from effort/motor on a given drill day.
- It does not identify "assigned" coverage responsibility (see §3).
- A coach using MRI should treat it as one movement-quality signal among
  film, interviews, production and medical evaluation — never as a draft
  decision rule by itself. No player recommendation in this project is based
  on an unvalidated composite.

## 7. Engineering caveats

- The declared schemas for files/columns marked `convention`/`inferred` in
  `docs/data_dictionary.md` are validated at ingest; if the actual package
  differs, the audit reports the mismatch and downstream stages gate rather
  than guess.
- The web app displays only persisted pipeline artifacts; it cannot display
  a number that the pipeline did not compute from real inputs.

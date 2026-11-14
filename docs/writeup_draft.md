# SHADOWLINE: What the Stopwatch Cannot See
### Combine movement quality and NFL coverage performance — NFL Big Data Bowl 2027 writeup (draft)

> **Status of this draft.** Numbers are computed from the real 2027
> competition package (`python -m shadowline all`, run 2026-11-14: audit →
> coverage → research). The methodology, framing, metric definitions and
> validation design are pre-registered and unchanged. The primary hypothesis
> is **not supported**; the submission reports the null. Word budget of the
> final text: ≤ 2,000; figures/tables: 7 of the allowed <10.

---

## Motivation

The stopwatch reduces a defensive back's change of direction to a single
number of seconds. Two prospects who run identical 20-yard shuttles can get
there in utterly different ways: one glides through the plant retaining speed
and pops out of the break; the other crashes to a near-stop, churns his feet,
and rebuilds speed from nothing. The drill time is the same. The movement is
not — and coverage in the NFL is decided in exactly those moments: a receiver
breaks, the defender mirrors, and separation is won or lost within half a
second.

The 2027 Big Data Bowl gives us 10 Hz optical tracking of 6,310 Combine drill
attempts for the 2023-2025 draft classes, linked to NFL game tracking through
the 2025 season. That makes the movement itself — not just its duration —
measurable. We ask one narrow question: **do pre-draft movement-quality
characteristics predict NFL coverage performance beyond traditional Combine
measurements?**

## The Mirror Response Index

We introduce the **Mirror Response Index (MRI)**, a family of kinematic
components extracted from every quality-gated attempt of a change-of-direction
drill (20- and 60-yard shuttles, three-cone, position drills). Direction
reversals are detected from circularly-corrected heading series (unwrapped,
smoothed, never averaged naively across the 0°/360° boundary); the reversal
centre is the local speed minimum — the plant. Around each plant we measure:

1. **Reorientation latency (s)** — time from the plant to recovery of 70% of
   entry speed: how fast the athlete is moving again.
2. **Turn-speed retention (ratio)** — speed kept through the plant relative
   to entry speed: how much momentum survives the turn.
3. **Directional transition efficiency (ratio)** — net displacement over path
   length across a ±0.5 s window: how little mileage is wasted.
4. **Exit acceleration (yd/s²)** — mean tangential acceleration in the 0.5 s
   after the plant: the burst out of the break.
5. **Attempt consistency (ratio)** — 1 − CV across a player's attempts of the
   same drill: movement repeatability.

The composite standardises components (median/MAD robust z, latency
sign-flipped) within position-by-draft-cohort groups and requires at least
three available components. Higher MRI = better change-of-direction quality.
We do not assume the composite is valid because its parts compute — that is
an empirical question the design below answers.

## Data and quality governance

All nine competition files are audited before use (presence, SHA-256, row
counts, schema reconciliation). Every tracking attempt passes a quality gate:
sampling-interval consistency against the 10 Hz spec, frame gaps, repeated
frames, position discontinuities (steps implying speeds above 12 yd/s),
impossible accelerations, field bounds, and short attempts. Travelled distance
is reconstructed from consecutive coordinates and preferred over the supplied
distance field when the two disagree materially. Before pooling the 2023-2025
cohorts we test cohort-level distribution shifts in sampling behaviour
(Kolmogorov-Smirnov) and report them. The host-documented linkage gaps between
game tracking and player_play (~2,497 tracking keys, ~1,750 player_play keys)
are recomputed in both directions; unresolved plays are excluded and counted,
never silently dropped. Our primary analyses use regular-season snaps only.

## From Combine to game

The coverage universe is every regular-season pass play on which a defensive
back participates. The primary outcome is the host-provided
`separation_at_pass_forward` for the defender — cross-checked against
tracking-derived separation. The DB's associated receiver is the targeted
receiver when targeting information exists; otherwise we use the nearest
eligible receiver at the pass-forward frame as a flagged proximity
approximation, and we report the association-method mix. We never equate the
nearest defender with the assigned defender. Movement summaries per play
include the defender's mirror latency after a receiver route break (time to
re-orient toward the receiver, bearing-vs-heading error below 30° sustained
0.3 s), separation recovery time, tight-coverage exposure (time within 1 yd),
and mean directional tracking error.

**Exposure is not ability.** Thirteen of the 510 players never played a snap.
Players need ≥ 20 regular-season coverage opportunities to enter the primary
analysis; exclusions are reported. Career snap counts are used only as
context, never as an ability outcome.

## Pre-registered validation design

- **Primary hypothesis.** Among DBs with ≥ 20 coverage opportunities, MRI is
  associated with lower mean separation allowed at pass-forward, adjusting
  for traditional Combine measures.
- **Primary outcome.** Exposure-weighted mean separation at pass-forward (yd).
- **Models.** A = traditional Combine (40, shuttle, three-cone, jumps);
  B = A + MRI; C = B + context (draft round, height, weight).
- **Decision rule (fixed in advance).** MRI adds information iff (a) the
  player-clustered permutation p-value for the partial Spearman of MRI with
  the outcome (given traditional measures) is < 0.05, **and** (b) Model B
  beats Model A out-of-sample with the clustered-bootstrap CI of the
  difference excluding zero.
- **Inference.** Partial Spearman with permutation p (2,000 permutations,
  fixed seed), player-clustered bootstrap 95% CIs (500 resamples), Huber
  robust regression, mixed-effects play-level models with player random
  intercepts, logistic regression for the binary "open" (≥ 3 yd) outcome.
- **Validation.** Player-grouped 5-fold CV (train/test player overlap is
  asserted against — leakage is a test, not a hope), leave-one-draft-cohort-out,
  and BH-FDR correction across the five secondary component-level
  associations. No outcome-derived variable may enter a feature (enforced by
  a leakage assertion that fails the pipeline run if violated).

## Findings

The pre-registered decision rule was applied unchanged. **The primary
hypothesis is not supported.** Two independent implementations agree:

**Attached notebook (parity-tested algorithms, self-contained).** Across the
23 defensive backs with ≥ 20 regular-season coverage opportunities (of the
107 DBs with any reps — 35,785 reps analysed):

- Partial Spearman of MRI with mean separation allowed at pass-forward,
  adjusting for the forty and short shuttle: rho = −0.151 (p = 0.490, n = 23),
  two-sided permutation p = 1.00 (2,000 permutations). Clustered bootstrap
  returned no finite 95% CI (all resamples degenerate at this n).
- Out-of-sample (player-grouped 5-fold CV Spearman): Model A (traditional)
  = 0.099; Model B (+ MRI) = 0.099 — Δ(B − A) = 0.000 at this n.

**Pipeline (`python -m shadowline all`, run 20261114T021536Z), same data,
same pre-registered design, slightly different association handling:**

- Partial Spearman rho = +0.230, permutation p = 0.322; bootstrap 95% CI
  [−0.291, +0.737].
- Models OOS Spearman: A = 0.194, B = −0.126, C = −0.126; Δ(B − A)
  clustered-bootstrap 95% CI [−0.400, +0.769].
- Leave-one-cohort-out: A −0.20 / −0.48 / +0.54; B −0.48 / −0.36 / +0.54 for
  2023/2024/2025 — no stable direction.
- Component-level associations (BH-FDR, all q = 0.943): no secondary
  component survives. Game MRI vs in-game mirror latency: p = 0.919.
- Robust (Huber) regression of separation on forty, shuttle and MRI:
  MRI coefficient −0.153 (p = 0.805).

The pre-registered decision rule required (a) permutation p < 0.05 **and**
(b) Δ(B − A) with CI excluding zero. Neither implementation meets it — this
is the pre-committed honest outcome: **the stopwatch's failure modes are not
visible to MRI at the exposure of this cohort, in either of the two
analysis paths.**

## Football interpretation

What the evidence shows, and what it does not:

- The cohort offers little leverage: 23 players meet the exposure bar, MRI
  relies on inside-combine measurement of three change-of-direction drills,
  and the outcome is one separation number at one frame. The null is most
  consistent with **low test power and wide intervals**, not with evidence
  that movement economy is irrelevant.
- Where MRI may still be useful: as a pre-registered composite for the
  next cohort window (2026 Combine class, measurable against 2027 games),
  or as an input to an analyst tool rather than as a standalone predictor.
- What MRI cannot establish here: that combine movement quality predicts
  separation for this cohort beyond the stopwatch. It cannot, at this
  sample size, and we do not claim it.

Practical framing for coaching staff: MRI decomposes the stopwatch into
*why* an athlete is fast or slow in a change of direction. Reorientation
latency and exit acceleration are trainable mechanical qualities; retention
and transition efficiency describe movement economy. Where the metric adds
signal beyond drill times, it identifies prospects whose game film shows
mirror ability that raw times under-rate — and where it does not, the
conventional drill remains the better tool. MRI never replaces film,
interviews or production; it is one more piece of evidence, and this
submission treats it that way.

## Figures (5, all rendered inline by the attached notebook)

1. Analytical pipeline schematic.
2. MRI algorithm on a synthetic shuttle (labelled demonstration — NOT NFL data).
3. MRI component distributions across the 208 composite-eligible players
   (2023–2025 draft classes).
4. MRI composite vs mean separation at pass-forward (colour = coverage plays,
   n = 23 eligible DBs).
5. Baseline (Model A) vs +MRI (Model B) out-of-sample player-grouped CV
   Spearman.

## Limitations

Declared in full in the notebook: exposure bias (13/510 never played; minimum
exposure thresholds), proximity-based receiver association fallback (flagged,
mix reported), cohort measurement drift (tested, reported), modest eligible-DB
sample (rank-based, clustered, permutation inference), practice-environment
drills (no opponent or pad-level constraints), and the composite-validity
criterion itself — which is a test, not an assumption.

## Citations

NFL Football Operations & Kaggle, *NFL Big Data Bowl 2027 — Combine sensor
tracking and regular-season NFL game performance* (competition dataset and
documentation, CC BY-NC 4.0). Zebra Technologies 10 Hz tracking, 2023-2025
Combines. Competition discussions on data-quality linkage gaps (thread 747584).

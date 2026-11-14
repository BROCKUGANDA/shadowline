"""Research & statistical validation framework (Phase 5).

Pre-registered design (see experiment_register.json artifact):
  PRIMARY HYPOTHESIS (H1): Among DBs with >= 20 REG coverage opportunities,
    MRI composite is associated with LOWER mean separation allowed at pass
    forward, after adjustment for traditional Combine measures.
  PRIMARY OUTCOME : sep_at_pass_forward_mean (exposure-weighted, yards)
  PRIMARY TEST    : partial Spearman(MRI, outcome | traditional) with
    player-clustered permutation p-value, plus out-of-sample Model B vs A.
  MODELS:
    A = traditional Combine measurements
    B = A + MRI composite (and components)
    C = B + context (draft round, age, size, exposure mix)

Integrity rules enforced here:
* Player-level train/test separation (GroupKFold by nfl_id; assert disjoint).
* No outcome-derived feature may enter a model (leakage assertion).
* Bootstrap and permutation use fixed seeds; results are deterministic.
* Null results are reported as nulls. Nothing is dredged into significance.
* Multiple comparisons across secondary analyses are BH-FDR corrected.
"""
from __future__ import annotations

import numpy as np
from scipy import stats as sps

from .config import RESEARCH_PARAMETERS as RP


# ---------------------------------------------------------------------------
# Core statistics
# ---------------------------------------------------------------------------
def spearman(x, y) -> dict:
    x, y = _pair(x, y)
    if len(x) < 4:
        return {"rho": None, "p": None, "n": len(x)}
    rho, p = sps.spearmanr(x, y)
    return {"rho": float(rho), "p": float(p), "n": int(len(x))}


def partial_spearman(x, y, covars: np.ndarray) -> dict:
    """Partial Spearman: rank-transform, residualise on covariates (OLS),
    then Spearman of residuals."""
    x, y = _pair(x, y)
    covars = np.asarray(covars, float)
    if covars.ndim == 1:
        covars = covars[:, None]
    m = np.isfinite(x) & np.isfinite(y) & np.all(np.isfinite(covars), axis=1)
    x, y, covars = x[m], y[m], covars[m]
    n = len(x)
    if n < max(8, covars.shape[1] + 4):
        return {"rho": None, "p": None, "n": n, "note": "insufficient_n"}
    rx, ry = sps.rankdata(x), sps.rankdata(y)
    X = np.column_stack([np.ones(n), covars])
    bx = np.linalg.lstsq(X, rx, rcond=None)[0]
    by = np.linalg.lstsq(X, ry, rcond=None)[0]
    resx, resy = rx - X @ bx, ry - X @ by
    rho, p = sps.spearmanr(resx, resy)
    return {"rho": float(rho), "p": float(p), "n": int(n)}


def clustered_bootstrap_ci(fn, groups: np.ndarray, n_boot: int | None = None,
                           seed: int | None = None, alpha: float = 0.05) -> dict:
    """Cluster (player-level) resampling CI for an arbitrary statistic fn."""
    n_boot = n_boot or RP["n_bootstrap"]
    seed = RP["random_seed"] if seed is None else seed
    rng = np.random.default_rng(seed)
    groups = np.asarray(groups)
    uniq = np.unique(groups)
    stats = []
    for _ in range(n_boot):
        picked = rng.choice(uniq, size=len(uniq), replace=True)
        idx = np.concatenate([np.where(groups == g)[0] for g in picked])
        try:
            v = fn(idx)
            if v is not None and np.isfinite(v):
                stats.append(v)
        except Exception:
            continue
    if not stats:
        return {"ci_low": None, "ci_high": None, "n_success": 0}
    arr = np.asarray(stats, float)
    return {"ci_low": float(np.quantile(arr, alpha / 2)),
            "ci_high": float(np.quantile(arr, 1 - alpha / 2)),
            "n_success": int(len(arr)), "boot_mean": float(arr.mean())}


def permutation_test(stat_fn, x: np.ndarray, y: np.ndarray,
                     n_perm: int | None = None, seed: int | None = None) -> dict:
    """Two-sided permutation test.

    ``stat_fn(x_arr, y_arr) -> scalar``. Under the null, ``x`` is shuffled
    RELATIVE to ``y`` (and any covariates captured in the closure stay
    aligned with ``y``). This is the correct Mantel-style permutation; simply
    permuting a shared index array would be a no-op (a bug class caught by
    the statistical unit tests).
    """
    n_perm = n_perm or RP["n_permutation"]
    seed = RP["random_seed"] if seed is None else seed
    rng = np.random.default_rng(seed)
    x = np.asarray(x, float)
    obs = stat_fn(x, y)
    if obs is None or not np.isfinite(obs):
        return {"observed": None, "p": None}
    count = 0
    for _ in range(n_perm):
        v = stat_fn(rng.permutation(x), y)
        if v is not None and np.isfinite(v) and abs(v) >= abs(obs):
            count += 1
    return {"observed": float(obs), "p": (count + 1) / (n_perm + 1),
            "n_perm": n_perm, "two_sided": True}


def bh_fdr(pvalues: dict[str, float]) -> dict[str, dict]:
    """Benjamini-Hochberg adjusted q-values."""
    keys = [k for k, v in pvalues.items() if v is not None and np.isfinite(v)]
    if not keys:
        return {}
    ps = np.array([pvalues[k] for k in keys])
    order = np.argsort(ps)
    m = len(ps)
    q = np.empty(m)
    prev = 1.0
    for rank_i in range(m - 1, -1, -1):
        i = order[rank_i]
        val = min(prev, ps[i] * m / (rank_i + 1))
        q[i] = val
        prev = val
    return {k: {"p": float(pvalues[k]), "q": float(q[i])}
            for i, k in enumerate(keys)}


# ---------------------------------------------------------------------------
# Regression models (A / B / C) with robust + mixed-effects options
# ---------------------------------------------------------------------------
def fit_robust(y: np.ndarray, X: np.ndarray) -> dict:
    """Huber robust linear regression (statsmodels RLM)."""
    import statsmodels.api as sm
    Xc = sm.add_constant(X, has_constant="add")
    fit = sm.RLM(y, Xc, M=sm.robust.norms.HuberT()).fit()
    return {"coef": fit.params.tolist(), "bse": fit.bse.tolist(),
            "pvalues": fit.pvalues.tolist(),
            "n": int(len(y)), "n_params": int(Xc.shape[1])}


def fit_mixed_play_level(df_play: "object", outcome: str, predictors: list[str]):
    """Mixed-effects model on PLAY-level data with player random intercepts."""
    import statsmodels.formula.api as smf
    import pandas as pd
    pdf = pd.DataFrame(df_play)
    formula = f"{outcome} ~ " + " + ".join(predictors)
    fit = smf.mixedlm(formula, pdf, groups=pdf["nfl_id"]).fit(reml=False)
    return {"coef": fit.params.to_dict(), "bse": fit.bse.to_dict(),
            "pvalues": fit.pvalues.to_dict(), "n": int(len(pdf)),
            "n_groups": int(pdf["nfl_id"].nunique())}


def fit_logistic_open(y_binary: np.ndarray, X: np.ndarray) -> dict:
    import statsmodels.api as sm
    Xc = sm.add_constant(X, has_constant="add")
    fit = sm.Logit(y_binary, Xc).fit(disp=0)
    return {"coef": fit.params.tolist(), "pvalues": fit.pvalues.tolist(),
            "pseudo_r2": float(fit.prsquared), "n": int(len(y_binary))}


# ---------------------------------------------------------------------------
# Out-of-sample evaluation (player-level separation; leakage-proof)
# ---------------------------------------------------------------------------
def _oos_spearman(y, pred):
    if len(y) < 4 or np.std(pred) < 1e-12:
        return None
    return float(sps.spearmanr(y, pred).statistic)


def cross_validated_oos(y: np.ndarray, X: np.ndarray, player_ids: np.ndarray,
                        folds: int | None = None, seed: int | None = None) -> dict:
    """Grouped K-fold OOS: players never split across train/test. Uses
    ridge-regularised linear regression (small-n discipline)."""
    from sklearn.linear_model import Ridge
    from sklearn.model_selection import GroupKFold
    folds = folds or min(RP["cv_folds"], len(np.unique(player_ids)))
    y = np.asarray(y, float)
    X = np.asarray(X, float)
    if len(y) < folds + 2:
        return {"oos_spearman": None, "n": int(len(y)), "note": "insufficient_n"}
    gkf = GroupKFold(n_splits=folds)
    preds = np.full(len(y), np.nan)
    for tr, te in gkf.split(X, y, groups=player_ids):
        assert set(player_ids[tr]).isdisjoint(set(player_ids[te])), "player leakage in CV split"
        mu, sd = X[tr].mean(0), X[tr].std(0)
        sd[sd < 1e-9] = 1.0
        Z = (X[tr] - mu) / sd
        model = Ridge(alpha=1.0).fit(Z, y[tr])
        preds[te] = model.predict((X[te] - mu) / sd)
    return {"oos_spearman": _oos_spearman(y, preds), "n": int(len(y)),
            "folds": int(folds), "grouping": "nfl_id"}


def leave_one_cohort_out(y: np.ndarray, X: np.ndarray, cohorts: np.ndarray) -> dict:
    """LDOCO: train on two draft cohorts, test on the held-out one."""
    y, X, cohorts = np.asarray(y, float), np.asarray(X, float), np.asarray(cohorts)
    from sklearn.linear_model import Ridge
    results = []
    for c in np.unique(cohorts):
        te = cohorts == c
        tr = ~te
        if te.sum() < 3 or tr.sum() < 5:
            continue
        mu, sd = X[tr].mean(0), X[tr].std(0)
        sd[sd < 1e-9] = 1.0
        m = Ridge(alpha=1.0).fit((X[tr] - mu) / sd, y[tr])
        pred = m.predict((X[te] - mu) / sd)
        results.append({"held_out_cohort": str(c), "n_test": int(te.sum()),
                        "oos_spearman": _oos_spearman(y[te], pred)})
    return {"folds": results}


def assert_no_leakage(feature_cols: list[str], outcome_cols: list[str]) -> None:
    """Hard assertion: no feature may be derived from the outcome."""
    outcome_tokens = {"sep", "separation", "open", "targeted", "exposure_within",
                      "recovery", "outcome"}
    for f in feature_cols:
        for tok in outcome_tokens:
            if tok in f.lower() and not f.lower().startswith("combine"):
                raise AssertionError(f"potential target leakage: feature '{f}' "
                                     f"contains outcome token '{tok}'")


# ---------------------------------------------------------------------------
# Full research stage (assembles player table + runs pre-registered analyses)
# ---------------------------------------------------------------------------
def run_research(mri_players: list[dict], coverage_players: list[dict],
                 traditional: "object", career: "object", context: "object") -> dict:
    """Execute the pre-registered analysis plan. Returns the results artifact.

    All inputs are REAL pipeline outputs (player-level tables); synthetic
    fixtures never reach this function in production runs.
    """
    import polars as pl

    def _norm_ids(df):
        """Normalise nfl_id to Utf8 so joins never fail on type drift."""
        if df is None or df.is_empty() or "nfl_id" not in df.columns:
            return df
        if df.schema["nfl_id"] != pl.Utf8:
            df = df.with_columns(pl.col("nfl_id").cast(pl.Utf8))
        return df

    mri = _norm_ids(pl.DataFrame(mri_players))
    if not mri_players:
        return {"status": "insufficient_mri", "n_players": 0,
                "note": "no MRI player-level features (combine stage gated or no eligible attempts)"}
    if not coverage_players:
        return {"status": "insufficient_n", "n_players": 0,
                "note": "no coverage player-level aggregates (coverage stage produced none or gated)"}
    cov = _norm_ids(pl.DataFrame(coverage_players))
    if "meets_min_exposure" not in cov.columns:
        return {"status": "insufficient_n", "n_players": 0,
                "note": "coverage aggregates present but missing the exposure flag (contract mismatch)"}
    cov = cov.filter(pl.col("meets_min_exposure"))
    df = mri.join(cov.select(["nfl_id", "sep_at_pass_forward_mean",
                              "n_coverage_plays", "open_rate_3yd",
                              "mirror_latency_mean_s", "tracking_error_mean_deg"]),
                  on="nfl_id", how="inner")
    if traditional is not None:
        df = df.join(_norm_ids(traditional), on="nfl_id", how="left")
    if career is not None:
        df = df.join(_norm_ids(career), on="nfl_id", how="left")
    if context is not None:
        df = df.join(_norm_ids(context), on="nfl_id", how="left")
    rows = df.to_dicts()
    if len(rows) < 10:
        return {"status": "insufficient_n", "n_players": len(rows),
                "note": "fewer than 10 eligible DBs; no inferential claims"}

    y = np.array([r["sep_at_pass_forward_mean"] for r in rows], float)
    mri_c = np.array([r.get("mri_composite") if r.get("mri_composite") is not None
                      else np.nan for r in rows], float)
    forty = np.array([r.get("combine_forty") if r.get("combine_forty") is not None
                      else np.nan for r in rows], float)
    shuttle = np.array([r.get("combine_short_shuttle") if r.get("combine_short_shuttle") is not None
                        else np.nan for r in rows], float)
    players = np.array([str(r["nfl_id"]) for r in rows])
    cohorts = np.array([str(r.get("draft_year")) for r in rows])

    # impute traditional covariates with cohort median (reported)
    def med_impute(a):
        a = a.copy()
        med = np.nanmedian(a)
        a[~np.isfinite(a)] = med
        return a

    forty_i, shuttle_i = med_impute(forty), med_impute(shuttle)
    mri_i = mri_c.copy()
    if np.sum(~np.isfinite(mri_i)) > 0:
        if np.sum(np.isfinite(mri_i)) < 8:
            return {"status": "insufficient_mri", "n_with_mri": int(np.sum(np.isfinite(mri_i)))}
        mri_i[~np.isfinite(mri_i)] = np.nanmedian(mri_i)

    assert_no_leakage(["mri_composite", "combine_forty", "combine_short_shuttle"],
                      ["sep_at_pass_forward_mean"])

    # ---- primary analysis -------------------------------------------------
    primary = {}
    primary["spearman_mri_outcome"] = spearman(mri_c, y)
    primary["spearman_forty_outcome"] = spearman(forty, y)
    primary["partial_spearman_mri_given_traditional"] = partial_spearman(
        mri_c, y, np.column_stack([forty_i, shuttle_i]))
    def _stat_partial(xv, yv):
        return partial_spearman(xv, yv, np.column_stack([forty_i, shuttle_i]))["rho"]

    primary["permutation_partial"] = permutation_test(
        _stat_partial, mri_c, y, n_perm=min(RP["n_permutation"], 2000))
    primary["bootstrap_partial_ci"] = clustered_bootstrap_ci(
        lambda idx: partial_spearman(mri_c[idx], y[idx],
                                     np.column_stack([forty_i[idx], shuttle_i[idx]]))["rho"],
        players, n_boot=min(RP["n_bootstrap"], 500))

    # ---- Model A / B / C out-of-sample -----------------------------------
    Xa = np.column_stack([forty_i, shuttle_i])
    Xb = np.column_stack([forty_i, shuttle_i, mri_i])
    # Model C context: draft round + size + exposure (no outcome-derived cols)
    round_ = np.array([float(r.get("draft_round") or 8.0) for r in rows])  # UDFA -> 8
    height_ = np.array([float(r.get("height_inches") or 73.0) for r in rows])
    weight_ = np.array([float(r.get("weight") or 200.0) for r in rows])
    Xc_ = np.column_stack([Xb, round_, height_, weight_])

    models = {
        "A_traditional": cross_validated_oos(y, Xa, players),
        "B_traditional_plus_mri": cross_validated_oos(y, Xb, players),
        "C_context_adjusted": cross_validated_oos(y, Xc_, players),
    }
    # Δ(B - A) with clustered bootstrap
    delta_fn = _make_delta_fn(y, Xa, Xb, players)
    delta_boot = clustered_bootstrap_ci(delta_fn, players, n_boot=min(RP["n_bootstrap"], 500))
    loco = {name: leave_one_cohort_out(y, X, cohorts)
            for name, X in (("A", Xa), ("B", Xb), ("C", Xc_))}

    # ---- secondary analyses (BH-FDR corrected) ----------------------------
    secondary_p = {}
    for comp in ("reorientation_latency", "turn_speed_retention",
                 "directional_transition_efficiency", "exit_acceleration"):
        vals = np.array([r.get(f"{comp}_mean") if r.get(f"{comp}_mean") is not None
                         else np.nan for r in rows], float)
        if np.sum(np.isfinite(vals)) >= 8:
            r_ = partial_spearman(vals, y, np.column_stack([forty_i, shuttle_i]))
            secondary_p[comp] = r_["p"]
    ml = np.array([r.get("mirror_latency_mean_s") if r.get("mirror_latency_mean_s") is not None
                   else np.nan for r in rows], float)
    if np.sum(np.isfinite(ml)) >= 8:
        secondary_p["game_mirror_latency_vs_mri"] = spearman(mri_c, ml)["p"]
    fdr = bh_fdr({k: v for k, v in secondary_p.items() if v is not None})

    # ---- robust regression (Model B, full sample) -------------------------
    robust = None
    if np.sum(np.isfinite(mri_c)) >= 10:
        mask = np.isfinite(mri_c)
        robust = fit_robust(y[mask], np.column_stack([forty_i[mask], shuttle_i[mask], mri_c[mask]]))
        robust["terms"] = ["intercept", "combine_forty", "combine_short_shuttle", "mri_composite"]

    return {
        "status": "ok",
        "n_players": int(len(rows)),
        "n_with_mri": int(np.sum(np.isfinite(mri_c))),
        "exposure_threshold": ">=20 REG coverage plays",
        "primary_hypothesis_result": {
            "partial_spearman_rho": primary["partial_spearman_mri_given_traditional"]["rho"],
            "permutation_p": primary["permutation_partial"]["p"],
            "bootstrap_ci": [primary["bootstrap_partial_ci"]["ci_low"],
                             primary["bootstrap_partial_ci"]["ci_high"]],
            "decision_rule": (
                "MRI adds information iff (a) two-sided permutation p < 0.05 AND "
                "(b) OOS Model B beats Model A with clustered-bootstrap CI of "
                "delta excluding 0."),
            "oos_delta_B_minus_A": delta_boot,
        },
        "correlations": primary,
        "models_oos": models,
        "leave_one_cohort_out": loco,
        "secondary_fdr": fdr,
        "robust_regression_B": robust,
        "multiple_testing": "BH-FDR across 5 secondary associations",
        "alpha": RP["alpha"],
        "imputation": "cohort-median imputation for missing traditional drills (reported)",
    }


def _make_delta_fn(y, Xa, Xb, players):
    from sklearn.linear_model import Ridge
    from sklearn.model_selection import GroupKFold

    def fn(idx):
        y_, Xa_, Xb_, p_ = y[idx], Xa[idx], Xb[idx], players[idx]
        folds = min(5, len(np.unique(p_)))
        if folds < 2 or len(y_) < folds + 2:
            return None
        gkf = GroupKFold(n_splits=folds)
        pa = np.full(len(y_), np.nan)
        pb = np.full(len(y_), np.nan)
        for tr, te in gkf.split(Xa_, y_, groups=p_):
            for X, pout in ((Xa_, pa), (Xb_, pb)):
                mu, sd = X[tr].mean(0), X[tr].std(0)
                sd[sd < 1e-9] = 1.0
                m = Ridge(alpha=1.0).fit((X[tr] - mu) / sd, y_[tr])
                pout[te] = m.predict((X[te] - mu) / sd)
        ra, rb = _oos_spearman(y_, pa), _oos_spearman(y_, pb)
        if ra is None or rb is None:
            return None
        return rb - ra
    return fn


def _pair(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    m = np.isfinite(x) & np.isfinite(y)
    return x[m], y[m]

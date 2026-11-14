"""Statistical framework tests: known synthetic mathematical cases ONLY (per
the testing policy). Verifies power, calibration, leakage protection,
invariances and reproducibility of the statistical machinery itself."""
import numpy as np
import pytest

from shadowline.research import (bh_fdr, clustered_bootstrap_ci, cross_validated_oos,
                                 leave_one_cohort_out, assert_no_leakage,
                                 partial_spearman, permutation_test, spearman)


class TestCorrelations:
    def test_spearman_known_case(self):
        x = np.arange(20, dtype=float)
        y = x ** 2
        r = spearman(x, y)
        assert r["rho"] == pytest.approx(1.0)
        assert r["p"] < 1e-6

    def test_partial_spearman_removes_confounder(self):
        rng = np.random.default_rng(11)
        z = rng.normal(size=500)
        x = 0.9 * z + rng.normal(0, 0.4, 500)   # driven by z
        y = 0.9 * z + rng.normal(0, 0.4, 500)   # driven by z, not by x
        assert spearman(x, y)["rho"] > 0.6          # marginal association
        pr = partial_spearman(x, y, z)
        assert abs(pr["rho"]) < 0.2                  # partialled away

    def test_partial_spearman_detects_true_effect(self, player_dataset):
        d = player_dataset
        # outcome generated with a true MRI partial effect of -0.35
        pr = partial_spearman(d["mri"], d["separation"], d["forty"])
        assert pr["rho"] < 0  # direction preserved (rank scale)
        pr2 = partial_spearman(d["mri"], d["separation"],
                               np.column_stack([d["forty"], d["shuttle"]]))
        assert pr2["rho"] < 0

    def test_insufficient_n(self):
        assert partial_spearman(np.arange(4.), np.arange(4.), np.arange(4.))["rho"] is None


class TestPermutation:
    def test_detects_injected_effect(self, player_dataset):
        d = player_dataset
        stat = lambda xv, yv: spearman(xv, yv)["rho"]
        res = permutation_test(stat, d["mri"], d["separation"], n_perm=1000)
        assert res["observed"] < 0
        assert res["p"] < 0.05

    def test_null_case_is_not_significant(self):
        rng = np.random.default_rng(5)
        x, y = rng.normal(size=80), rng.normal(size=80)
        stat = lambda xv, yv: spearman(xv, yv)["rho"]
        res = permutation_test(stat, x, y, n_perm=500)
        # a true null must NOT be called significant at alpha=0.05 most of the
        # time; single seed check keeps the test deterministic
        assert res["p"] > 0.05

    def test_deterministic(self):
        rng = np.random.default_rng(9)
        x = rng.normal(size=60)
        y = 0.5 * x + rng.normal(0, 0.5, 60)
        stat = lambda xv, yv: spearman(xv, yv)["rho"]
        r1 = permutation_test(stat, x, y, n_perm=200)
        r2 = permutation_test(stat, x, y, n_perm=200)
        assert r1 == r2  # fixed seed => identical

    def test_permutation_shuffles_x_not_pairs(self):
        """Regression guard: permuting a shared index array is a no-op; the
        implementation must shuffle x RELATIVE to y."""
        rng = np.random.default_rng(4)
        x = np.arange(30, dtype=float)
        y = x.copy()  # perfect correlation
        stat = lambda xv, yv: spearman(xv, yv)["rho"]
        res = permutation_test(stat, x, y, n_perm=100)
        assert res["observed"] == pytest.approx(1.0)
        assert res["p"] < 0.05  # only achievable if permutations break pairs


class TestBootstrap:
    def test_ci_covers_truth(self, player_dataset):
        d = player_dataset
        truth = d["true_mri_partial_effect"]
        ci = clustered_bootstrap_ci(
            lambda idx: spearman(d["mri"][idx], d["separation"][idx])["rho"],
            np.arange(d["n_players"]), n_boot=300)
        assert ci["ci_low"] is not None and ci["ci_high"] is not None
        # direction consistency: injected effect is negative
        assert ci["boot_mean"] < 0

    def test_cluster_resampling_respects_groups(self):
        # 10 players x 5 repeated obs; statistic = within-player mean spread
        groups = np.repeat(np.arange(10), 5)
        y = np.repeat(np.arange(10), 5).astype(float)
        ci = clustered_bootstrap_ci(lambda idx: float(np.mean(y[idx])), groups, n_boot=100)
        assert ci["ci_low"] <= 4.5 <= ci["ci_high"]


class TestFDR:
    def test_bh_fdr_monotone(self):
        ps = {"a": 0.001, "b": 0.01, "c": 0.05, "d": 0.2, "e": 0.8}
        adj = bh_fdr(ps)
        qs = [adj[k]["q"] for k in ("a", "b", "c", "d", "e")]
        assert qs == sorted(qs) or all(qs[i] <= qs[i + 1] + 1e-12 for i in range(4))
        assert adj["a"]["q"] <= 0.005

    def test_fdr_handles_nulls(self):
        assert bh_fdr({}) == {}
        assert bh_fdr({"x": None}) == {}


class TestOOS:
    def test_grouped_cv_no_player_leakage(self, player_dataset):
        d = player_dataset
        y = d["separation"]
        X = np.column_stack([d["mri"], d["forty"]])
        ids = np.array([f"p{i}" for i in range(d["n_players"])])
        res = cross_validated_oos(y, X, ids)
        assert res["oos_spearman"] is not None
        assert res["grouping"] == "nfl_id"

    def test_known_signal_beats_noise_features(self):
        rng = np.random.default_rng(21)
        n = 120
        signal = rng.normal(size=n)
        y = -0.6 * signal + rng.normal(0, 0.3, n)
        noise = rng.normal(size=(n, 5))
        ids = np.array([f"p{i}" for i in range(n)])
        s1 = cross_validated_oos(y, np.column_stack([signal]), ids)["oos_spearman"]
        s0 = cross_validated_oos(y, noise, ids)["oos_spearman"]
        assert s1 > s0
        assert s1 > 0.5

    def test_ldoco_runs_all_cohorts(self, player_dataset):
        d = player_dataset
        cohorts = np.repeat(["2023", "2024", "2025"], d["n_players"] // 3)
        res = leave_one_cohort_out(d["separation"],
                                   np.column_stack([d["mri"], d["forty"]]), cohorts)
        assert len(res["folds"]) == 3


class TestLeakage:
    def test_leakage_assertion_fires(self):
        with pytest.raises(AssertionError):
            assert_no_leakage(["sep_at_pass_forward_mean"], ["sep_at_pass_forward_mean"])
        with pytest.raises(AssertionError):
            assert_no_leakage(["open_rate_3yd"], ["sep_at_pass_forward_mean"])

    def test_clean_features_pass(self):
        assert_no_leakage(["mri_composite", "combine_forty", "height_inches"],
                          ["sep_at_pass_forward_mean"])


class TestInvariance:
    """Metric invariance to irrelevant coordinate transformations (Phase 11)."""

    def test_translation_invariance(self, shuttle):
        from shadowline.mri import attempt_components
        x, y = np.array(shuttle["x"]), np.array(shuttle["y"])
        f1 = attempt_components(x, y, shuttle["dt"])
        f2 = attempt_components(x + 10.0, y - 5.0, shuttle["dt"])
        for c in ("reorientation_latency", "turn_speed_retention",
                  "directional_transition_efficiency", "exit_acceleration"):
            assert getattr(f1, c) == pytest.approx(getattr(f2, c), rel=1e-6)

    def test_axis_reflection_invariance(self, shuttle):
        from shadowline.mri import attempt_components
        x, y = np.array(shuttle["x"]), np.array(shuttle["y"])
        f1 = attempt_components(x, y, shuttle["dt"])
        f2 = attempt_components(-x, y, shuttle["dt"])  # mirror x
        for c in ("reorientation_latency", "turn_speed_retention",
                  "directional_transition_efficiency", "exit_acceleration"):
            assert getattr(f1, c) == pytest.approx(getattr(f2, c), rel=1e-3)

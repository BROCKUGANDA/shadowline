"""Unit tests: MRI components against synthetic ground truth; missing-data
behaviour; composite construction; sensitivity stability; game mirror."""
import numpy as np
import pytest

from shadowline.mri import (attempt_components, attempt_consistency, mri_composite,
                            mirror_latency, robust_z, sensitivity_scan)
from shadowline.synth import synthetic_coverage_play, synthetic_shuttle_attempt


class TestComponents:
    def test_shuttle_components_recovered(self, shuttle):
        x, y = np.array(shuttle["x"]), np.array(shuttle["y"])
        f = attempt_components(x, y, shuttle["dt"])
        assert f.n_reversals == 2
        # reorientation latency: recovery from plant (~1.2 yd/s) to 70% of
        # entry (~6+ yd/s) takes a few tenths of a second
        assert f.reorientation_latency is not None
        assert 0.05 <= f.reorientation_latency <= 1.0
        # retention: plant speed / entry speed in (0, 0.6]
        assert f.turn_speed_retention is not None
        assert 0.0 < f.turn_speed_retention <= 0.6
        # DTE strictly inside (0, 1]
        assert f.directional_transition_efficiency is not None
        assert 0.0 < f.directional_transition_efficiency <= 1.0
        # exit acceleration positive after a plant
        assert f.exit_acceleration is not None
        assert f.exit_acceleration > 0.5

    def test_plant_speed_ground_truth(self, shuttle):
        """The detected local minimum speed must approximate the true plant
        speed implied by retention x entry."""
        f = attempt_components(np.array(shuttle["x"]), np.array(shuttle["y"]),
                               shuttle["dt"])
        # retention = v_min / v_entry with v_min ~ 1.2 and v_entry ~ 6.5
        assert f.turn_speed_retention < 0.5

    def test_linear_sprint_has_no_components(self):
        t = np.arange(60) * 0.1
        x = 4.0 * t
        y = np.zeros_like(x)
        f = attempt_components(x, y, 0.1)
        assert f.n_reversals == 0
        assert f.reorientation_latency is None
        assert "no_reversal_detected" in f.quality_flags

    def test_too_few_frames(self):
        f = attempt_components(np.array([0.0, 1.0, 2.0]), np.array([5.0, 5.0, 5.0]), 0.1)
        assert "too_few_frames" in f.quality_flags

    def test_stationary_input_yields_null_components(self):
        """Degenerate stationary trajectory: no reversals, no DTE values."""
        f = attempt_components(np.zeros(30), np.zeros(30), 0.1)
        assert f.n_reversals == 0
        assert f.directional_transition_efficiency is None
        assert f.reorientation_latency is None

    def test_deterministic(self, shuttle):
        x, y = np.array(shuttle["x"]), np.array(shuttle["y"])
        f1 = attempt_components(x, y, shuttle["dt"])
        f2 = attempt_components(x, y, shuttle["dt"])
        assert f1.to_dict() == f2.to_dict()


class TestConsistencyAndComposite:
    def test_consistency_needs_two_attempts(self):
        assert attempt_consistency([4.2]) is None
        assert attempt_consistency([]) is None
        c = attempt_consistency([4.2, 4.3, 4.1])
        assert 0.9 < c <= 1.0

    def test_consistency_identical_attempts(self):
        assert attempt_consistency([4.2, 4.2]) == pytest.approx(1.0)

    def test_composite_requires_min_components(self):
        rows = [{"nfl_id": 1, "reorientation_latency": 0.5},
                {"nfl_id": 2, "reorientation_latency": 0.3}]
        out = mri_composite(rows, min_components=3)
        assert all(r["mri_composite"] is None for r in out)

    def test_composite_ordering(self):
        """Better mover (low latency, high retention/DTE/exit accel) scores higher."""
        rows = [
            {"nfl_id": 1, "reorientation_latency": 0.45, "turn_speed_retention": 0.30,
             "directional_transition_efficiency": 0.80, "exit_acceleration": 4.0},
            {"nfl_id": 2, "reorientation_latency": 0.20, "turn_speed_retention": 0.45,
             "directional_transition_efficiency": 0.92, "exit_acceleration": 6.5},
            {"nfl_id": 3, "reorientation_latency": 0.35, "turn_speed_retention": 0.36,
             "directional_transition_efficiency": 0.86, "exit_acceleration": 5.2},
        ]
        out = sorted(mri_composite(rows, min_components=3), key=lambda r: r["nfl_id"])
        assert out[1]["mri_composite"] > out[0]["mri_composite"]  # player 2 > player 1
        assert out[2]["mri_composite"] > out[0]["mri_composite"]

    def test_robust_z_constant_input(self):
        z = robust_z(np.full(10, 3.0))
        assert np.allclose(z, 0.0)


class TestSensitivity:
    def test_parameters_do_not_flip_rankings(self, shuttle):
        x, y = np.array(shuttle["x"]), np.array(shuttle["y"])
        summary = sensitivity_scan(x, y, shuttle["dt"],
                                   {"recovery_threshold": [0.6, 0.7, 0.8],
                                    "exit_window_s": [0.4, 0.5, 0.6]})
        for comp, s in summary.items():
            assert s["max_relative_spread"] < 0.5, f"{comp} unstable across parameters"

    def test_sensitivity_reports_all_components(self, shuttle):
        summary = sensitivity_scan(np.array(shuttle["x"]), np.array(shuttle["y"]),
                                   shuttle["dt"], {"recovery_threshold": [0.6, 0.7, 0.8]})
        assert "reorientation_latency" in summary
        assert summary["reorientation_latency"]["n_parameter_combinations"] == 3


class TestGameMirror:
    def test_mirror_latency_detected(self, coverage_play):
        ml = mirror_latency(
            np.array(coverage_play["defender"]["x"]),
            np.array(coverage_play["defender"]["y"]),
            np.array(coverage_play["receiver"]["x"]),
            np.array(coverage_play["receiver"]["y"]),
            coverage_play["break_index"], coverage_play["dt"])
        # synthetic defender reacts after ~0.6 s; measured latency >= reaction
        assert ml is not None
        assert ml >= 0.3

    def test_mirror_latency_none_when_never_reorients(self):
        n = 60
        x = np.linspace(0, 6, n)
        y = np.full(n, 2.0)
        rx = np.linspace(0, 6, n)
        ry = np.linspace(5.0, 11.0, n)  # receiver runs away perpendicular
        assert mirror_latency(x, y, rx, ry, 30, 0.1) is None

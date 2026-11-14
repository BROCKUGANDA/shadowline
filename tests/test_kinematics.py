"""Unit tests: kinematics math (circular statistics, derivatives, smoothing,
reversal detection) against known synthetic ground truth."""
import numpy as np
import pytest

from shadowline.kinematics import (accel_from_speed, angular_diff, bearing,
                                   circular_mean, cumulative_distance, heading,
                                   moving_average, path_length, smooth_heading,
                                   speed_from_positions, unwrap_deg, wrap_deg)


class TestCircularMath:
    def test_wrap(self):
        assert wrap_deg(-10) == 350
        assert wrap_deg(370) == 10
        assert wrap_deg(720) == 0

    def test_angular_diff_crosses_zero_boundary(self):
        """THE classic bug: naive |a-b| gives 340 here; correct answer is 20."""
        assert angular_diff(350, 10) == 20
        assert angular_diff(10, 350) == 20
        assert angular_diff(0, 180) == 180
        assert angular_diff(45, 45) == 0
        assert angular_diff(89, 91) == 2

    def test_circular_mean_wraps_correctly(self):
        # mean of 350 and 10 must be 0, not 180
        assert circular_mean(np.array([350.0, 10.0])) == pytest.approx(0.0, abs=0.1)

    def test_unwrap(self):
        seq = np.array([350.0, 355.0, 0.0, 5.0])
        unwrapped = unwrap_deg(seq)
        assert unwrapped[2] > 355  # continues past 360 instead of resetting

    def test_heading_quadrants(self):
        assert heading(np.array([1.0]), np.array([0.0]))[0] == pytest.approx(0)
        assert heading(np.array([0.0]), np.array([1.0]))[0] == pytest.approx(90)
        assert heading(np.array([-1.0]), np.array([0.0]))[0] == pytest.approx(180)
        assert heading(np.array([0.0]), np.array([-1.0]))[0] == pytest.approx(270)

    def test_bearing(self):
        # bearing from (0,0) to (1,1) is 45 deg
        assert bearing(np.array([0.0]), np.array([0.0]),
                       np.array([1.0]), np.array([1.0]))[0] == pytest.approx(45)


class TestDerivatives:
    def test_speed_from_positions_constant(self):
        x = np.array([0.0, 1.0, 2.0, 3.0])
        y = np.zeros(4)
        s = speed_from_positions(x, y, dt=0.1)
        assert np.allclose(s, 10.0)  # 1 yd per 0.1 s

    def test_accel_central_difference(self):
        s = np.array([0.0, 1.0, 2.0, 3.0])
        a = accel_from_speed(s, dt=0.1)
        # constant acceleration of 10 yd/s^2
        assert np.allclose(a, 10.0)

    def test_path_length_and_cumulative(self):
        x = np.array([0.0, 3.0, 3.0])
        y = np.array([0.0, 0.0, 4.0])
        assert path_length(x, y) == pytest.approx(7.0)
        cum = cumulative_distance(x, y)
        assert cum[0] == 0
        assert cum[-1] == pytest.approx(7.0)

    def test_sampling_awareness(self):
        # same displacement over double dt halves the speed
        x = np.array([0.0, 1.0])
        y = np.zeros(2)
        assert speed_from_positions(x, y, 0.1)[0] == pytest.approx(10.0)
        assert speed_from_positions(x, y, 0.2)[0] == pytest.approx(5.0)


class TestSmoothing:
    def test_preserves_length_and_finite(self):
        v = np.random.default_rng(0).normal(size=50)
        for w in (1, 3, 5, 7):
            sm = moving_average(v, w)
            assert len(sm) == len(v)
            assert np.all(np.isfinite(sm))

    def test_smooths_noise(self):
        rng = np.random.default_rng(1)
        signal = np.zeros(100)
        noisy = signal + rng.normal(0, 0.5, 100)
        assert np.std(moving_average(noisy, 11)) < np.std(noisy)

    def test_smooth_heading_circular(self):
        # heading crossing 0/360 must not create a false 180 jump
        hd = np.array([355, 358, 1, 4, 7], dtype=float)
        sm = smooth_heading(hd, 3)
        d = angular_diff(sm[0], sm[-1])
        assert d < 25  # naive smoothing would smear toward 180

    def test_originals_preserved_contract(self):
        """Callers must keep raw measurements: smoothing returns new arrays."""
        v = np.array([1.0, 2.0, 3.0])
        out = moving_average(v, 3)
        out[0] = 99
        assert v[0] == 1.0


class TestReversalDetection:
    def test_detects_shuttle_reversals(self, shuttle):
        from shadowline.kinematics import detect_reversals
        hd = np.array(shuttle["heading"])
        sp = np.array(shuttle["speed"])
        events = detect_reversals(hd, sp, shuttle["dt"])
        assert len(events) == 2
        angles = sorted(e["turn_angle_deg"] for e in events)
        for a in angles:
            assert 150 <= a <= 210  # two 180-degree reversals

    def test_no_reversal_in_linear_sprint(self):
        t = np.arange(60) * 0.1
        x = 0.5 * 8.0 * t ** 2
        y = np.zeros_like(x)
        sp = np.gradient(x, 0.1)
        hd = np.zeros_like(x)
        from shadowline.kinematics import detect_reversals
        assert detect_reversals(hd, sp, 0.1) == []

    def test_event_centres_align_with_plants(self, shuttle):
        from shadowline.kinematics import detect_reversals
        events = detect_reversals(np.array(shuttle["heading"]),
                                  np.array(shuttle["speed"]), shuttle["dt"])
        gt = shuttle["ground_truth"]["plant_indices"]
        for ev in events:
            closest = min(gt, key=lambda g: abs(g - ev["centre_idx"]))
            assert abs(closest - ev["centre_idx"]) <= 8  # within 0.8 s

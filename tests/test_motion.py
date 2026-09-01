"""The resting turn: a quarter and back, forever."""

import unittest

from umbra import motion


def sample(step=0.01):
    n = int(motion.CYCLE / step)
    return [motion.azimuth_at(i * step) for i in range(n + 1)]


class TheTurn(unittest.TestCase):

    def test_it_visits_both_readable_faces(self):
        angles = sample()
        self.assertAlmostEqual(min(a for a in angles if a >= 0), 0.0, places=6)
        self.assertTrue(any(abs(a - 90.0) < 1e-6 for a in angles))

    def test_it_never_turns_past_the_side_word(self):
        """Beyond a quarter turn the letters start reading backwards."""
        angles = sample()
        self.assertLess(max(angles), 95.0)
        self.assertGreater(min(angles), -5.0)

    def test_it_overshoots_and_settles(self):
        angles = sample()
        self.assertGreater(max(angles), 90.5, "no overshoot")
        self.assertLess(min(angles), -0.5, "no wind-up")

    def test_it_never_jumps(self):
        angles = sample(0.005)
        for a, b in zip(angles, angles[1:]):
            self.assertLess(abs(b - a), 1.5, "%.2f -> %.2f" % (a, b))

    def test_it_loops_seamlessly(self):
        self.assertAlmostEqual(motion.azimuth_at(0.0),
                               motion.azimuth_at(motion.CYCLE), places=9)

    def test_it_rests_at_each_face(self):
        holds = sum(1 for a in sample(0.01) if a in (0.0, 90.0))
        self.assertGreater(holds * 0.01, 2 * motion.HOLD - 0.2)


class Legibility(unittest.TestCase):

    def test_each_word_peaks_where_you_can_read_it(self):
        self.assertEqual(motion.legibility(0.0), (1.0, 0.0))
        self.assertEqual(motion.legibility(90.0), (0.0, 1.0))

    def test_neither_word_survives_the_middle(self):
        self.assertEqual(motion.legibility(45.0), (0.0, 0.0))

    def test_it_fades_rather_than_flicks(self):
        near = motion.legibility(3.0)[0]
        far = motion.legibility(7.0)[0]
        self.assertGreater(near, far)
        self.assertGreater(far, 0.0)

    def test_it_wraps_around(self):
        self.assertEqual(motion.legibility(-1.0), motion.legibility(359.0))
        self.assertEqual(motion.legibility(0.0), motion.legibility(360.0))

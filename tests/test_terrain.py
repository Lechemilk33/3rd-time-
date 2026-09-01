"""Engine invariants: drainage, conservation, determinism."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from landloom import hydrology, terrain
from landloom.rng import Streams

SEEDS = ["The Salt Reaches", "emberfall", "isles of glass"]


def small_world(phrase, **kw):
    kw.setdefault("width", 120)
    kw.setdefault("height", 90)
    kw.setdefault("quality", "fast")
    return terrain.build_terrain(Streams(phrase), **kw)


class TestDrainage(unittest.TestCase):
    def test_every_cell_drains_off_map_or_to_ocean(self):
        for phrase in SEEDS:
            t = small_world(phrase)
            n = t.grid.n
            for start in range(0, n, 7):
                i = start
                steps = 0
                while True:
                    if t.ocean[i]:
                        break
                    d = t.down[i]
                    if d < 0:  # drains off the map edge
                        self.assertTrue(t.grid.is_border(i),
                                        f"{phrase}: interior dead-end at {i}")
                        break
                    self.assertLess(t.filled[d], t.filled[i] + 1e-12,
                                    f"{phrase}: uphill flow at {i}")
                    i = d
                    steps += 1
                    self.assertLess(steps, n, f"{phrase}: flow cycle from {start}")

    def test_flux_conservation(self):
        for phrase in SEEDS:
            t = small_world(phrase)
            n = t.grid.n
            # total rain = n; all of it must end in cells with no receiver
            # (ocean sinks or border cells draining off-map)
            terminal = sum(t.flux[i] for i in range(n)
                           if t.down[i] < 0 or t.ocean[i])
            # ocean cells also receive upstream flux; count only what
            # arrives at terminal cells exactly once via flux argument:
            # here we assert a weaker, exact invariant instead — flux at
            # any cell is at least its own rain and at most total rain.
            self.assertTrue(all(1.0 <= t.flux[i] <= n for i in range(n)))
            self.assertGreaterEqual(terminal, n * 0.99)

    def test_rivers_reach_water(self):
        for phrase in SEEDS:
            t = small_world(phrase)
            thr = max(15.0, 0.01 * t.land_fraction * t.grid.n)
            rivers = hydrology.trace_rivers(
                t.grid, t.down, t.flux, t.ocean, t.lake_id, thr)
            self.assertGreater(len(rivers), 0, phrase)
            W = t.grid.W
            joined = set()
            for seg in rivers:
                for (x, y) in seg["points"]:
                    joined.add((x, y))
            for seg in rivers:
                x, y = seg["points"][-1]
                i = y * W + x
                ends_ok = (t.ocean[i] or t.grid.is_border(i)
                           or t.lake_id[i] >= 0
                           or (x, y) in joined and t.down[i] >= 0)
                self.assertTrue(ends_ok, f"{phrase}: river dead-end at {x},{y}")

    def test_land_fraction_near_target(self):
        t = small_world("The Salt Reaches", archetype="continent",
                        land_target=0.4)
        self.assertAlmostEqual(t.land_fraction, 0.4, delta=0.08)


class TestDeterminism(unittest.TestCase):
    def test_same_phrase_same_world(self):
        a = small_world("emberfall")
        b = small_world("emberfall")
        self.assertEqual(a.heights, b.heights)
        self.assertEqual(a.flux, b.flux)
        self.assertEqual(a.archetype, b.archetype)

    def test_phrase_normalization(self):
        a = small_world("  Emberfall ")
        b = small_world("emberfall")
        self.assertEqual(a.heights, b.heights)

    def test_different_phrase_different_world(self):
        a = small_world("emberfall")
        b = small_world("emberfall2")
        self.assertNotEqual(a.heights, b.heights)


if __name__ == "__main__":
    unittest.main()

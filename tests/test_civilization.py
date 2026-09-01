"""Civilization-layer invariants."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from landloom import world as world_mod

SEEDS = ["The Salt Reaches", "quiet harbor three"]
_CACHE = {}


def get_world(phrase):
    if phrase not in _CACHE:
        _CACHE[phrase] = world_mod.weave(phrase, width=150, height=115,
                                         quality="fast")
    return _CACHE[phrase]


class TestCivilization(unittest.TestCase):
    def test_settlements_on_dry_land(self):
        for phrase in SEEDS:
            w = get_world(phrase)
            self.assertGreaterEqual(len(w.settlements), 4, phrase)
            for p in w.settlements:
                i = p.y * w.grid.W + p.x
                self.assertFalse(w.terrain.ocean[i], f"{phrase}: {p.kind} in ocean")
                self.assertLess(w.terrain.lake_id[i], 0, f"{phrase}: {p.kind} in lake")

    def test_roads_stay_on_land(self):
        for phrase in SEEDS:
            w = get_world(phrase)
            W = w.grid.W
            for poly in w.roads:
                for (x, y) in poly["points"]:
                    i = y * W + x
                    self.assertFalse(w.terrain.ocean[i], f"{phrase}: road in ocean")
                    self.assertLess(w.terrain.lake_id[i], 0, f"{phrase}: road in lake")

    def test_roads_form_connected_network_per_landmass(self):
        for phrase in SEEDS:
            w = get_world(phrase)
            if len(w.roads) == 0:
                continue
            linked = {}
            for poly in w.roads:
                a, b = poly["ends"]
                linked.setdefault(a, set()).add(b)
                linked.setdefault(b, set()).add(a)
            # every settlement that has any road reaches a city or town
            majors = {k for k, p in enumerate(w.settlements)
                      if p.kind in ("city", "town")}
            for start in linked:
                seen = {start}
                stack = [start]
                while stack:
                    u = stack.pop()
                    for v in linked.get(u, ()):
                        if v not in seen:
                            seen.add(v)
                            stack.append(v)
                self.assertTrue(seen & majors,
                                f"{phrase}: road cluster without a major hub")

    def test_sea_lanes_over_ocean(self):
        for phrase in SEEDS:
            w = get_world(phrase)
            W = w.grid.W
            for lane in w.sea_lanes:
                pts = lane["points"][1:-1]  # endpoints are the ports on shore
                for (x, y) in pts:
                    self.assertTrue(w.terrain.ocean[y * W + x],
                                    f"{phrase}: sea lane crosses land")

    def test_provinces_cover_settlements(self):
        for phrase in SEEDS:
            w = get_world(phrase)
            for p in w.settlements:
                self.assertGreaterEqual(p.province, 0, phrase)

    def test_biomes_defined_on_land(self):
        for phrase in SEEDS:
            w = get_world(phrase)
            for i in range(w.grid.n):
                if not w.terrain.ocean[i]:
                    self.assertIsNotNone(w.biomes[i], phrase)


if __name__ == "__main__":
    unittest.main()

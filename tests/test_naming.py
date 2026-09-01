"""Naming and lore invariants."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from landloom import world as world_mod

SEEDS = ["The Salt Reaches", "old kingdom of ash"]
_CACHE = {}


def get_world(phrase):
    if phrase not in _CACHE:
        _CACHE[phrase] = world_mod.weave(phrase, width=150, height=115,
                                         quality="fast")
    return _CACHE[phrase]


def _normkey(name):
    key = name.lower().rstrip("e")
    for art in ("the ", "river ", "lake "):
        if key.startswith(art):
            key = key[len(art):]
    return key


class TestNaming(unittest.TestCase):
    def test_every_settlement_named_uniquely(self):
        for phrase in SEEDS:
            w = get_world(phrase)
            names = [p.name for p in w.settlements]
            self.assertTrue(all(names), phrase)
            keys = [_normkey(n) for n in names]
            self.assertEqual(len(keys), len(set(keys)),
                             f"{phrase}: near-duplicate settlement names {names}")

    def test_names_have_etymologies(self):
        for phrase in SEEDS:
            w = get_world(phrase)
            for p in w.settlements:
                self.assertTrue(p.etymology, f"{phrase}: {p.name}")
            for seg in w.rivers:
                if seg.get("name"):
                    self.assertTrue(seg.get("etymology"), phrase)

    def test_no_cross_category_duplicates(self):
        for phrase in SEEDS:
            w = get_world(phrase)
            keys = [_normkey(p.name) for p in w.settlements]
            keys += [_normkey(s["name"]) for s in w.rivers if s.get("name")]
            keys += [_normkey(f.name) for f in w.features if f.name]
            self.assertEqual(len(keys), len(set(keys)),
                             f"{phrase}: duplicate names across categories")

    def test_lore_text_mentions_real_places(self):
        for phrase in SEEDS:
            w = get_world(phrase)
            for p in w.settlements:
                self.assertTrue(p.lore["text"], phrase)
                self.assertGreater(p.lore["population"], 0)
                self.assertNotIn("{", p.lore["text"],
                                 f"{phrase}: unfilled template slot")
                self.assertNotIn("the the", p.lore["text"], phrase)

    def test_language_deterministic(self):
        a = get_world(SEEDS[0])
        b = world_mod.weave(SEEDS[0], width=150, height=115, quality="fast")
        self.assertEqual([p.name for p in a.settlements],
                         [p.name for p in b.settlements])
        self.assertEqual(a.endonym, b.endonym)


if __name__ == "__main__":
    unittest.main()

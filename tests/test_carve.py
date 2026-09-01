"""The promise: what you get out is exactly the two words you put in."""

import itertools
import random
import unittest

from umbra import font
from umbra.carve import Solid, _runs

PAIRS = [
    ("HELLO", "WORLD"),
    ("YES", "NO"),
    ("LOVE", "HATE"),
    ("A", "I"),
    ("STAY", "GO"),
    ("42", "OK"),
    ("GOOD NIGHT", "SLEEP"),
    ("W", "MMMMM"),
    ("!?&", "#$@"),
]


def brute_force(front, side):
    """The definition, spelled out slowly, with no boxes involved."""
    a = font.stamp(front)
    b = font.stamp(side)
    nz = font.CELL_H
    cells = set()
    for z in range(nz):
        arow = a[nz - 1 - z]
        brow = b[nz - 1 - z][::-1]
        for x, lit_b in enumerate(brow):
            if not lit_b:
                continue
            for y, lit_a in enumerate(arow):
                if lit_a:
                    cells.add((x, y, z))
    return cells


class Shadows(unittest.TestCase):

    def test_the_front_shadow_is_the_front_word(self):
        for front, side in PAIRS:
            solid = Solid(front, side)
            self.assertEqual(solid.shadow_front(), font.stamp(front),
                             "%s / %s" % (front, side))

    def test_the_side_shadow_is_the_side_word(self):
        for front, side in PAIRS:
            solid = Solid(front, side)
            self.assertEqual(solid.shadow_side(), font.stamp(side),
                             "%s / %s" % (front, side))

    def test_it_holds_for_words_pulled_out_of_a_hat(self):
        rng = random.Random(20260901)
        pool = font.CARVABLE
        for _ in range(120):
            front = "".join(rng.choice(pool) for _ in range(rng.randint(1, 6)))
            side = "".join(rng.choice(pool) for _ in range(rng.randint(1, 6)))
            solid = Solid(front, side)
            self.assertEqual(solid.shadow_front(), font.stamp(front))
            self.assertEqual(solid.shadow_side(), font.stamp(side))

    def test_swapping_the_words_swaps_the_shadows(self):
        one = Solid("CAT", "DOG")
        other = Solid("DOG", "CAT")
        self.assertEqual(one.shadow_front(), other.shadow_side())
        self.assertEqual(one.shadow_side(), other.shadow_front())


class Boxes(unittest.TestCase):

    def test_boxes_cover_the_solid_and_nothing_else(self):
        for front, side in PAIRS:
            solid = Solid(front, side)
            self.assertEqual(solid.cells(), brute_force(front, side),
                             "%s / %s" % (front, side))

    def test_boxes_never_overlap(self):
        for front, side in PAIRS:
            solid = Solid(front, side)
            for one, other in itertools.combinations(solid.boxes, 2):
                overlap = all(one[2 * i] < other[2 * i + 1] and
                              other[2 * i] < one[2 * i + 1] for i in range(3))
                self.assertFalse(overlap, "%s / %s: %s vs %s"
                                 % (front, side, one, other))

    def test_volume_agrees_with_counting_cells(self):
        for front, side in PAIRS:
            solid = Solid(front, side)
            self.assertEqual(solid.volume(), len(solid.cells()))

    def test_boxes_are_well_formed(self):
        solid = Solid("HELLO", "WORLD")
        for x0, x1, y0, y1, z0, z1 in solid.boxes:
            self.assertLess(x0, x1)
            self.assertLess(y0, y1)
            self.assertLess(z0, z1)
            self.assertGreaterEqual(x0, 0)
            self.assertLessEqual(x1, solid.nx)
            self.assertLessEqual(y1, solid.ny)
            self.assertLessEqual(z1, solid.nz)

    def test_there_is_nothing_left_to_add(self):
        """The carve keeps every cell it possibly can.

        Adding any other cell would light a pixel in one of the two shadows
        that the words do not ask for, so this solid is the biggest one that
        tells the truth -- and every hole in it is a hole that has to be there.
        """
        solid = Solid("HELLO", "WORLD")
        cells = solid.cells()
        front = solid.shadow_front()
        side = solid.shadow_side()
        empties = 0
        for z in range(solid.nz):
            r = solid.nz - 1 - z
            for y in range(solid.ny):
                for x in range(solid.nx):
                    if (x, y, z) in cells:
                        continue
                    empties += 1
                    mirrored = side[r][solid.nx - 1 - x]
                    spoils = (not front[r][y]) or (not mirrored)
                    self.assertTrue(spoils, "could keep %s" % ((x, y, z),))
        self.assertGreater(empties, 0)


class Runs(unittest.TestCase):

    def test_finds_maximal_stretches(self):
        self.assertEqual(_runs([]), [])
        self.assertEqual(_runs([False, False]), [])
        self.assertEqual(_runs([True]), [(0, 1)])
        self.assertEqual(_runs([True, True, False, True]), [(0, 2), (3, 4)])
        self.assertEqual(_runs([False, True, True]), [(1, 3)])

    def test_runs_never_touch(self):
        rng = random.Random(7)
        for _ in range(200):
            row = [rng.random() < 0.4 for _ in range(30)]
            found = _runs(row)
            for (a0, a1), (b0, b1) in zip(found, found[1:]):
                self.assertLess(a1, b0)
            self.assertEqual(sum(b - a for a, b in found), sum(row))

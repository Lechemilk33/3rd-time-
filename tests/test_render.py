"""What the screen shows, checked against what the words say.

These are the tests that matter.  Everything else could be right and the
sculpture could still be a smear; these read the pixels back and insist that
head-on, the picture *is* the first word, and side-on it *is* the second.
"""

import math
import unittest

from umbra import font
from umbra.carve import Solid
from umbra.render import BG, View, frame, shaded, silhouette

PAD = 4
SCALE = 3


def _view(solid, along_x):
    """A view with whole-number pixels per cell, so the mapping is exact."""
    across = solid.nx if along_x else solid.ny
    width = across * SCALE + 2 * PAD
    height = solid.nz * SCALE + 2 * PAD
    return View(solid, width, height, SCALE)


def _expected(rows, w, h, flip):
    """The word blown up to pixels, laid out where the view puts it."""
    out = [[False] * w for _ in range(h)]
    for i in range(h):
        r = (i - PAD) // SCALE
        if not 0 <= i - PAD < len(rows) * SCALE:
            continue
        for j in range(w):
            c = (j - PAD) // SCALE
            if not 0 <= j - PAD < len(rows[0]) * SCALE:
                continue
            out[i][j] = rows[r][len(rows[0]) - 1 - c if flip else c]
    return out


class TheShadowOnScreen(unittest.TestCase):

    WORDS = [("HELLO", "WORLD"), ("YES", "NO"), ("A", "I"),
             ("STAY", "GO"), ("42", "OK"), ("!?&", "MW")]

    def test_head_on_the_picture_is_the_front_word(self):
        for front, side in self.WORDS:
            solid = Solid(front, side)
            view = _view(solid, along_x=False)
            lit = silhouette(view, 0.0)
            want = _expected(font.stamp(front), view.w, view.h, flip=False)
            for i in range(view.h):
                got = tuple(lit[i * view.w + j] for j in range(view.w))
                self.assertEqual(got, tuple(want[i]),
                                 "%s/%s row %d" % (front, side, i))

    def test_side_on_the_picture_is_the_side_word(self):
        for front, side in self.WORDS:
            solid = Solid(front, side)
            view = _view(solid, along_x=True)
            lit = silhouette(view, math.radians(90))
            want = _expected(font.stamp(side), view.w, view.h, flip=False)
            for i in range(view.h):
                got = tuple(lit[i * view.w + j] for j in range(view.w))
                self.assertEqual(got, tuple(want[i]),
                                 "%s/%s row %d" % (front, side, i))

    def test_the_same_solid_answers_both_questions(self):
        """One object, two readings -- not two objects."""
        solid = Solid("HELLO", "WORLD")
        front_view = _view(solid, along_x=False)
        side_view = _view(solid, along_x=True)
        self.assertIs(front_view.solid, side_view.solid)
        self.assertIs(front_view.solid, solid)

    def test_a_quarter_turn_the_other_way_reads_backwards(self):
        """Which is why the resting animation never goes past ninety."""
        solid = Solid("HELLO", "WORLD")
        view = _view(solid, along_x=True)
        lit = silhouette(view, math.radians(270))
        want = _expected(font.stamp("WORLD"), view.w, view.h, flip=True)
        for i in range(view.h):
            got = tuple(lit[i * view.w + j] for j in range(view.w))
            self.assertEqual(got, tuple(want[i]), "row %d" % i)


class Rasteriser(unittest.TestCase):

    def setUp(self):
        self.solid = Solid("HELLO", "WORLD")
        self.view = View(self.solid, 100, 24)

    def test_it_returns_one_entry_per_pixel(self):
        pixels = frame(self.view, 0.7)
        self.assertEqual(len(pixels), self.view.w * self.view.h)

    def test_it_is_repeatable(self):
        self.assertEqual(frame(self.view, 0.7), frame(self.view, 0.7))

    def test_nothing_is_drawn_outside_the_solid(self):
        for deg in range(0, 360, 17):
            lit = silhouette(self.view, math.radians(deg))
            rows = [i for i in range(self.view.h)
                    if any(lit[i * self.view.w:(i + 1) * self.view.w])]
            tall = self.solid.nz * self.view.scale
            self.assertLessEqual(len(rows), math.ceil(tall) + 1, deg)

    def test_it_never_gets_wider_than_the_diagonal(self):
        widest = 0
        for deg in range(0, 360, 5):
            lit = silhouette(self.view, math.radians(deg))
            w = self.view.w
            cols = [j for j in range(w)
                    if any(lit[i * w + j] for i in range(self.view.h))]
            if cols:
                widest = max(widest, cols[-1] - cols[0] + 1)
        self.assertLessEqual(widest, math.ceil(2 * self.view.reach *
                                               self.view.scale) + 1)

    def test_forty_five_degrees_shows_more_than_either_face(self):
        """Turned halfway it is a block, not a letter -- that is the point."""
        head_on = sum(silhouette(self.view, 0.0))
        turned = sum(silhouette(self.view, math.radians(45)))
        self.assertGreater(turned, head_on * 2)

    def test_colours_stay_inside_the_byte_range(self):
        for value in frame(self.view, 1.0):
            if value is None:
                continue
            for channel in value:
                self.assertTrue(0 <= channel <= 255, value)


class Supersampling(unittest.TestCase):

    def test_every_pixel_gets_a_colour(self):
        solid = Solid("HI", "OK")
        view = View(solid, 60, 18)
        for samples in (1, 2, 3):
            pixels = shaded(view, 0.4, samples)
            self.assertEqual(len(pixels), view.w * view.h)
            self.assertTrue(all(p is not None for p in pixels))

    def test_the_edges_soften_but_the_middle_does_not_move(self):
        solid = Solid("HI", "OK")
        view = View(solid, 60, 18)
        hard = shaded(view, 0.0, 1)
        soft = shaded(view, 0.0, 3)
        self.assertNotEqual(hard, soft)
        empty_hard = sum(1 for p in hard if p == BG)
        empty_soft = sum(1 for p in soft if p == BG)
        # Softening only ever eats into the background at the border.
        self.assertLess(empty_soft, empty_hard)
        self.assertGreater(empty_soft, empty_hard * 0.8)


class Fitting(unittest.TestCase):

    def test_it_sizes_itself_to_the_window(self):
        solid = Solid("HELLO", "WORLD")
        small = View(solid, 60, 20)
        large = View(solid, 200, 60)
        self.assertLess(small.scale, large.scale)

    def test_a_long_word_needs_a_wide_window(self):
        short = View(Solid("HI", "OK"), 100, 30)
        long_ = View(Solid("ABCDEFGHIJ", "KLMNOPQRST"), 100, 30)
        self.assertGreater(short.scale, long_.scale)

    def test_the_solid_always_lands_inside_the_frame(self):
        solid = Solid("HELLO", "WORLD")
        view = View(solid, 100, 24)
        for deg in range(0, 360, 11):
            lit = silhouette(view, math.radians(deg))
            for i in range(view.h):
                self.assertFalse(lit[i * view.w], "spilled left at %d" % deg)
                self.assertFalse(lit[i * view.w + view.w - 1],
                                 "spilled right at %d" % deg)

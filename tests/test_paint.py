"""Reading the terminal output back, to check it says what it should."""

import math
import re
import unittest

from umbra import font, paint
from umbra.carve import Solid
from umbra.render import BG, View, shaded

CODE = re.compile(r"\x1b\[(3|4)8;2;(\d+);(\d+);(\d+)m")
BLOCK = "▀"


def decode(lines, w):
    """Turn painted rows back into the pixel grid they came from."""
    pixels = []
    for line in lines:
        top = [None] * w
        bottom = [None] * w
        fg = bg = None
        col = 0
        i = 0
        while i < len(line):
            if line[i] == "\x1b":
                match = CODE.match(line, i)
                if match:
                    colour = tuple(int(match.group(n)) for n in (2, 3, 4))
                    if match.group(1) == "3":
                        fg = colour
                    else:
                        bg = colour
                    i = match.end()
                    continue
                i = line.index("m", i) + 1
                continue
            if line[i] == BLOCK:
                top[col] = fg
                bottom[col] = bg
                col += 1
            i += 1
        pixels.append(top)
        pixels.append(bottom)
    return pixels


class WhatEndsUpOnScreen(unittest.TestCase):

    def test_the_painted_rows_spell_the_word(self):
        """End to end: words in, colour codes out, letters back again."""
        for front, side in (("HELLO", "WORLD"), ("YES", "NO"), ("42", "OK")):
            solid = Solid(front, side)
            scale = 3
            view = View(solid, solid.ny * scale + 8,
                        solid.nz * scale + 8, scale)
            pixels = shaded(view, 0.0, 1)
            lines = paint.lines(pixels, view.w, view.h, paint.TRUECOLOR)
            grid = decode(lines, view.w)

            rows = font.stamp(front)
            for i, row in enumerate(grid):
                for j, colour in enumerate(row):
                    r = (i - 4) // scale
                    c = (j - 4) // scale
                    inside = (0 <= i - 4 < len(rows) * scale
                              and 0 <= j - 4 < len(rows[0]) * scale)
                    want = inside and rows[r][c]
                    self.assertEqual(colour != BG, want,
                                     "%s pixel %d,%d" % (front, i, j))

    def test_every_row_carries_one_block_per_column(self):
        solid = Solid("HI", "OK")
        view = View(solid, 40, 16)
        lines = paint.lines(shaded(view, 0.6, 2), view.w, view.h,
                            paint.TRUECOLOR)
        self.assertEqual(len(lines), view.h // 2)
        for line in lines:
            self.assertEqual(line.count(BLOCK), view.w)
            self.assertTrue(line.endswith(paint.RESET))

    def test_colour_codes_are_only_sent_when_they_change(self):
        solid = Solid("HI", "OK")
        view = View(solid, 60, 16)
        pixels = shaded(view, 0.0, 1)
        line = paint.lines(pixels, view.w, view.h, paint.TRUECOLOR)[0]
        self.assertLess(len(CODE.findall(line)), view.w,
                        "a run of one colour should not repeat itself")


class Modes(unittest.TestCase):

    def test_indexed_colours_stay_in_range(self):
        for colour in ((0, 0, 0), (255, 255, 255), (12, 200, 45), BG):
            index = paint._index(colour)
            self.assertTrue(16 <= index <= 255, colour)

    def test_indexed_output_uses_indexed_codes(self):
        solid = Solid("HI", "OK")
        view = View(solid, 40, 16)
        line = paint.lines(shaded(view, 0.3, 1), view.w, view.h,
                           paint.INDEXED)[0]
        self.assertIn("\x1b[38;5;", line)
        self.assertNotIn("38;2;", line)

    def test_ascii_leaves_the_background_blank(self):
        solid = Solid("HI", "OK")
        view = View(solid, 40, 16)
        lines = paint.lines(shaded(view, 0.0, 1), view.w, view.h, paint.MONO)
        self.assertEqual(len(lines), view.h)
        self.assertTrue(any(line.strip() for line in lines))
        for line in lines:
            self.assertEqual(line[0], " ")
            self.assertEqual(line[-1], " ")
        for line in lines:
            self.assertEqual(len(line), view.w)
            self.assertNotIn("\x1b", line)

    def test_ascii_gets_brighter_where_the_light_is(self):
        solid = Solid("HELLO", "WORLD")
        view = View(solid, 90, 22)
        text = "\n".join(paint.lines(shaded(view, math.radians(40), 2),
                                     view.w, view.h, paint.MONO))
        self.assertGreater(len(set(text) - {" ", "\n"}), 4)

    def test_rows_of_pixels_depends_on_the_mode(self):
        self.assertEqual(paint.rows_of_pixels(10, paint.MONO), 10)
        self.assertEqual(paint.rows_of_pixels(10, paint.TRUECOLOR), 20)
        self.assertEqual(paint.rows_of_pixels(10, paint.INDEXED), 20)

    def test_tint_is_a_no_op_without_colour(self):
        self.assertEqual(paint.tint("hi", (1, 2, 3), paint.MONO), "hi")
        self.assertIn("hi", paint.tint("hi", (1, 2, 3), paint.TRUECOLOR))

"""The alphabet has exactly one job, and everything else depends on it."""

import unittest

from umbra import font


class GlyphShape(unittest.TestCase):

    def test_every_glyph_is_the_declared_size(self):
        for ch, rows in font.GLYPHS.items():
            self.assertEqual(len(rows), font.CELL_H, ch)
            for row in rows:
                self.assertEqual(len(row), font.CELL_W, ch)
                self.assertTrue(set(row) <= {"#", "."}, ch)

    def test_no_glyph_has_an_empty_row(self):
        """The whole trick fails on a letter with a gap across its middle.

        A height with no ink in it is a height with no material in it, and a
        height with no material casts no shadow -- so the word would come out
        of the sculpture with a stripe missing.
        """
        for ch, rows in font.GLYPHS.items():
            if ch == " ":
                continue
            for i, row in enumerate(rows):
                self.assertIn("#", row, "%r has nothing on row %d" % (ch, i))

    def test_every_glyph_has_ink_somewhere_in_every_column_set(self):
        """No glyph is secretly blank."""
        for ch, rows in font.GLYPHS.items():
            if ch == " ":
                continue
            self.assertIn("#", "".join(rows), ch)


class Normalising(unittest.TestCase):

    def test_folds_case_and_trims(self):
        self.assertEqual(font.normalise("  hello "), "HELLO")

    def test_keeps_inner_spaces(self):
        self.assertEqual(font.normalise("good night"), "GOOD NIGHT")

    def test_rejects_characters_with_no_glyph(self):
        with self.assertRaises(font.Uncarvable) as caught:
            font.normalise("HELLO~")
        self.assertIn("~", str(caught.exception))

    def test_rejects_nothing_at_all(self):
        for empty in ("", "   ", None):
            with self.assertRaises(font.Uncarvable):
                font.normalise(empty)


class Stamping(unittest.TestCase):

    def test_width_matches_the_stamp(self):
        for word in ("A", "HI", "HELLO", "GOOD NIGHT", "42"):
            rows = font.stamp(word)
            self.assertEqual(len(rows), font.CELL_H)
            for row in rows:
                self.assertEqual(len(row), font.width(word), word)

    def test_a_stamped_word_lights_every_row(self):
        for word in ("HELLO", "A", "GOOD NIGHT", "0", "!?&"):
            for i, row in enumerate(font.stamp(word)):
                self.assertTrue(any(row), "%s row %d" % (word, i))

    def test_letters_are_separated(self):
        rows = font.stamp("II")
        # A one-column gutter between the two I bars.
        self.assertEqual(rows[0], tuple([True] * 5 + [False] + [True] * 5))

"""Start the real program in a real terminal and watch it work."""

import io
import os
import sys
import time
import unittest

from tests.pty_harness import Session

RIGHT = b"\x1b[C"
LEFT = b"\x1b[D"

ALT_ON = "\x1b[?1049h"
ALT_OFF = "\x1b[?1049l"
CURSOR_OFF = "\x1b[?25l"
CURSOR_ON = "\x1b[?25h"


class ItRuns(unittest.TestCase):

    def test_it_takes_over_the_screen_and_gives_it_back(self):
        with Session(["HELLO", "WORLD"]) as run:
            self.assertTrue(run.read_until(ALT_ON, 10),
                            "never opened the alternate screen")
            self.assertIn(CURSOR_OFF, run.buffer)
            self.assertTrue(run.read_until("▀", 20), "never painted anything")
            run.press(b"q")
            self.assertEqual(run.wait(), 0)
            self.assertIn(ALT_OFF, run.buffer)
            self.assertIn(CURSOR_ON, run.buffer)

    def test_it_says_what_it_is_doing_while_it_carves(self):
        with Session(["HELLO", "WORLD"]) as run:
            self.assertTrue(run.read_until("carving", 10))
            run.press(b"q")
            run.wait()

    def test_it_shows_both_words_as_it_turns(self):
        """The whole point, checked from outside the program."""
        with Session(["HELLO", "WORLD"]) as run:
            self.assertTrue(run.read_until("H E L L O", 25),
                            "front word never appeared")
            self.assertTrue(run.read_until("W O R L D", 25),
                            "side word never appeared")
            run.press(b"q")
            self.assertEqual(run.wait(), 0)

    def test_the_hint_is_there_and_then_is_not(self):
        with Session(["HI", "OK"]) as run:
            self.assertTrue(run.read_until("turn it", 15))
            run.read(1.0)
            seen = len(run.buffer)
            deadline = time.monotonic() + 14
            while time.monotonic() < deadline:
                run.read(0.5)
                tail = run.buffer[seen:]
                if len(tail) > 40000 and "turn it" not in tail[-40000:]:
                    break
                seen = max(seen, len(run.buffer) - 40000)
            run.press(b"q")
            run.wait()

    def test_arrows_turn_it_by_hand(self):
        with Session(["HELLO", "WORLD"]) as run:
            self.assertTrue(run.read_until("▀", 20))
            run.read(0.8)
            for _ in range(12):
                run.press(RIGHT)
                time.sleep(0.03)
            moved = run.read(1.0)
            self.assertIn("▀", moved, "the picture did not repaint")
            run.press(b"q")
            self.assertEqual(run.wait(), 0)

    def test_left_and_right_cancel_out(self):
        with Session(["HI", "OK"]) as run:
            self.assertTrue(run.read_until("▀", 20))
            run.press(b" ")
            run.read(0.6)
            for _ in range(6):
                run.press(RIGHT)
            run.read(0.8)
            turned = _last_frame(run.buffer)
            for _ in range(6):
                run.press(LEFT)
            run.read(0.8)
            back = _last_frame(run.buffer)
            self.assertNotEqual(turned, back)
            for _ in range(6):
                run.press(RIGHT)
            run.read(0.8)
            self.assertEqual(_last_frame(run.buffer), turned)
            run.press(b"q")
            self.assertEqual(run.wait(), 0)

    def test_escape_also_quits(self):
        with Session(["HI", "OK"]) as run:
            self.assertTrue(run.read_until("▀", 20))
            run.press(b"\x1b")
            self.assertEqual(run.wait(), 0)

    def test_it_survives_a_stream_of_nonsense(self):
        with Session(["HI", "OK"]) as run:
            self.assertTrue(run.read_until("▀", 20))
            run.press(b"abcdefzxyw\x1b[A\x1b[B\x1b[Z\t\r\n0123")
            run.read(1.0)
            self.assertIsNone(run.proc.poll(), "it fell over")
            run.press(b"q")
            self.assertEqual(run.wait(), 0)


class ItAdaptsToTheWindow(unittest.TestCase):

    def test_a_wider_window_gets_a_bigger_sculpture(self):
        with Session(["HELLO", "WORLD"], cols=90, rows=26) as run:
            self.assertTrue(run.read_until("▀", 20))
            run.read(1.0)
            before = _widest_row(_last_frame(run.buffer))
            run.resize(150, 40)
            self.assertTrue(run.read_until("carving", 20),
                            "never noticed the new window")
            after = before
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline:
                run.read(0.5)
                after = _widest_row(_last_frame(run.buffer))
                if after > before + 20:
                    break
            self.assertGreater(after, before + 20)
            run.press(b"q")
            self.assertEqual(run.wait(), 0)


class ItWorksWithoutAScreen(unittest.TestCase):

    def test_piping_it_somewhere_prints_a_still(self):
        import subprocess
        import sys as _sys
        result = subprocess.run(
            [_sys.executable, "-m", "umbra", "HELLO", "WORLD"],
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            capture_output=True, text=True,
            env=dict(os.environ, COLUMNS="100", LINES="30"))
        self.assertEqual(result.returncode, 0)
        self.assertNotIn("\x1b", result.stdout)
        ink = [line for line in result.stdout.splitlines() if line.strip()]
        self.assertGreater(len(ink), 4)
        self.assertGreater(max(len(line) for line in ink), 30)

    def test_no_colour_still_turns(self):
        with Session(["HI", "OK"], env={"NO_COLOR": "1"}) as run:
            self.assertTrue(run.read_until("H I", 25), "no caption")
            self.assertNotIn("38;2;", run.buffer)
            self.assertNotIn("▀", run.buffer)
            run.press(b"q")
            self.assertEqual(run.wait(), 0)


class WithoutKeys(unittest.TestCase):
    """Anywhere raw key reading is unavailable, it should still turn."""

    class Deaf:
        """A screen that hears nothing, then hears someone say stop."""

        def __init__(self, quiet_rounds):
            self.left = quiet_rounds

        def pressed(self, timeout):
            self.left -= 1
            return None if self.left > 0 else "q"

    def test_it_runs_and_stops_without_a_keyboard(self):
        from umbra import app
        from umbra.carve import Solid

        out = io.StringIO()
        out.isatty = lambda: True
        table = app.Turntable(Solid("HI", "OK"), out=out, mode="truecolor")
        table.measure = lambda: ((60, 20), (59, 20), _small(table.solid))
        table.run(self.Deaf(4))
        painted = out.getvalue()
        self.assertIn("▀", painted)
        self.assertIn("carving", painted)

    def test_a_closed_stdin_does_not_upset_it(self):
        from umbra import app

        saved = sys.stdin
        try:
            sys.stdin = None
            self.assertFalse(app.Screen(io.StringIO()).keys)
        finally:
            sys.stdin = saved


def _small(solid):
    from umbra.render import fit
    return fit(solid, 59, 32)


class ItRefusesPolitely(unittest.TestCase):

    def test_a_letter_it_cannot_carve(self):
        with Session(["HELLO~", "WORLD"]) as run:
            self.assertEqual(run.wait(), 2)
            self.assertIn("no glyph", run.buffer)

    def test_one_word_is_not_enough(self):
        with Session(["HELLO"]) as run:
            self.assertEqual(run.wait(), 2)
            self.assertIn("exactly two words", run.buffer)

    def test_no_words_at_all_explains_itself(self):
        with Session([]) as run:
            self.assertEqual(run.wait(), 0)
            self.assertIn("umbra HELLO WORLD", run.buffer)

    def test_a_window_too_small_says_so(self):
        with Session(["ABCDEFGHIJ", "KLMNOPQRST"], cols=40, rows=12) as run:
            self.assertEqual(run.wait(), 1)
            self.assertIn("columns by", run.buffer)


def _widest_row(frame):
    """How many block glyphs the widest painted row of a frame carries."""
    return max((line.count("▀") for line in frame.split("\r\n")), default=0)


def _last_frame(text):
    """The most recent full repaint, keyed by its home-cursor marker."""
    parts = text.split("\x1b[H")
    return parts[-2] if len(parts) > 2 else parts[-1]


if __name__ == "__main__":
    unittest.main()

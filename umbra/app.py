"""The thing you actually watch."""

import math
import os
import select
import shutil
import sys
import time

from . import motion, paint
from .render import BG, fit, shaded

try:
    import termios
    import tty
except ImportError:                                   # pragma: no cover
    termios = tty = None

FPS = 30.0
STEP = 2.0                    # degrees a single key press turns it
HINT = "\u2190 \u2192  turn it     space  hold     q  done"
HINT_PLAIN = "left right  turn it     space  hold     q  done"
HINT_SHOWN = 8.0
HINT_FADE = 2.5


def window(stream=None):
    """Ask the terminal how big it is, not the environment.

    shutil.get_terminal_size trusts COLUMNS and LINES ahead of the terminal
    itself, which is right for a program whose output might be redirected and
    wrong for one that repaints the screen: a stale COLUMNS would pin the
    picture to a size the window stopped being.
    """
    for candidate in (stream, sys.__stdout__, sys.__stderr__):
        try:
            size = os.get_terminal_size(candidate.fileno())
        except (AttributeError, OSError, ValueError):
            continue
        if size.columns > 0 and size.lines > 0:
            return size.columns, size.lines
    fallback = shutil.get_terminal_size((80, 24))
    return fallback.columns, fallback.lines


_CAPTION = (255, 233, 190)
_DIM = (96, 92, 104)
_FAINT = (44, 44, 56)


def _mix(a, b, t):
    return (int(a[0] + (b[0] - a[0]) * t),
            int(a[1] + (b[1] - a[1]) * t),
            int(a[2] + (b[2] - a[2]) * t))


def _stdin_is_a_terminal():
    try:
        return sys.stdin.isatty()
    except (AttributeError, ValueError):
        return False


class Screen:
    """Alternate buffer, hidden cursor, raw keys -- and always put back."""

    def __init__(self, out=sys.stdout, keys=True):
        self.out = out
        self.keys = keys and termios is not None and _stdin_is_a_terminal()
        self._saved = None

    def __enter__(self):
        if self.keys:
            self._saved = termios.tcgetattr(sys.stdin.fileno())
            tty.setcbreak(sys.stdin.fileno())
        self.out.write("\x1b[?1049h\x1b[?25l\x1b[2J")
        self.out.flush()
        return self

    def __exit__(self, *exc):
        self.out.write("\x1b[0m\x1b[?25h\x1b[?1049l")
        self.out.flush()
        if self._saved is not None:
            termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN,
                              self._saved)
        return False

    def _byte(self, timeout):
        fd = sys.stdin.fileno()
        if not select.select([fd], [], [], max(0.0, timeout))[0]:
            return None
        return os.read(fd, 1) or None

    def pressed(self, timeout):
        """One key press, decoded, or None.  Arrows come back as names.

        Escape sequences are eaten one at a time, right up to their final
        byte and not a byte further -- hold an arrow key down and they arrive
        glued together, and swallowing a whole mouthful loses the ones behind.
        """
        if not self.keys:
            time.sleep(max(0.0, timeout))
            return None
        ch = self._byte(timeout)
        if ch is None:
            return None
        if ch != b"\x1b":
            return ch.decode("utf-8", "replace")
        lead = self._byte(0.04)
        if lead is None:
            return "escape"             # escape pressed on its own
        if lead not in (b"[", b"O"):
            return None                 # some alt-key combination
        for _ in range(16):
            tail = self._byte(0.05)
            if tail is None:
                return None
            if 0x40 <= tail[0] <= 0x7e:
                return {b"C": "right", b"D": "left"}.get(tail)
        return None


class Turntable:
    """Layout, frame cache, and the loop that ties them together."""

    def __init__(self, solid, out=sys.stdout, mode=None):
        self.solid = solid
        self.out = out
        self.mode = mode or paint.detect(out)
        self.cache = {}
        self.terminal = None      # what the terminal last told us it was
        self.size = None          # the box we actually draw into
        self.view = None

    # -- layout ---------------------------------------------------------

    def measure(self):
        seen = window(self.out)
        cols = max(20, seen[0] - 1)
        rows = max(8, seen[1])
        room = paint.rows_of_pixels(rows - 4, self.mode)
        return seen, (cols, rows), fit(self.solid, cols, room)

    def relayout(self):
        self.terminal, self.size, self.view = self.measure()
        self.cache.clear()

    def resized(self):
        return window(self.out) != self.terminal

    def samples(self):
        if self.mode == paint.MONO:
            return 1        # softened edges only muddy an ASCII ramp
        area = self.view.w * self.view.h
        if area <= 7000:
            return 3
        if area <= 20000:
            return 2
        return 1

    # -- pictures -------------------------------------------------------

    def picture(self, degrees):
        key = int(round(degrees)) % 360
        hit = self.cache.get(key)
        if hit is None:
            pixels = shaded(self.view, math.radians(key), self.samples())
            hit = paint.lines(pixels, self.view.w, self.view.h, self.mode)
            self.cache[key] = hit
        return hit

    def warm(self):
        """Carve every frame of the resting loop before showing anything."""
        want = [d % 360 for d in range(-3, 94)]
        cols = self.size[0]
        bar_row = self.size[1] // 2
        for i, deg in enumerate(want):
            self.picture(deg)
            if i % 6 == 0 or i == len(want) - 1:
                self._progress(bar_row, cols, (i + 1) / float(len(want)))
        self.out.write("\x1b[2J")

    def _progress(self, row, cols, done):
        width = min(34, max(10, cols - 20))
        filled = int(round(width * done))
        full, empty = ("=", "-") if self.mode == paint.MONO else ("\u2501",
                                                                  "\u2500")
        label = "carving  " + full * filled + empty * (width - filled)
        pad = max(0, (cols - len(label)) // 2)
        self.out.write("\x1b[%d;1H\x1b[2K%s%s" % (
            row, " " * pad, paint.tint(label, _DIM, self.mode)))
        self.out.flush()

    # -- captions -------------------------------------------------------

    def reading(self, degrees):
        """The word you can read right now, and how well: ("", 0.0) if none."""
        front, side = motion.legibility(degrees)
        if side > front:
            return self.solid.side, side
        return self.solid.front, front

    # -- the loop -------------------------------------------------------

    def run(self, screen):
        self.relayout()
        self.warm()
        started = time.monotonic()
        opened = started
        spun = 0.0            # degrees the viewer has added by hand
        held = None           # None while turning, else when it was stopped
        touched = None        # when a key was last pressed
        showing = None        # the frame currently on screen

        while True:
            now = time.monotonic()
            if self.resized():
                self.relayout()
                self.warm()
                showing = None

            clock = (held if held is not None else now) - started
            degrees = (motion.azimuth_at(clock) + spun) % 360.0
            key = int(round(degrees)) % 360
            fade = self._hint(now, touched, opened)
            state = (key, round(fade, 1))
            if state != showing:
                self.draw(degrees, fade)
                showing = state

            press = screen.pressed(1.0 / FPS)
            if press is None:
                continue
            touched = now
            if press in ("q", "Q", "escape", "\x03", "\x04"):
                return
            if press in ("left", "right"):
                spun += STEP if press == "right" else -STEP
                if held is None:
                    held = now
            elif press == " ":
                if held is None:
                    held = now
                else:
                    started += now - held
                    held = None

    def draw(self, degrees, fade):
        art = self.picture(degrees)
        cols, rows = self.size
        # Sculpture, a gap, the word, a gap, the controls -- as one block,
        # sitting a little above the middle of the window.
        block = len(art) + 4
        top = max(0, int((rows - block) * 0.44))
        bottom = max(0, rows - block - top)

        buf = ["\x1b[H"]
        buf.extend(["\x1b[2K\r\n"] * top)
        for line in art:
            buf.append("\x1b[2K")
            buf.append(line)
            buf.append("\r\n")

        word, strength = self.reading(degrees)
        buf.append("\x1b[2K\r\n\x1b[2K")
        if strength > 0.03:
            spaced = " ".join(word)
            colour = _mix(BG, _CAPTION, min(1.0, strength * 1.15))
            buf.append(" " * max(0, (cols - len(spaced)) // 2))
            buf.append(paint.tint(spaced, colour, self.mode))
        buf.append("\r\n\x1b[2K\r\n\x1b[2K")
        if fade > 0.0:
            hint = HINT_PLAIN if self.mode == paint.MONO else HINT
            buf.append(" " * max(0, (cols - len(hint)) // 2))
            buf.append(paint.tint(hint, _mix(BG, _FAINT, fade), self.mode))
        buf.append("\r\n")
        buf.extend(["\x1b[2K\r\n"] * max(0, bottom - 1))
        buf.append("\x1b[2K")
        self.out.write("".join(buf))
        self.out.flush()

    @staticmethod
    def _hint(now, touched, opened):
        """The controls line stays up briefly, then gets out of the way."""
        age = now - (touched if touched is not None else opened)
        if age < HINT_SHOWN:
            return 1.0
        if age < HINT_SHOWN + HINT_FADE:
            return 1.0 - (age - HINT_SHOWN) / HINT_FADE
        return 0.0


def watch(solid, out=sys.stdout):
    table = Turntable(solid, out)
    with Screen(out) as screen:
        try:
            table.run(screen)
        except KeyboardInterrupt:
            pass


def still(solid, out=sys.stdout, degrees=0.0, cols=None, rows=None):
    """One frame, plain text, for when there's no terminal to play in."""
    size = shutil.get_terminal_size((80, 24))
    cols = cols or max(20, size.columns - 1)
    rows = rows or max(8, size.lines - 4)
    view = fit(solid, cols, rows)
    pixels = shaded(view, math.radians(degrees), 1)
    for line in paint.lines(pixels, view.w, view.h, paint.MONO):
        out.write(line.rstrip() + "\n")

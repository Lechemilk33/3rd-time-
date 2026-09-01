"""Two words in, one turning solid out."""

import math
import sys

from . import font, paint
from .app import Turntable, still, watch
from .carve import Solid

USAGE = """\
umbra -- two words, one solid

    umbra HELLO WORLD

You get the object whose shadow is the first word head-on and the second
word from the side.  Same object.  It turns on its own; the arrow keys let
you turn it yourself.

Letters, digits and a little punctuation.  Quote anything with a space in it.
"""

MIN_SCALE = 1.15


def _too_small(solid, view):
    """A note about window size, or None if it already fits."""
    if view.scale >= MIN_SCALE:
        return None
    need_cols = int(math.ceil(2 * view.reach * MIN_SCALE)) + 3
    need_rows = int(math.ceil(solid.nz * MIN_SCALE / 2.0)) + 6
    return ("%s and %s need a window about %d columns by %d rows to read "
            "properly.\nShorter words work anywhere."
            % (solid.front, solid.side, need_cols, need_rows))


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] in ("-h", "--help", "help"):
        sys.stdout.write(USAGE)
        return 0
    if len(argv) != 2:
        sys.stderr.write("umbra takes exactly two words -- "
                         "try: umbra HELLO WORLD\n")
        return 2

    try:
        solid = Solid(argv[0], argv[1])
    except font.Uncarvable as exc:
        sys.stderr.write("%s\n" % exc)
        return 2

    if paint.detect() == paint.MONO and not sys.stdout.isatty():
        still(solid)
        return 0

    _, _, view = Turntable(solid).measure()
    note = _too_small(solid, view)
    if note:
        sys.stderr.write(note + "\n")
        return 1

    watch(solid)
    return 0

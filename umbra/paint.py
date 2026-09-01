"""Getting pixels into a terminal.

Two stacked pixels share one character cell: the upper half block glyph is
drawn in one colour and sits on a background of the other, which buys back the
vertical resolution that text cells throw away.  Colour codes are only re-sent
when they change, so a wide band of sky costs a handful of bytes.

Where colour isn't on offer, brightness becomes an ASCII ramp instead -- half
the height, but the sculpture still turns.
"""

import os
import sys

UPPER = "▀"
RESET = "\x1b[0m"

TRUECOLOR = "truecolor"
INDEXED = "256"
MONO = "mono"

_RAMP = " .:-=+*#%@"


def detect(stream=None):
    """Guess how much colour this terminal can take."""
    stream = stream or sys.stdout
    if not hasattr(stream, "isatty") or not stream.isatty():
        return MONO
    if os.environ.get("NO_COLOR") is not None:
        return MONO
    if os.environ.get("COLORTERM", "").lower() in ("truecolor", "24bit"):
        return TRUECOLOR
    term = os.environ.get("TERM", "")
    if "256" in term or term.startswith(("xterm", "screen", "tmux", "rxvt")):
        return INDEXED
    return MONO


def rows_of_pixels(art_rows, mode):
    """How many pixel rows fit in that many text rows."""
    return art_rows if mode == MONO else art_rows * 2


_CUBE = (0, 95, 135, 175, 215, 255)


def _nearest_cube(v):
    best, bi = 1 << 20, 0
    for i, c in enumerate(_CUBE):
        d = (c - v) * (c - v)
        if d < best:
            best, bi = d, i
    return bi


_index_cache = {}


def _index(colour):
    hit = _index_cache.get(colour)
    if hit is not None:
        return hit
    r, g, b = colour
    ri, gi, bi = _nearest_cube(r), _nearest_cube(g), _nearest_cube(b)
    cube = 16 + 36 * ri + 6 * gi + bi
    cr, cg, cb = _CUBE[ri], _CUBE[gi], _CUBE[bi]
    err = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2
    # The 24-step grey ladder is finer than the cube; it often wins.
    step = (0.299 * r + 0.587 * g + 0.114 * b - 8) / 10.0
    grey = min(23, max(0, int(round(step))))
    gv = 8 + 10 * grey
    gerr = (gv - r) ** 2 + (gv - g) ** 2 + (gv - b) ** 2
    out = cube if err <= gerr else 232 + grey
    _index_cache[colour] = out
    return out


def _luma(c):
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255.0


from .render import BG as _EMPTY

_FLOOR = _luma(_EMPTY)


def lines(pixels, w, h, mode):
    """Turn a pixel buffer into ready-to-print terminal rows."""
    if mode == MONO:
        top = len(_RAMP) - 1
        floor = _FLOOR or 0.0
        scale = 1.0 / (1.0 - floor) if floor < 1.0 else 1.0
        out = []
        for i in range(h):
            base = i * w
            row = []
            for j in range(w):
                t = (_luma(pixels[base + j]) - floor) * scale
                if t <= 0.0:
                    row.append(" ")
                else:
                    row.append(_RAMP[min(top, int(t ** 0.66 * (top + 0.999)))])
            out.append("".join(row))
        return out

    true = mode == TRUECOLOR
    out = []
    for i in range(0, h - 1, 2):
        top = i * w
        bot = top + w
        parts = []
        last_f = last_b = None
        for j in range(w):
            f = pixels[top + j]
            b = pixels[bot + j]
            if not true:
                f = _index(f)
                b = _index(b)
            if f != last_f:
                parts.append("\x1b[38;2;%d;%d;%dm" % f if true
                             else "\x1b[38;5;%dm" % f)
                last_f = f
            if b != last_b:
                parts.append("\x1b[48;2;%d;%d;%dm" % b if true
                             else "\x1b[48;5;%dm" % b)
                last_b = b
            parts.append(UPPER)
        parts.append(RESET)
        out.append("".join(parts))
    return out


def tint(text, colour, mode):
    """Colour a short run of text, as far as the terminal allows."""
    if mode == MONO:
        return text
    if mode == TRUECOLOR:
        return "\x1b[38;2;%d;%d;%dm%s%s" % (colour + (text, RESET))
    return "\x1b[38;5;%dm%s%s" % (_index(colour), text, RESET)

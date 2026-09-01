"""The alphabet you can carve.

Every glyph obeys one rule: no horizontal slice of it is empty.  Read that
again, because the whole trick rests on it -- a letter with a gap across its
middle would leave that height of the sculpture hollow, and a hollow slice
casts no shadow.  So the letters here are drawn to keep at least one lit cell
on every one of their seven rows.  It is a real constraint and it shows: the
exclamation point wears its dot on its sleeve, the question mark's tail is
joined.  They are honest about what they are.
"""

CELL_W = 5
CELL_H = 7
GAP = 1

_RAW = {
    "A": ".###."
         "#...#"
         "#...#"
         "#####"
         "#...#"
         "#...#"
         "#...#",
    "B": "####."
         "#...#"
         "#...#"
         "####."
         "#...#"
         "#...#"
         "####.",
    "C": ".###."
         "#...#"
         "#...."
         "#...."
         "#...."
         "#...#"
         ".###.",
    "D": "####."
         "#...#"
         "#...#"
         "#...#"
         "#...#"
         "#...#"
         "####.",
    "E": "#####"
         "#...."
         "#...."
         "####."
         "#...."
         "#...."
         "#####",
    "F": "#####"
         "#...."
         "#...."
         "####."
         "#...."
         "#...."
         "#....",
    "G": ".###."
         "#...#"
         "#...."
         "#.###"
         "#...#"
         "#...#"
         ".###.",
    "H": "#...#"
         "#...#"
         "#...#"
         "#####"
         "#...#"
         "#...#"
         "#...#",
    "I": "#####"
         "..#.."
         "..#.."
         "..#.."
         "..#.."
         "..#.."
         "#####",
    "J": "..###"
         "...#."
         "...#."
         "...#."
         "...#."
         "#..#."
         ".##..",
    "K": "#...#"
         "#..#."
         "#.#.."
         "##..."
         "#.#.."
         "#..#."
         "#...#",
    "L": "#...."
         "#...."
         "#...."
         "#...."
         "#...."
         "#...."
         "#####",
    "M": "#...#"
         "##.##"
         "#.#.#"
         "#...#"
         "#...#"
         "#...#"
         "#...#",
    "N": "#...#"
         "##..#"
         "#.#.#"
         "#..##"
         "#...#"
         "#...#"
         "#...#",
    "O": ".###."
         "#...#"
         "#...#"
         "#...#"
         "#...#"
         "#...#"
         ".###.",
    "P": "####."
         "#...#"
         "#...#"
         "####."
         "#...."
         "#...."
         "#....",
    "Q": ".###."
         "#...#"
         "#...#"
         "#...#"
         "#.#.#"
         "#..#."
         ".##.#",
    "R": "####."
         "#...#"
         "#...#"
         "####."
         "#.#.."
         "#..#."
         "#...#",
    "S": ".####"
         "#...."
         "#...."
         ".###."
         "....#"
         "....#"
         "####.",
    "T": "#####"
         "..#.."
         "..#.."
         "..#.."
         "..#.."
         "..#.."
         "..#..",
    "U": "#...#"
         "#...#"
         "#...#"
         "#...#"
         "#...#"
         "#...#"
         ".###.",
    "V": "#...#"
         "#...#"
         "#...#"
         "#...#"
         "#...#"
         ".#.#."
         "..#..",
    "W": "#...#"
         "#...#"
         "#...#"
         "#...#"
         "#.#.#"
         "##.##"
         "#...#",
    "X": "#...#"
         "#...#"
         ".#.#."
         "..#.."
         ".#.#."
         "#...#"
         "#...#",
    "Y": "#...#"
         "#...#"
         ".#.#."
         "..#.."
         "..#.."
         "..#.."
         "..#..",
    "Z": "#####"
         "....#"
         "...#."
         "..#.."
         ".#..."
         "#...."
         "#####",
    "0": ".###."
         "#...#"
         "#..##"
         "#.#.#"
         "##..#"
         "#...#"
         ".###.",
    "1": "..#.."
         ".##.."
         "#.#.."
         "..#.."
         "..#.."
         "..#.."
         "#####",
    "2": ".###."
         "#...#"
         "....#"
         "...#."
         "..#.."
         ".#..."
         "#####",
    "3": "#####"
         "...#."
         "..#.."
         "...#."
         "....#"
         "#...#"
         ".###.",
    "4": "...#."
         "..##."
         ".#.#."
         "#..#."
         "#####"
         "...#."
         "...#.",
    "5": "#####"
         "#...."
         "####."
         "....#"
         "....#"
         "#...#"
         ".###.",
    "6": "..##."
         ".#..."
         "#...."
         "####."
         "#...#"
         "#...#"
         ".###.",
    "7": "#####"
         "....#"
         "...#."
         "..#.."
         ".#..."
         ".#..."
         ".#...",
    "8": ".###."
         "#...#"
         "#...#"
         ".###."
         "#...#"
         "#...#"
         ".###.",
    "9": ".###."
         "#...#"
         "#...#"
         ".####"
         "....#"
         "...#."
         ".##..",
    "!": ".###."
         ".###."
         ".###."
         "..#.."
         "..#.."
         "..#.."
         ".###.",
    "?": ".###."
         "#...#"
         "....#"
         "..##."
         "..#.."
         "..#.."
         ".###.",
    "&": ".##.."
         "#..#."
         "#..#."
         ".##.."
         "#.#.#"
         "#..#."
         ".##.#",
    "#": ".#.#."
         ".#.#."
         "#####"
         ".#.#."
         "#####"
         ".#.#."
         ".#.#.",
    "$": "..#.."
         ".####"
         "#.#.."
         ".###."
         "..#.#"
         "####."
         "..#..",
    "/": "....#"
         "....#"
         "...#."
         "..#.."
         ".#..."
         "#...."
         "#....",
    "\\": "#...."
          "#...."
          ".#..."
          "..#.."
          "...#."
          "....#"
          "....#",
    "@": ".###."
         "#...#"
         "#.###"
         "#.#.#"
         "#.###"
         "#...."
         ".###.",
    " ": "....."
         "....."
         "....."
         "....."
         "....."
         "....."
         ".....",
}

GLYPHS = {
    ch: tuple(bits[r * CELL_W:(r + 1) * CELL_W] for r in range(CELL_H))
    for ch, bits in _RAW.items()
}

CARVABLE = "".join(sorted(c for c in GLYPHS if c != " "))


class Uncarvable(ValueError):
    """Raised for a character with no glyph, or for an empty word."""


def normalise(word):
    """Fold a user's word to the carvable alphabet, or explain why we can't."""
    out = (word or "").upper()
    bad = sorted({c for c in out if c not in GLYPHS})
    if bad:
        shown = " ".join(repr(c) for c in bad)
        raise Uncarvable(
            "no glyph for %s -- carvable characters are %s and space"
            % (shown, CARVABLE)
        )
    if not out.strip():
        raise Uncarvable("a word made only of space casts no shadow")
    return out.strip()


def stamp(word):
    """Render a normalised word to a list of rows of bools, top row first."""
    letters = [GLYPHS[c] for c in word]
    rows = []
    for r in range(CELL_H):
        parts = [g[r] for g in letters]
        line = ("." * GAP).join(parts)
        rows.append(tuple(c == "#" for c in line))
    return rows


def width(word):
    n = len(word)
    return n * CELL_W + (n - 1) * GAP if n else 0

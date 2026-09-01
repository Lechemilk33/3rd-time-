"""Turning two words into one solid.

Take the first word and push it through space like a cookie cutter: an
infinitely long prism whose cross-section is the letters.  Do the same with the
second word, at right angles.  Now keep only the material that both prisms
claim.  What's left is a single lump that hides a word in each of two
directions -- and because of the rule the alphabet follows, the lump's outline
from the front is *exactly* the first word, not merely something like it.

The lump is stored two ways.  As unit cells, for cutting a mesh.  And as a
short list of disjoint boxes, because the intersection of two prisms has a lot
of structure -- every horizontal slice is a grid of rectangles -- and a few
hundred boxes draw a great deal faster than six thousand cubes.
"""

from . import font


def _runs(row):
    """Maximal runs of True in a row of bools, as half-open (start, stop)."""
    out = []
    start = None
    for i, v in enumerate(row):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(row)))
    return out


class Solid:
    """The intersection of two extruded words.

    Axes: x runs along the side word, y along the front word, z upward with
    z=0 at the base.  A cell (x, y, z) is solid when both words are lit there.
    """

    __slots__ = ("front", "side", "_a", "_b", "nx", "ny", "nz", "boxes")

    def __init__(self, front, side):
        self.front = font.normalise(front)
        self.side = font.normalise(side)

        a_top = font.stamp(self.front)          # rows, top first
        s_top = font.stamp(self.side)

        # Flip to z-up, and mirror the side word so that turning the sculpture
        # a quarter-turn to the right shows it the way round you'd read it.
        self._a = [a_top[font.CELL_H - 1 - z] for z in range(font.CELL_H)]
        self._b = [s_top[font.CELL_H - 1 - z][::-1]
                   for z in range(font.CELL_H)]

        self.ny = len(self._a[0])
        self.nx = len(self._b[0])
        self.nz = font.CELL_H
        self.boxes = tuple(self._decompose())

    # -- shape ----------------------------------------------------------

    def _decompose(self):
        """Cut the solid into disjoint axis-aligned boxes, tall ones merged."""
        z = 0
        while z < self.nz:
            zz = z + 1
            while (zz < self.nz
                   and self._a[zz] == self._a[z]
                   and self._b[zz] == self._b[z]):
                zz += 1
            for x0, x1 in _runs(self._b[z]):
                for y0, y1 in _runs(self._a[z]):
                    yield (x0, x1, y0, y1, z, zz)
            z = zz

    def cells(self):
        """Every solid unit cell, as (x, y, z)."""
        out = set()
        for x0, x1, y0, y1, z0, z1 in self.boxes:
            for z in range(z0, z1):
                for y in range(y0, y1):
                    for x in range(x0, x1):
                        out.add((x, y, z))
        return out

    def volume(self):
        return sum((x1 - x0) * (y1 - y0) * (z1 - z0)
                   for x0, x1, y0, y1, z0, z1 in self.boxes)

    # -- the promise ----------------------------------------------------

    def shadow_front(self):
        """What the sculpture blocks when lit from the front, top row first."""
        grid = [[False] * self.ny for _ in range(self.nz)]
        for x0, x1, y0, y1, z0, z1 in self.boxes:
            for z in range(z0, z1):
                row = grid[z]
                for y in range(y0, y1):
                    row[y] = True
        return [tuple(grid[self.nz - 1 - r]) for r in range(self.nz)]

    def shadow_side(self):
        """The same, lit from the right; un-mirrored so it reads as written."""
        grid = [[False] * self.nx for _ in range(self.nz)]
        for x0, x1, y0, y1, z0, z1 in self.boxes:
            for z in range(z0, z1):
                row = grid[z]
                for x in range(x0, x1):
                    row[x] = True
        return [tuple(reversed(grid[self.nz - 1 - r])) for r in range(self.nz)]

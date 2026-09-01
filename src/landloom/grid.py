"""Regular grid topology with 8-connected neighborhoods."""

import math

__all__ = ["Grid"]

_SQRT2 = math.sqrt(2.0)


class Grid:
    """A W x H grid addressed by flat index i = y * W + x."""

    def __init__(self, width: int, height: int):
        self.W = width
        self.H = height
        self.n = width * height
        self._build_neighbors()

    def idx(self, x: int, y: int) -> int:
        return y * self.W + x

    def xy(self, i: int):
        return i % self.W, i // self.W

    def is_border(self, i: int) -> bool:
        x, y = i % self.W, i // self.W
        return x == 0 or y == 0 or x == self.W - 1 or y == self.H - 1

    def _build_neighbors(self):
        W, H = self.W, self.H
        offsets = [(-1, -1, _SQRT2), (0, -1, 1.0), (1, -1, _SQRT2),
                   (-1, 0, 1.0), (1, 0, 1.0),
                   (-1, 1, _SQRT2), (0, 1, 1.0), (1, 1, _SQRT2)]
        neighbors = []
        ndists = []
        for y in range(H):
            for x in range(W):
                ns = []
                ds = []
                for dx, dy, d in offsets:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H:
                        ns.append(ny * W + nx)
                        ds.append(d)
                neighbors.append(tuple(ns))
                ndists.append(tuple(ds))
        self.neighbors = neighbors
        self.ndists = ndists

    def border_cells(self):
        W, H = self.W, self.H
        cells = list(range(W))
        cells.extend(range((H - 1) * W, H * W))
        for y in range(1, H - 1):
            cells.append(y * W)
            cells.append(y * W + W - 1)
        return cells

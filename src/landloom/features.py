"""Named-feature detection: mountain ranges, forests, lakes, deserts, seas.

Blob-finds contiguous regions of like terrain, keeps the majors, and
computes a centroid plus principal axis so labels can run along a range
instead of across it.
"""

import math

__all__ = ["Feature", "detect_features"]

_KIND_BIOMES = {
    "range": {"peak", "alpine"},
    "forest": {"forest", "taiga", "rainforest"},
    "marsh": {"marsh"},
    "desert": {"desert"},
}

_MIN_SIZE = {"range": 60, "forest": 140, "marsh": 90, "desert": 160,
             "lake": 12, "sea": 400}


class Feature:
    def __init__(self, kind, cells, grid):
        self.kind = kind
        self.cells = cells
        self.size = len(cells)
        W = grid.W
        xs = [i % W for i in cells]
        ys = [i // W for i in cells]
        n = len(cells)
        self.cx = sum(xs) / n
        self.cy = sum(ys) / n
        # principal axis via covariance
        cxx = sum((x - self.cx) ** 2 for x in xs) / n
        cyy = sum((y - self.cy) ** 2 for y in ys) / n
        cxy = sum((xs[k] - self.cx) * (ys[k] - self.cy) for k in range(n)) / n
        self.angle = 0.5 * math.atan2(2 * cxy, cxx - cyy)
        self.extent = math.sqrt(max(cxx, cyy)) * 2.0
        self.name = None
        self.etymology = None

    def as_dict(self):
        return {"kind": self.kind, "name": self.name, "size": self.size,
                "x": round(self.cx, 1), "y": round(self.cy, 1)}


def _blobs(grid, member):
    seen = bytearray(grid.n)
    out = []
    neighbors = grid.neighbors
    for i in range(grid.n):
        if member(i) and not seen[i]:
            seen[i] = 1
            stack = [i]
            cells = [i]
            while stack:
                c = stack.pop()
                for j in neighbors[c]:
                    if member(j) and not seen[j]:
                        seen[j] = 1
                        stack.append(j)
                        cells.append(j)
            out.append(cells)
    return out


def detect_features(world):
    t = world.terrain
    grid = t.grid
    feats = []

    for kind, biomes in _KIND_BIOMES.items():
        for cells in _blobs(grid, lambda i, B=biomes: (not t.ocean[i])
                            and world.biomes[i] in B):
            if len(cells) >= _MIN_SIZE[kind]:
                feats.append(Feature(kind, cells, grid))

    # lakes by id (already grouped)
    lakes = {}
    for i in range(grid.n):
        if t.lake_id[i] >= 0:
            lakes.setdefault(t.lake_id[i], []).append(i)
    for cells in lakes.values():
        if len(cells) >= _MIN_SIZE["lake"]:
            feats.append(Feature("lake", cells, grid))

    # the sea: largest connected ocean blob
    oceans = _blobs(grid, lambda i: bool(t.ocean[i]))
    oceans.sort(key=len, reverse=True)
    if oceans and len(oceans[0]) >= _MIN_SIZE["sea"]:
        f = Feature("sea", oceans[0], grid)
        # anchor the sea label in open water: rank ocean cells by
        # distance from any coast and keep several well-separated
        # candidates, so the label can dodge map furniture
        W = grid.W
        step = max(1, len(oceans[0]) // 900)
        coast = []
        for i in range(grid.n):
            if not t.ocean[i]:
                continue
            for j in grid.neighbors[i]:
                if not t.ocean[j]:
                    coast.append((i % W, i // W))
                    break
        coast = coast[::max(1, len(coast) // 250)] or [(0, 0)]
        scored = []
        for i in oceans[0][::step]:
            x, y = i % W, i // W
            d = min((x - cx) ** 2 + (y - cy) ** 2 for cx, cy in coast)
            scored.append((d, x, y))
        scored.sort(reverse=True)
        anchors = []
        min_sep2 = (min(grid.W, grid.H) / 4.5) ** 2
        for d, x, y in scored:
            if all((x - ax) ** 2 + (y - ay) ** 2 > min_sep2
                   for ax, ay in anchors):
                anchors.append((x, y))
            if len(anchors) >= 4:
                break
        if anchors:
            f.cx, f.cy = anchors[0]
            f.angle = 0.0
        f.anchors = anchors
        feats.append(f)

    feats.sort(key=lambda f: -f.size)
    return feats

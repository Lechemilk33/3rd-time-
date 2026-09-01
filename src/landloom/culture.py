"""Settlements and territories.

Settlements are not sprinkled — they are sited the way real towns were:
fresh water, flat ground, a livable climate, and above all trade access.
A sheltered coast with a river mouth outranks everything, which is why
the biggest city in most worlds is a port at a delta. Provinces then
grow outward from their seats by travel-cost, so borders follow
mountains and deserts rather than straight lines.
"""

import heapq
import math

__all__ = ["Settlement", "build_settlements", "build_territories"]

_BIOME_LIVE = {
    "glacier": -3.0, "tundra": -1.2, "taiga": 0.5, "forest": 1.2,
    "rainforest": 0.4, "grassland": 1.6, "savanna": 0.8, "shrubland": 0.6,
    "desert": -1.1, "marsh": -0.6, "alpine": -1.2, "peak": -3.0,
}

_BIOME_TRAVEL = {
    "glacier": 3.0, "tundra": 1.6, "taiga": 1.35, "forest": 1.2,
    "rainforest": 1.8, "grassland": 1.0, "savanna": 1.05, "shrubland": 1.1,
    "desert": 1.5, "marsh": 2.2, "alpine": 2.6, "peak": 4.5,
}


class Settlement:
    def __init__(self, i, x, y, kind, harbor, on_river, on_lake, score):
        self.i = i
        self.x = x
        self.y = y
        self.kind = kind          # "city" | "town" | "village"
        self.harbor = harbor
        self.on_river = on_river
        self.on_lake = on_lake
        self.score = score
        self.province = -1
        self.name = None
        self.lore = None

    def as_dict(self):
        return {"name": self.name, "kind": self.kind, "x": self.x,
                "y": self.y, "harbor": self.harbor, "on_river": self.on_river,
                "province": self.province}


def _local_relief(grid, heights, i):
    hi = heights[i]
    r = 0.0
    for j in grid.neighbors[i]:
        d = abs(heights[j] - hi)
        if d > r:
            r = d
    return r


def build_settlements(streams, t, c, river_cells):
    """Score and greedily place settlements with spacing."""
    rng = streams.fork("settlements")
    grid = t.grid
    n = grid.n
    W = grid.W

    near_river = bytearray(n)
    for i in river_cells:
        near_river[i] = 1
        for j in grid.neighbors[i]:
            near_river[j] = 1

    coastal = bytearray(n)
    for i in range(n):
        if not t.ocean[i]:
            for j in grid.neighbors[i]:
                if t.ocean[j]:
                    coastal[i] = 1
                    break

    lakeside = bytearray(n)
    for i in range(n):
        if t.lake_id[i] < 0 and not t.ocean[i]:
            for j in grid.neighbors[i]:
                if t.lake_id[j] >= 0:
                    lakeside[i] = 1
                    break

    scores = []
    for i in range(n):
        if t.ocean[i] or t.lake_id[i] >= 0:
            continue
        b = c.biomes[i]
        if b in ("glacier", "peak"):
            continue
        s = _BIOME_LIVE.get(b, 0.0)
        s += math.exp(-((c.temperature[i] - 0.55) ** 2) / 0.045) * 1.4  # comfort
        if near_river[i]:
            s += 2.4
        if coastal[i]:
            s += 2.6
            if near_river[i]:
                s += 2.2       # river mouth: prime harbor
        if lakeside[i]:
            s += 1.3
        s -= _local_relief(grid, t.heights, i) * 55.0
        s += (rng.random() - 0.5) * 0.6
        if s > 0.2:
            scores.append((s, i))

    scores.sort(reverse=True)
    land_cells = t.land_fraction * n
    want = max(6, min(18, int(land_cells / 1650)))
    min_sep = max(9.0, (land_cells ** 0.5) / 9.5)

    placed = []
    for s, i in scores:
        x, y = i % W, i // W
        ok = True
        for p in placed:
            if math.hypot(p.x - x, p.y - y) < min_sep:
                ok = False
                break
        if not ok:
            continue
        placed.append(Settlement(i, x, y, "village", bool(coastal[i]),
                                 bool(near_river[i]), bool(lakeside[i]), s))
        if len(placed) >= want:
            break

    placed.sort(key=lambda p: -p.score)
    n_cities = 2 if len(placed) < 10 else 3
    n_towns = max(2, len(placed) // 3)
    for k, p in enumerate(placed):
        if k < n_cities:
            p.kind = "city"
        elif k < n_cities + n_towns:
            p.kind = "town"
    return placed


def travel_cost(grid, t, c, i, j, dist):
    """Cost of moving from cell i to adjacent cell j."""
    if t.ocean[j] or t.lake_id[j] >= 0:
        return None
    w = _BIOME_TRAVEL.get(c.biomes[j], 1.2)
    climb = abs(t.heights[j] - t.heights[i])
    return dist * (w + climb * 30.0)


def build_territories(t, c, settlements):
    """Multi-source Dijkstra from province seats over travel cost."""
    grid = t.grid
    n = grid.n
    seats = [p for p in settlements if p.kind in ("city", "town")]
    seats = seats[:max(3, min(6, len(seats)))]
    province = [-1] * n
    dist = [math.inf] * n
    heap = []
    for k, p in enumerate(seats):
        p.province = k
        province[p.i] = k
        dist[p.i] = 0.0
        heap.append((0.0, p.i, k))
    heapq.heapify(heap)
    neighbors = grid.neighbors
    ndists = grid.ndists
    while heap:
        d, i, k = heapq.heappop(heap)
        if d > dist[i]:
            continue
        ns = neighbors[i]
        ds = ndists[i]
        for m in range(len(ns)):
            j = ns[m]
            step = travel_cost(grid, t, c, i, j, ds[m])
            if step is None:
                continue
            nd = d + step
            if nd < dist[j]:
                dist[j] = nd
                province[j] = k
                heapq.heappush(heap, (nd, j, k))
    # every remaining settlement belongs to the province it sits in
    for p in settlements:
        if p.province < 0:
            p.province = province[p.i]
    return province, seats

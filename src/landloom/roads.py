"""Roads: A* routing between settlements with trunk-road reuse.

Edges of a spanning tree over the settlements are routed in order of
importance. Cells already carrying a road become cheaper to traverse, so
later routes merge into earlier ones and a trunk network emerges instead
of a spiderweb. River crossings pay a toll — roads seek fords, and where
they do cross, a bridge is recorded. Ports with no land route between
them get a sea lane.
"""

import heapq
import math

from .culture import travel_cost

__all__ = ["build_roads", "build_sea_lanes"]

_ROAD_DISCOUNT = 0.5
_RIVER_TOLL = 5.0


def _astar(grid, t, c, road_cells, river_cells, start, goal):
    W = grid.W
    gx, gy = goal % W, goal // W
    dist = {start: 0.0}
    prev = {}
    heap = [(0.0, start)]
    neighbors = grid.neighbors
    ndists = grid.ndists
    seen = set()
    while heap:
        f, i = heapq.heappop(heap)
        if i == goal:
            path = [i]
            while i in prev:
                i = prev[i]
                path.append(i)
            path.reverse()
            return path
        if i in seen:
            continue
        seen.add(i)
        di = dist[i]
        ns = neighbors[i]
        ds = ndists[i]
        for m in range(len(ns)):
            j = ns[m]
            if j in seen:
                continue
            step = travel_cost(grid, t, c, i, j, ds[m])
            if step is None:
                continue
            if j in road_cells:
                step *= _ROAD_DISCOUNT
            if j in river_cells and i not in river_cells:
                step += _RIVER_TOLL
            nd = di + step
            if nd < dist.get(j, math.inf):
                dist[j] = nd
                prev[j] = i
                x, y = j % W, j // W
                h = math.hypot(gx - x, gy - y) * 0.9
                heapq.heappush(heap, (nd + h, j))
    return None


def _mst_edges(settlements):
    """Kruskal spanning tree over straight-line distance."""
    pts = [(p.x, p.y) for p in settlements]
    edges = []
    for a in range(len(pts)):
        for b in range(a + 1, len(pts)):
            d = math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1])
            edges.append((d, a, b))
    edges.sort()
    parent = list(range(len(pts)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    chosen = []
    for d, a, b in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            chosen.append((d, a, b))
    return chosen


def build_roads(t, c, settlements, river_cells):
    """Returns (road polylines, road cell set, bridge points)."""
    grid = t.grid
    W = grid.W
    rank = {"city": 0, "town": 1, "village": 2}
    edges = _mst_edges(settlements)
    # route important connections first so lesser roads merge into them
    edges.sort(key=lambda e: (rank[settlements[e[1]].kind]
                              + rank[settlements[e[2]].kind], e[0]))
    road_cells = set()
    polylines = []
    bridges = []
    for d, a, b in edges:
        pa, pb = settlements[a], settlements[b]
        path = _astar(grid, t, c, road_cells, river_cells, pa.i, pb.i)
        if path is None:
            continue  # different landmass; a sea lane may cover it
        pts = [(i % W, i // W) for i in path]
        polylines.append({"points": pts, "kind": "road",
                          "ends": (a, b)})
        prev_in_river = False
        for i in path:
            road_cells.add(i)
            in_river = i in river_cells
            if in_river and not prev_in_river:
                bridges.append((i % W, i // W))
            prev_in_river = in_river
    return polylines, road_cells, bridges


def _sea_path(grid, t, start, goal):
    """Shortest path over ocean cells between two coastal settlements."""
    W = grid.W
    gx, gy = goal % W, goal // W

    def water_ok(j):
        return t.ocean[j]

    starts = [j for j in grid.neighbors[start] if water_ok(j)]
    goals = {j for j in grid.neighbors[goal] if water_ok(j)}
    if not starts or not goals:
        return None
    dist = {}
    prev = {}
    heap = []
    for j in starts:
        dist[j] = 0.0
        heap.append((0.0, j))
    heapq.heapify(heap)
    seen = set()
    neighbors = grid.neighbors
    ndists = grid.ndists
    while heap:
        f, i = heapq.heappop(heap)
        if i in goals:
            path = [i]
            while i in prev:
                i = prev[i]
                path.append(i)
            path.reverse()
            return path
        if i in seen:
            continue
        seen.add(i)
        di = dist[i]
        ns = neighbors[i]
        ds = ndists[i]
        for m in range(len(ns)):
            j = ns[m]
            if j in seen or not water_ok(j):
                continue
            nd = di + ds[m]
            if nd < dist.get(j, math.inf):
                dist[j] = nd
                prev[j] = i
                x, y = j % W, j // W
                heapq.heappush(heap, (nd + math.hypot(gx - x, gy - y), j))
    return None


def build_sea_lanes(t, settlements, road_polylines):
    """Connect ports that no road joins."""
    grid = t.grid
    W = grid.W
    ports = [k for k, p in enumerate(settlements) if p.harbor]
    if len(ports) < 2:
        return []
    reach = {k: {k} for k in range(len(settlements))}
    for poly in road_polylines:
        a, b = poly["ends"]
        union = reach[a] | reach[b]
        for k in union:
            reach[k] = union
    lanes = []
    linked = set()
    for ai in range(len(ports)):
        for bi in range(ai + 1, len(ports)):
            a, b = ports[ai], ports[bi]
            if b in reach[a]:
                continue
            key = tuple(sorted((min(a, b), max(a, b))))
            if key in linked:
                continue
            path = _sea_path(grid, t, settlements[a].i, settlements[b].i)
            if path:
                pts = [(settlements[a].x, settlements[a].y)]
                pts += [(i % W, i // W) for i in path]
                pts.append((settlements[b].x, settlements[b].y))
                lanes.append({"points": pts, "kind": "sea", "ends": (a, b)})
                linked.add(key)
                union = reach[a] | reach[b]
                for k in union:
                    reach[k] = union
    return lanes

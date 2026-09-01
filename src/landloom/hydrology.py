"""Drainage: depression filling, flow routing, flux accumulation, rivers.

The core guarantee comes from priority-flood depression filling (Barnes,
Lehman & Mulla 2014): flooding inward from the map border with a strictly
increasing epsilon leaves every cell with a monotonically descending path
off the map. Rivers traced on the filled surface therefore always reach
the sea (or the border) — no dead ends, no puddle artifacts.
"""

import heapq

__all__ = ["fill_sinks", "flow_directions", "accumulate_flux",
           "find_lakes", "trace_rivers"]

_EPS = 1e-6


def fill_sinks(grid, heights):
    """Priority-flood with epsilon drainage, seeded from the border."""
    n = grid.n
    filled = [0.0] * n
    closed = bytearray(n)
    heap = []
    for i in grid.border_cells():
        closed[i] = 1
        filled[i] = heights[i]
        heap.append((heights[i], i))
    heapq.heapify(heap)
    neighbors = grid.neighbors
    push = heapq.heappush
    pop = heapq.heappop
    while heap:
        v, i = pop(heap)
        for j in neighbors[i]:
            if not closed[j]:
                closed[j] = 1
                hj = heights[j]
                fv = v + _EPS
                if hj > fv:
                    fv = hj
                filled[j] = fv
                push(heap, (fv, j))
    return filled


def flow_directions(grid, filled):
    """Steepest-descent D8 neighbor per cell; -1 where flow leaves the map."""
    n = grid.n
    down = [-1] * n
    neighbors = grid.neighbors
    ndists = grid.ndists
    for i in range(n):
        fi = filled[i]
        best = -1
        best_slope = 0.0
        ns = neighbors[i]
        ds = ndists[i]
        for k in range(len(ns)):
            j = ns[k]
            drop = fi - filled[j]
            if drop > 0.0:
                slope = drop / ds[k]
                if slope > best_slope:
                    best_slope = slope
                    best = j
        down[i] = best
    return down


def accumulate_flux(grid, filled, down, rain=None):
    """Route rain downhill; returns per-cell accumulated flux.

    Cells are processed from highest to lowest so every contributor is
    settled before its receiver.  Total flux delivered to sinks/border
    equals total rainfall (conservation — asserted in tests).
    """
    n = grid.n
    flux = list(rain) if rain is not None else [1.0] * n
    order = sorted(range(n), key=filled.__getitem__, reverse=True)
    for i in order:
        d = down[i]
        if d >= 0:
            flux[d] += flux[i]
    return flux, order


def find_lakes(grid, heights, filled, ocean, min_cells=3, depth=0.0015):
    """Cells raised noticeably by depression filling form lakes.

    Returns (lake_id per cell with -1 for none, list of lake surface levels).
    """
    n = grid.n
    lake_id = [-1] * n
    is_lake = bytearray(n)
    for i in range(n):
        if not ocean[i] and filled[i] - heights[i] > depth:
            is_lake[i] = 1
    levels = []
    neighbors = grid.neighbors
    next_id = 0
    for i in range(n):
        if is_lake[i] and lake_id[i] < 0:
            stack = [i]
            lake_id[i] = next_id
            cells = [i]
            while stack:
                c = stack.pop()
                for j in neighbors[c]:
                    if is_lake[j] and lake_id[j] < 0:
                        lake_id[j] = next_id
                        stack.append(j)
                        cells.append(j)
            if len(cells) < min_cells:
                for c in cells:
                    lake_id[c] = -1
            else:
                levels.append(max(filled[c] for c in cells))
                next_id += 1
    return lake_id, levels


def trace_rivers(grid, down, flux, ocean, lake_id, threshold):
    """Extract river polylines from the flow graph.

    Each segment runs from a source (or a confluence) downstream until it
    meets the ocean, leaves the map, or joins an already-traced channel.
    Returns a list of dicts: {"points": [(x, y), ...], "flux": [...]}.
    """
    n = grid.n
    W = grid.W
    is_river = bytearray(n)
    for i in range(n):
        if flux[i] >= threshold and not ocean[i]:
            is_river[i] = 1

    has_upstream = bytearray(n)
    for i in range(n):
        if is_river[i]:
            d = down[i]
            if d >= 0 and is_river[d]:
                has_upstream[d] = 1

    visited = bytearray(n)
    segments = []
    sources = [i for i in range(n) if is_river[i] and not has_upstream[i]]
    sources.sort(key=lambda i: -flux[i])
    for src in sources:
        if visited[src]:
            continue
        pts = []
        fx = []
        i = src
        while True:
            pts.append((i % W, i // W))
            fx.append(flux[i])
            if visited[i]:
                break  # joined an existing channel at this point
            visited[i] = 1
            d = down[i]
            if d < 0 or ocean[d]:
                if d >= 0:
                    pts.append((d % W, d // W))
                    fx.append(flux[i])
                break
            i = d
        if len(pts) >= 2:
            segments.append({"points": pts, "flux": fx})
    return segments

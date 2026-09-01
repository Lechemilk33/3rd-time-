"""Heightfield synthesis and fluvial erosion.

A macro landform (continent, coast, isles, highlands) shapes a fractal
base field; a few ridge spines give mountains a grain. The field is then
carved by stream-power erosion: on each pass, depressions are filled,
flow is routed, and cells are lowered in proportion to slope times the
square root of drainage area — the standard first-order model of how
rivers actually cut valleys. Dendritic drainage emerges on its own.
"""

import math

from . import hydrology
from .grid import Grid
from .noise import fbm, hash01

__all__ = ["Terrain", "build_terrain", "ARCHETYPES"]

ARCHETYPES = ["continent", "coast", "isles", "highlands"]

_LAND_TARGETS = {"continent": 0.44, "coast": 0.58, "isles": 0.34, "highlands": 0.88}
_EROSION_PASSES = {"fast": 6, "standard": 14, "fine": 26}


class Terrain:
    def __init__(self, grid, heights, sea_level, archetype):
        self.grid = grid
        self.heights = heights
        self.sea_level = sea_level
        self.archetype = archetype
        # filled in by finalize()
        self.ocean = None
        self.filled = None
        self.down = None
        self.flux = None
        self.order = None
        self.lake_id = None
        self.lake_levels = None
        self.land_fraction = 0.0

    def is_land(self, i):
        return not self.ocean[i]


def _sea_level_for(heights, land_target):
    ranked = sorted(heights)
    k = int(len(ranked) * (1.0 - land_target))
    k = min(max(k, 0), len(ranked) - 1)
    return ranked[k]


def _ocean_mask(grid, heights, sea_level):
    """Cells below sea level connected to the border (4-connected)."""
    W, H = grid.W, grid.H
    ocean = bytearray(grid.n)
    stack = []
    for i in grid.border_cells():
        if heights[i] < sea_level and not ocean[i]:
            ocean[i] = 1
            stack.append(i)
    while stack:
        i = stack.pop()
        x, y = i % W, i // W
        if x > 0 and heights[i - 1] < sea_level and not ocean[i - 1]:
            ocean[i - 1] = 1
            stack.append(i - 1)
        if x < W - 1 and heights[i + 1] < sea_level and not ocean[i + 1]:
            ocean[i + 1] = 1
            stack.append(i + 1)
        if y > 0 and heights[i - W] < sea_level and not ocean[i - W]:
            ocean[i - W] = 1
            stack.append(i - W)
        if y < H - 1 and heights[i + W] < sea_level and not ocean[i + W]:
            ocean[i + W] = 1
            stack.append(i + W)
    return ocean


def _ridge_spines(rng, count):
    spines = []
    for _ in range(count):
        cx, cy = rng.uniform(0.15, 0.85), rng.uniform(0.15, 0.85)
        ang = rng.uniform(0.0, math.pi)
        length = rng.uniform(0.2, 0.55)
        dx, dy = math.cos(ang) * length / 2, math.sin(ang) * length / 2
        spines.append((cx - dx, cy - dy, cx + dx, cy + dy,
                       rng.uniform(0.35, 0.8),   # strength
                       rng.uniform(0.05, 0.11)))  # width
    return spines


def _dist_to_segment(px, py, x1, y1, x2, y2):
    vx, vy = x2 - x1, y2 - y1
    wx, wy = px - x1, py - y1
    seg2 = vx * vx + vy * vy
    t = 0.0 if seg2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / seg2))
    dx, dy = px - (x1 + t * vx), py - (y1 + t * vy)
    return math.hypot(dx, dy)


def _base_field(grid, streams, archetype):
    rng = streams.fork("terrain")
    seed = streams.fork_int("terrain-noise")
    ridge_seed = streams.fork_int("terrain-ridge")
    warp_seed = streams.fork_int("terrain-warp")
    W, H = grid.W, grid.H
    aspect = W / H
    scale = 3.2

    n_spines = {"continent": 3, "coast": 3, "isles": 4, "highlands": 2}[archetype]
    spines = _ridge_spines(rng, n_spines)

    if archetype == "continent":
        ccx = rng.uniform(0.42, 0.58)
        ccy = rng.uniform(0.42, 0.58)
    coast_ang = rng.uniform(0.0, 2 * math.pi)
    cax, cay = math.cos(coast_ang), math.sin(coast_ang)

    heights = [0.0] * grid.n
    inv_w, inv_h = 1.0 / (W - 1), 1.0 / (H - 1)
    for y in range(H):
        v = y * inv_h
        row = y * W
        for x in range(W):
            u = x * inv_w
            # domain warp keeps coastlines from looking like noise contours
            wx = fbm(u * 2.1 * aspect + 40.0, v * 2.1 + 40.0, warp_seed, octaves=3)
            wy = fbm(u * 2.1 * aspect - 17.0, v * 2.1 - 17.0, warp_seed, octaves=3)
            uu = u + (wx - 0.5) * 0.22
            vv = v + (wy - 0.5) * 0.22

            base = fbm(uu * scale * aspect, vv * scale, seed, octaves=5)

            ridge = 0.0
            for sx1, sy1, sx2, sy2, strength, width in spines:
                d = _dist_to_segment(uu, vv, sx1, sy1, sx2, sy2)
                if d < width * 3:
                    bump = math.exp(-(d * d) / (2 * width * width))
                    rn = fbm(uu * 6.0 * aspect, vv * 6.0, ridge_seed, octaves=4)
                    ridge += strength * bump * (0.55 + 0.9 * rn)

            h = base * 0.65 + ridge * 0.6

            if archetype == "continent":
                dx, dy = (u - ccx) * 1.15, (v - ccy)
                d = math.hypot(dx, dy) * 2.1
                h *= max(0.0, 1.0 - d * d * 0.75)
            elif archetype == "coast":
                t = (u - 0.5) * cax + (v - 0.5) * cay + 0.5
                h *= 0.25 + 0.75 * min(1.0, max(0.0, 1.25 - 1.4 * t))
            elif archetype == "isles":
                h = h ** 1.65 * 1.35
                bx, by = abs(u - 0.5) * 2, abs(v - 0.5) * 2
                edge = max(bx, by)
                if edge > 0.82:
                    h *= max(0.0, (1.0 - edge) / 0.18)
            else:  # highlands
                h = 0.3 + h * 0.75

            heights[row + x] = h

    lo, hi = min(heights), max(heights)
    span = (hi - lo) or 1.0
    return [(h - lo) / span for h in heights]


def _erode(grid, heights, sea_level, passes, streams):
    """Stream-power erosion with light thermal creep."""
    n = grid.n
    neighbors = grid.neighbors
    ndists = grid.ndists
    k_fluvial = 0.0026
    cap = 0.016
    talus = 0.045
    for _ in range(passes):
        filled = hydrology.fill_sinks(grid, heights)
        down = hydrology.flow_directions(grid, filled)
        flux, _ = hydrology.accumulate_flux(grid, filled, down)
        for i in range(n):
            if heights[i] <= sea_level:
                continue
            d = down[i]
            if d < 0:
                continue
            drop = filled[i] - filled[d]
            if drop <= 0.0:
                continue
            erode = k_fluvial * math.sqrt(flux[i]) * drop
            if erode > cap:
                erode = cap
            heights[i] -= erode
        # thermal creep: shave overly steep faces onto their footslopes
        for i in range(n):
            hi = heights[i]
            if hi <= sea_level:
                continue
            ns = neighbors[i]
            ds = ndists[i]
            for k in range(len(ns)):
                j = ns[k]
                diff = hi - heights[j]
                s = diff / ds[k]
                if s > talus:
                    move = (s - talus) * ds[k] * 0.18
                    heights[i] = hi = hi - move
                    heights[j] += move * 0.7
    return heights


def _dither(grid, heights, seed, amplitude):
    W = grid.W
    for i in range(grid.n):
        heights[i] += (hash01(i % W, i // W, seed) - 0.5) * amplitude


def build_terrain(streams, width=260, height=200, archetype=None,
                  land_target=None, quality="standard"):
    grid = Grid(width, height)
    rng = streams.fork("terrain-arch")
    if archetype is None:
        archetype = rng.choices(ARCHETYPES, weights=[42, 28, 20, 10])[0]
    if archetype not in ARCHETYPES:
        raise ValueError(f"unknown archetype {archetype!r}; expected one of {ARCHETYPES}")
    if land_target is None:
        land_target = _LAND_TARGETS[archetype]

    heights = _base_field(grid, streams, archetype)
    _dither(grid, heights, streams.fork_int("terrain-dither-a"), 0.006)
    sea_level = _sea_level_for(heights, land_target)
    passes = _EROSION_PASSES.get(quality, _EROSION_PASSES["standard"])
    heights = _erode(grid, heights, sea_level, passes, streams)
    # break D8 grid alignment before the final drainage solve; the
    # subsequent priority-flood re-fill restores the descent guarantee
    _dither(grid, heights, streams.fork_int("terrain-dither-b"), 0.0035)
    # erosion lowers land; re-strike sea level so the land budget holds
    sea_level = _sea_level_for(heights, land_target)

    t = Terrain(grid, heights, sea_level, archetype)
    finalize(t)
    return t


def finalize(t, rain=None):
    """(Re)compute drainage products on the current heightfield."""
    grid = t.grid
    t.ocean = _ocean_mask(grid, t.heights, t.sea_level)
    t.filled = hydrology.fill_sinks(grid, t.heights)
    t.down = hydrology.flow_directions(grid, t.filled)
    t.flux, t.order = hydrology.accumulate_flux(grid, t.filled, t.down, rain)
    t.lake_id, t.lake_levels = hydrology.find_lakes(
        grid, t.heights, t.filled, t.ocean)
    land = sum(1 for i in range(grid.n) if not t.ocean[i])
    t.land_fraction = land / grid.n
    return t

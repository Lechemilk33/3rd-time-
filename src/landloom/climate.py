"""Climate: temperature bands, wind-advected moisture, biome classing.

Moisture is not noise — it is advected. A prevailing wind is chosen for
the world; air picks up moisture over open water, drops it as it travels
inland, and loses extra crossing high ground. Deserts therefore appear in
rain shadows behind mountain ranges, on the leeward side, exactly where
they belong.
"""

import math

__all__ = ["Climate", "build_climate", "BIOMES"]

BIOMES = ["glacier", "tundra", "taiga", "forest", "rainforest", "grassland",
          "savanna", "shrubland", "desert", "marsh", "alpine", "peak"]

_WINDS = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]


class Climate:
    def __init__(self):
        self.temperature = None   # [0,1] cold -> hot
        self.moisture = None      # [0,1]
        self.rain = None          # per-cell rainfall weight for flux
        self.biomes = None        # str per cell
        self.wind = None          # (dx, dy)
        self.north_cold = True


def _advect_moisture(grid, heights, ocean, lake_id, wind):
    """March cells in wind order, carrying moisture from open water."""
    W, H = grid.W, grid.H
    dx, dy = wind
    moisture = [0.0] * grid.n

    # visit order: upwind cells first
    xs = range(W) if dx >= 0 else range(W - 1, -1, -1)
    ys = range(H) if dy >= 0 else range(H - 1, -1, -1)

    base_loss = 0.012
    oro_loss = 5.5
    # each cell draws on a fan of upwind neighbors so plumes spread
    # laterally instead of running in one-cell-wide streaks
    if dx and dy:
        fan = [(-dx, -dy, 0.55), (-dx, 0, 0.225), (0, -dy, 0.225)]
    elif dx:
        fan = [(-dx, 0, 0.6), (-dx, -1, 0.2), (-dx, 1, 0.2)]
    else:
        fan = [(0, -dy, 0.6), (-1, -dy, 0.2), (1, -dy, 0.2)]
    # visit cells strictly downwind of their fan: column-major for pure
    # east/west winds (the fan spans three rows of the previous column),
    # row-major otherwise (the fan sits in earlier rows/columns)
    if dy == 0:
        cells = ((x, y) for x in xs for y in range(H))
    else:
        cells = ((x, y) for y in ys for x in xs)
    for x, y in cells:
            i = y * W + x
            if ocean[i] or lake_id[i] >= 0:
                moisture[i] = 1.0
                continue
            m_in = 0.0
            h_in = 0.0
            wsum = 0.0
            for fx, fy, wgt in fan:
                ux, uy = x + fx, y + fy
                if 0 <= ux < W and 0 <= uy < H:
                    u = uy * W + ux
                    m_in += moisture[u] * wgt
                    h_in += heights[u] * wgt
                    wsum += wgt
            if wsum == 0.0:
                moisture[i] = 0.35  # air entering from off-map
                continue
            m = m_in / wsum
            climb = heights[i] - h_in / wsum
            loss = base_loss + (oro_loss * climb if climb > 0 else 0.0)
            moisture[i] = m * max(0.0, 1.0 - loss)
    return moisture


def _diffuse(grid, field, passes=2):
    W, H = grid.W, grid.H
    for _ in range(passes):
        nxt = list(field)
        for y in range(1, H - 1):
            row = y * W
            for x in range(1, W - 1):
                i = row + x
                nxt[i] = (field[i] * 0.4
                          + (field[i - 1] + field[i + 1]
                             + field[i - W] + field[i + W]) * 0.15)
        field = nxt
    return field


def build_climate(streams, t):
    """Compute climate over a finalized Terrain."""
    rng = streams.fork("climate")
    grid = t.grid
    n = grid.n
    W, H = grid.W, grid.H
    c = Climate()
    c.wind = _WINDS[rng.randrange(8)]
    c.north_cold = rng.random() < 0.65
    base = rng.uniform(0.42, 0.68)   # temperature at the warm edge
    grad = rng.uniform(0.28, 0.5)    # equator-to-pole falloff across map
    lapse = 0.55

    sea = t.sea_level
    span = max(1e-9, 1.0 - sea)
    temp = [0.0] * n
    for y in range(H):
        v = y / (H - 1)
        band = base + grad * ((1.0 - v) if not c.north_cold else v) - grad * 0.5
        row = y * W
        for x in range(W):
            i = row + x
            rel = max(0.0, (t.heights[i] - sea) / span)
            temp[i] = max(0.0, min(1.0, band - lapse * rel * rel * 1.6))
    c.temperature = temp

    m = _advect_moisture(grid, t.heights, t.ocean, t.lake_id, c.wind)
    m = _diffuse(grid, m, passes=2)
    c.moisture = m

    # rainfall drives the *final* hydrology pass: wet uplands feed big rivers
    c.rain = [0.12 + 1.6 * (m[i] ** 1.4) for i in range(n)]

    c.biomes = _classify(grid, t, c)
    return c


def _classify(grid, t, c):
    n = grid.n
    sea = t.sea_level
    span = max(1e-9, 1.0 - sea)
    biomes = [None] * n
    for i in range(n):
        if t.ocean[i]:
            continue
        rel = max(0.0, (t.heights[i] - sea) / span)
        tt = c.temperature[i]
        m = c.moisture[i]
        if rel > 0.8:
            biomes[i] = "peak"
        elif rel > 0.62 and tt < 0.55:
            biomes[i] = "alpine"
        elif tt < 0.11:
            biomes[i] = "glacier"
        elif tt < 0.24:
            biomes[i] = "tundra"
        elif rel < 0.05 and m > 0.68 and tt > 0.3:
            biomes[i] = "marsh"
        elif tt < 0.46:
            biomes[i] = "taiga" if m > 0.32 else "shrubland"
        elif tt < 0.72:
            if m > 0.52:
                biomes[i] = "forest"
            elif m > 0.24:
                biomes[i] = "grassland"
            elif m > 0.1:
                biomes[i] = "shrubland"
            else:
                biomes[i] = "desert"
        else:
            if m > 0.6:
                biomes[i] = "rainforest"
            elif m > 0.26:
                biomes[i] = "savanna"
            else:
                biomes[i] = "desert"
    return biomes

"""24-bit ANSI terminal rendering using half-block characters.

Each character cell shows two map rows (upper half via foreground color,
lower half via background), doubling vertical resolution.
"""

__all__ = ["render_ansi"]

_RESET = "\x1b[0m"


def _shade(base, factor):
    r, g, b = base
    return (max(0, min(255, int(r * factor))),
            max(0, min(255, int(g * factor))),
            max(0, min(255, int(b * factor))))


def _lerp3(a, b, t):
    return (int(a[0] + (b[0] - a[0]) * t),
            int(a[1] + (b[1] - a[1]) * t),
            int(a[2] + (b[2] - a[2]) * t))


def cell_color(world, i):
    """RGB for one grid cell, shaded by elevation and slope."""
    t = world.terrain
    h = t.heights[i]
    if t.ocean[i]:
        depth = max(0.0, min(1.0, (t.sea_level - h) * 9.0))
        return _lerp3((92, 138, 168), (24, 44, 78), depth)
    if t.lake_id[i] >= 0:
        return (70, 118, 150)
    if world.river_cells and i in world.river_cells:
        return (58, 108, 148)
    biome = world.biomes[i] if world.biomes else None
    base = _BIOME_RGB.get(biome, (150, 150, 120))
    rel = (h - t.sea_level) / max(1e-9, 1.0 - t.sea_level)
    shade = 0.8 + 0.35 * rel
    # slope-based hillshading, light from the northwest
    W = t.grid.W
    j = i - W - 1
    if j >= 0:
        dh = t.heights[j] - h
        shade += dh * 18.0
    shade = max(0.55, min(1.25, shade))
    return _shade(base, shade)


_BIOME_RGB = {
    "glacier": (228, 234, 238),
    "tundra": (176, 178, 156),
    "taiga": (108, 130, 100),
    "forest": (92, 128, 76),
    "rainforest": (60, 112, 64),
    "grassland": (150, 158, 100),
    "savanna": (176, 160, 88),
    "shrubland": (158, 146, 96),
    "desert": (204, 178, 122),
    "marsh": (110, 132, 92),
    "alpine": (150, 144, 136),
    "peak": (208, 206, 200),
}


def render_ansi(world, cols=100):
    """Render the world to a string of ANSI-colored half blocks."""
    t = world.terrain
    W, H = t.grid.W, t.grid.H
    cols = min(cols, W)
    step = W / cols
    rows = int(H / step / 2)
    out = []
    for ry in range(rows):
        line = []
        for cx in range(cols):
            x = int(cx * step)
            y_top = int(ry * 2 * step)
            y_bot = int((ry * 2 + 1) * step)
            y_top = min(y_top, H - 1)
            y_bot = min(y_bot, H - 1)
            fr, fg, fb = cell_color(world, y_top * W + x)
            br, bg, bb = cell_color(world, y_bot * W + x)
            line.append(f"\x1b[38;2;{fr};{fg};{fb}m\x1b[48;2;{br};{bg};{bb}m▀")
        line.append(_RESET)
        out.append("".join(line))
    return "\n".join(out)

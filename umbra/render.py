"""Drawing the lump.

The camera stays level with the sculpture -- always, on purpose.  Tip it even
slightly and the far side of the solid slides up behind the near side, the
letters smear, and the whole illusion goes.  Shadows are cast by light that
travels in straight lines from one direction, so the only honest view is a
level one.

Level viewing has a happy consequence.  The top and bottom of every box shrink
to a hairline, and the four upright sides project to plain rectangles standing
square on the screen.  No triangles, no clipping, no matrices: each face is a
run of vertical strips, and drawing the whole sculpture is a few hundred strip
fills against a depth buffer.  A lamp hangs off to the upper left -- a real
point of light, not a direction, so its falloff crawls across the flat front of
the letters instead of leaving them poster-flat.
"""

import math

BG = (7, 8, 13)

# Shade ramp: cold shadow, warm middle, hot highlight.
_RAMP = ((0.00, (20, 24, 40)),
         (0.30, (86, 60, 56)),
         (0.60, (198, 118, 62)),
         (0.85, (243, 186, 106)),
         (1.00, (255, 242, 214)))

_AMBIENT = 0.085

_LAMP_GAIN = 0.86
_FOG_FLOOR = 0.22

# Where one surface steps in front of another, the one behind loses light.
_EDGE_STEP = 0.9
_EDGE_DARK = 0.52

# A hairline of sky along every upward-facing edge.
_RIM = 44


def _ramp(t):
    if t <= 0.0:
        return _RAMP[0][1]
    if t >= 1.0:
        return _RAMP[-1][1]
    for i in range(len(_RAMP) - 1):
        t0, c0 = _RAMP[i]
        t1, c1 = _RAMP[i + 1]
        if t <= t1:
            f = (t - t0) / (t1 - t0)
            return (int(c0[0] + (c1[0] - c0[0]) * f + 0.5),
                    int(c0[1] + (c1[1] - c0[1]) * f + 0.5),
                    int(c0[2] + (c1[2] - c0[2]) * f + 0.5))
    return _RAMP[-1][1]


_SHADES = tuple(_ramp(i / 255.0) for i in range(256))


class View:
    """Where the sculpture sits on a grid of pixels."""

    __slots__ = ("solid", "w", "h", "scale", "cx", "cy", "cz", "reach", "lamp")

    def __init__(self, solid, w, h, scale=None):
        self.solid = solid
        self.w = w
        self.h = h
        self.cx = solid.nx / 2.0
        self.cy = solid.ny / 2.0
        self.cz = solid.nz / 2.0
        # Half the footprint diagonal: how wide the solid can ever look.
        self.reach = math.hypot(solid.nx, solid.ny) / 2.0
        if scale is None:
            scale = min((w - 2) / (2.0 * self.reach),
                        (h - 1) / float(solid.nz))
        self.scale = max(scale, 0.05)
        r = max(self.reach, solid.nz)
        # Lamp position in camera space: left, high, and well in front.
        self.lamp = (-1.45 * r, 1.30 * r, 2.60 * r)

    def zoomed(self, factor):
        return View(self.solid, self.w * factor, self.h * factor,
                    self.scale * factor)


def fit(solid, width, height, margin=1):
    """Size the picture to the window: as wide as it can be, no taller.

    The sculpture is always a good deal wider than it is high -- letters lie
    down, and turning one only makes it wider still -- so width sets the scale
    and the picture is then cropped down to the band it actually needs.
    """
    span = math.hypot(solid.nx, solid.ny)
    scale = min((width - 2 * margin) / span,
                (height - 2 * margin) / float(solid.nz))
    scale = max(scale, 0.05)
    tall = int(math.ceil(solid.nz * scale)) + 2 * margin
    tall += tall % 2
    return View(solid, width, min(height, tall), scale)


def frame(view, azimuth):
    """Rasterise one turn.  Returns w*h entries: an (r, g, b) or None."""
    s = view.solid
    w, h, sc = view.w, view.h, view.scale
    cx, cy, cz = view.cx, view.cy, view.cz
    lx0, ly0, lz0 = view.lamp

    ct, st = math.cos(azimuth), math.sin(azimuth)
    half_w = w / 2.0
    half_h = h / 2.0
    inv = 1.0 / sc
    depth_span = view.reach * 2.0 or 1.0

    # Vertical distance from the lamp to each screen row, squared.
    lamp_dy2 = []
    for i in range(h):
        d = ly0 - (half_h - i - 0.5) * inv
        lamp_dy2.append(d * d)

    zbuf = [-1e30] * (w * h)
    lit = [-1] * (w * h)

    # Which of the four upright faces point anywhere near the camera, and how
    # squarely they face right / face us.
    faces = []
    if ct > 1e-9:
        faces.append((1, 0, -st, ct))
    elif ct < -1e-9:
        faces.append((-1, 0, st, -ct))
    if st > 1e-9:
        faces.append((0, 1, ct, st))
    elif st < -1e-9:
        faces.append((0, -1, -ct, -st))

    for x0, x1, y0, y1, z0, z1 in s.boxes:
        v_top = half_h - (z1 - cz) * sc
        v_bot = half_h - (z0 - cz) * sc
        row_top = int(math.ceil(v_top - 0.5))
        row_bot = int(math.floor(v_bot - 0.5))
        if row_top < 0:
            row_top = 0
        if row_bot > h - 1:
            row_bot = h - 1
        if row_bot < row_top:
            continue
        ax0, ax1 = x0 - cx, x1 - cx
        ay0, ay1 = y0 - cy, y1 - cy

        for facing_x, facing_y, n_right, n_depth in faces:
            if facing_x:
                xf = ax1 if facing_x > 0 else ax0
                ua = (-xf * st + ay0 * ct) * sc + half_w
                ub = (-xf * st + ay1 * ct) * sc + half_w
                da = xf * ct + ay0 * st
                db = xf * ct + ay1 * st
            else:
                yf = ay1 if facing_y > 0 else ay0
                ua = (-ax0 * st + yf * ct) * sc + half_w
                ub = (-ax1 * st + yf * ct) * sc + half_w
                da = ax0 * ct + yf * st
                db = ax1 * ct + yf * st
            if ub < ua:
                ua, ub = ub, ua
                da, db = db, da

            j0 = int(math.ceil(ua - 0.5))
            j1 = int(math.floor(ub - 0.5))
            if j0 < 0:
                j0 = 0
            if j1 > w - 1:
                j1 = w - 1
            if j1 < j0:
                continue
            span = ub - ua
            grad = (db - da) / span if span > 1e-9 else 0.0

            for j in range(j0, j1 + 1):
                d = da + (j + 0.5 - ua) * grad
                idx = row_top * w + j
                # Lamp offsets that hold for the whole column.
                lu = lx0 - (j + 0.5 - half_w) * inv
                lw = lz0 - d
                axial = n_right * lu + n_depth * lw
                flat = lu * lu + lw * lw
                fog = _FOG_FLOOR + (1.0 - _FOG_FLOOR) * (d / depth_span + 0.5)
                if axial <= 0.0:
                    grey = int(_AMBIENT * fog * 255)
                    for i in range(row_top, row_bot + 1):
                        if d > zbuf[idx]:
                            zbuf[idx] = d
                            lit[idx] = grey
                        idx += w
                    continue
                k = axial * fog * _LAMP_GAIN
                ambient = _AMBIENT * fog
                for i in range(row_top, row_bot + 1):
                    if d > zbuf[idx]:
                        zbuf[idx] = d
                        t = ambient + k / math.sqrt(flat + lamp_dy2[i])
                        lit[idx] = 255 if t > 1.0 else int(t * 255)
                    idx += w

    return _finish(lit, zbuf, w, h)


def _finish(lit, zbuf, w, h):
    """Darken whatever sits behind a step in depth, then hand back colours."""
    shades = _SHADES
    out = [None] * (w * h)
    step = _EDGE_STEP
    for i in range(h):
        base = i * w
        for j in range(w):
            idx = base + j
            level = lit[idx]
            if level < 0:
                continue
            d = zbuf[idx]
            above = lit[idx - w] if i else -1
            if ((j and lit[idx - 1] >= 0 and zbuf[idx - 1] - d > step) or
                    (above >= 0 and zbuf[idx - w] - d > step)):
                level = int(level * _EDGE_DARK)
            elif above < 0:
                level = min(255, level + _RIM)
            out[idx] = shades[level]
    return out


def shaded(view, azimuth, samples=2):
    """A finished picture: supersampled, background filled in."""
    w, h = view.w, view.h
    if samples <= 1:
        return [BG if p is None else p for p in frame(view, azimuth)]
    big = view.zoomed(samples)
    src = frame(big, azimuth)
    bw = big.w
    n = samples * samples
    out = [BG] * (w * h)
    br, bg_, bb = BG
    for i in range(h):
        base = i * samples * bw
        row = i * w
        for j in range(w):
            r = g = b = 0
            off = base + j * samples
            for sy in range(samples):
                o = off + sy * bw
                for sx in range(samples):
                    p = src[o + sx]
                    if p is None:
                        r += br
                        g += bg_
                        b += bb
                    else:
                        r += p[0]
                        g += p[1]
                        b += p[2]
            out[row + j] = (r // n, g // n, b // n)
    return out


def silhouette(view, azimuth):
    """Which pixels the sculpture covers: the shadow it would throw."""
    return [p is not None for p in frame(view, azimuth)]

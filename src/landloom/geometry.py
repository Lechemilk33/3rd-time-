"""Vector geometry: contour extraction and curve smoothing.

Coastlines are traced with marching squares over the signed
land/sea field, then rounded with Chaikin corner-cutting — the blocky
grid disappears and the coast reads as drawn, not sampled.
"""

__all__ = ["marching_squares", "chaikin", "chaikin_open", "resample"]

import math


def marching_squares(width, height, field, level=0.0):
    """Extract closed contour loops of `field` (flat W*H list) at `level`.

    The field is padded with a virtual ring below `level`, so regions
    touching the border close along the map edge. Returns a list of
    loops, each a list of (x, y) in grid coordinates.
    """
    W2, H2 = width + 2, height + 2
    pad = [level - 1.0] * (W2 * H2)
    for y in range(height):
        row = (y + 1) * W2 + 1
        src = y * width
        pad[row:row + width] = field[src:src + width]

    def val(x, y):
        return pad[y * W2 + x]

    # segment table per cell: edges 0=top 1=right 2=bottom 3=left
    segs = {}
    for y in range(H2 - 1):
        for x in range(W2 - 1):
            tl = val(x, y) > level
            tr = val(x + 1, y) > level
            br = val(x + 1, y + 1) > level
            bl = val(x, y + 1) > level
            code = (tl << 3) | (tr << 2) | (br << 1) | bl
            if code in (0, 15):
                continue
            edges = _CASES[code]
            for (e1, e2) in edges:
                p1 = _edge_point(x, y, e1, val, level)
                p2 = _edge_point(x, y, e2, val, level)
                segs.setdefault(_key(p1), []).append((p1, p2))

    # stitch segments into loops
    loops = []
    used = set()
    for start_key, lst in segs.items():
        for p1, p2 in lst:
            sid = (p1, p2)
            if sid in used:
                continue
            used.add(sid)
            loop = [p1, p2]
            cur = p2
            guard = 0
            while _key(cur) != _key(loop[0]) and guard < 200000:
                guard += 1
                nxts = segs.get(_key(cur), [])
                found = False
                for q1, q2 in nxts:
                    if (q1, q2) in used:
                        continue
                    used.add((q1, q2))
                    loop.append(q2)
                    cur = q2
                    found = True
                    break
                if not found:
                    break
            if len(loop) >= 4:
                # shift out of padded coordinates
                loops.append([(px - 1.0, py - 1.0) for (px, py) in loop])
    return loops


def _key(p):
    return (round(p[0] * 64), round(p[1] * 64))


def _edge_point(x, y, edge, val, level):
    if edge == 0:
        a, b = val(x, y), val(x + 1, y)
        t = _t(a, b, level)
        return (x + t, float(y))
    if edge == 1:
        a, b = val(x + 1, y), val(x + 1, y + 1)
        t = _t(a, b, level)
        return (float(x + 1), y + t)
    if edge == 2:
        a, b = val(x, y + 1), val(x + 1, y + 1)
        t = _t(a, b, level)
        return (x + t, float(y + 1))
    a, b = val(x, y), val(x, y + 1)
    t = _t(a, b, level)
    return (float(x), y + t)


def _t(a, b, level):
    d = b - a
    if abs(d) < 1e-12:
        return 0.5
    t = (level - a) / d
    return min(1.0, max(0.0, t))


# for each corner code, connected edge pairs (in -> out order, land on left)
_CASES = {
    1: [(3, 2)], 2: [(2, 1)], 3: [(3, 1)], 4: [(1, 0)], 5: [(1, 0), (3, 2)],
    6: [(2, 0)], 7: [(3, 0)], 8: [(0, 3)], 9: [(0, 2)],
    10: [(0, 3), (2, 1)], 11: [(0, 1)], 12: [(1, 3)], 13: [(1, 2)],
    14: [(2, 3)],
}


def chaikin(points, iterations=2):
    """Corner-cutting smoothing for a closed loop."""
    pts = points
    for _ in range(iterations):
        out = []
        n = len(pts)
        for i in range(n):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % n]
            out.append((0.75 * x1 + 0.25 * x2, 0.75 * y1 + 0.25 * y2))
            out.append((0.25 * x1 + 0.75 * x2, 0.25 * y1 + 0.75 * y2))
        pts = out
    return pts


def chaikin_open(points, iterations=2):
    """Corner-cutting smoothing for an open polyline; endpoints pinned."""
    pts = points
    for _ in range(iterations):
        if len(pts) < 3:
            return pts
        out = [pts[0]]
        for i in range(len(pts) - 1):
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            out.append((0.75 * x1 + 0.25 * x2, 0.75 * y1 + 0.25 * y2))
            out.append((0.25 * x1 + 0.75 * x2, 0.25 * y1 + 0.75 * y2))
        out.append(pts[-1])
        pts = out
    return pts


def resample(points, spacing):
    """Evenly respace an open polyline (for dash-safe strokes)."""
    if len(points) < 2:
        return points
    out = [points[0]]
    carry = 0.0
    for i in range(len(points) - 1):
        x1, y1 = points[i]
        x2, y2 = points[i + 1]
        seg = math.hypot(x2 - x1, y2 - y1)
        if seg == 0:
            continue
        t = carry
        while t + spacing <= seg:
            t += spacing
            f = t / seg
            out.append((x1 + (x2 - x1) * f, y1 + (y2 - y1) * f))
        carry = (t + spacing - seg) - spacing if t + spacing > seg else 0.0
        carry = max(0.0, spacing - (seg - t))
    if out[-1] != points[-1]:
        out.append(points[-1])
    return out

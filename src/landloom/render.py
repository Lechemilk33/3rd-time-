"""The atlas map page: an antique-style cartographic rendering.

Layering follows real map craft: a soft raster underlay carries biome
washes, province tints and shaded relief; everything readable rides on
top as vectors — smoothed coasts with clipped waterlines, rivers that
thicken downstream with their gathered water, dashed roads, hand-drawn
style mountain and tree glyphs thinned by hashed jitter, and labels
placed by simulated annealing. All coordinates flow through one
transform, so the same world renders identically at any paper size.
"""

import math

from .geometry import chaikin, chaikin_open, marching_squares
from .labels import LabelItem, place_labels
from .noise import hash01
from .pdfout import PDF, measure

__all__ = ["MapRenderer", "PAPER_SIZES"]

PAPER_SIZES = {
    "letter": (792, 612),
    "a4": (842, 595),
    "poster": (1584, 1224),
}

PARCHMENT = (0.956, 0.930, 0.858)
PARCHMENT_DEEP = (0.918, 0.880, 0.780)
INK = (0.239, 0.204, 0.165)
WATER_INK = (0.298, 0.412, 0.510)
WATER_WASH = (0.760, 0.822, 0.842)
ROAD = (0.529, 0.353, 0.220)
BORDER = (0.478, 0.373, 0.463)

BIOME_TINT = {
    "glacier": (0.918, 0.934, 0.934),
    "tundra": (0.859, 0.845, 0.760),
    "taiga": (0.694, 0.760, 0.671),
    "forest": (0.671, 0.760, 0.612),
    "rainforest": (0.588, 0.722, 0.569),
    "grassland": (0.808, 0.831, 0.641),
    "savanna": (0.871, 0.822, 0.596),
    "shrubland": (0.831, 0.808, 0.647),
    "desert": (0.910, 0.847, 0.663),
    "marsh": (0.729, 0.788, 0.694),
    "alpine": (0.792, 0.776, 0.741),
    "peak": (0.875, 0.863, 0.833),
}

PROVINCE_TINTS = [
    (0.847, 0.702, 0.635), (0.663, 0.745, 0.788), (0.788, 0.733, 0.820),
    (0.722, 0.788, 0.663), (0.867, 0.792, 0.616), (0.694, 0.769, 0.741),
]

_K = 0.5522847  # bezier circle constant


class MapRenderer:
    def __init__(self, world, paper="letter", hex_miles=None):
        self.world = world
        self.pw, self.ph = PAPER_SIZES[paper]
        self.hex_miles = hex_miles
        t = world.terrain
        self.gw, self.gh = t.grid.W, t.grid.H
        margin = 26.0 * (self.pw / 792.0)
        self.mx0 = margin
        self.my0 = margin
        avail_w = self.pw - 2 * margin
        avail_h = self.ph - 2 * margin
        self.s = min(avail_w / self.gw, avail_h / self.gh)
        self.map_w = self.gw * self.s
        self.map_h = self.gh * self.s
        self.mx0 = (self.pw - self.map_w) / 2
        self.my0 = (self.ph - self.map_h) / 2
        # everything sized in points scales with the cell size, so a
        # poster sheet keeps the same visual proportions as letter
        self.k = self.s / 2.815
        self.rng = None  # set at render time from world streams

    # grid -> page (grid y grows downward, PDF y grows upward)
    def px(self, gx):
        return self.mx0 + (gx + 0.5) * self.s

    def py(self, gy):
        return self.my0 + self.map_h - (gy + 0.5) * self.s

    def pt(self, p):
        return (self.px(p[0]), self.py(p[1]))

    # ------------------------------------------------------------------
    def render(self, pdf, streams):
        self.rng = streams.fork("render")
        page = pdf.add_page(self.pw, self.ph)
        w = self.world

        self._raster_underlay(pdf, page)
        coast_loops = self._coast_loops()
        self._waterlines(page, coast_loops)
        self._coastline(page, coast_loops)
        self._lakes(page)
        self._rivers(page)
        self._province_borders(page)
        self._roads(page)
        self._sea_lanes(page)
        self._bridges(page)
        self._plan_furniture()
        labels = self._build_labels()
        obstacles = [(self.px(p.x), self.py(p.y), 5.0) for p in w.settlements]
        obstacles += self._furniture_obstacles()
        place_labels(labels, (self.mx0 + 3, self.my0 + 3,
                              self.mx0 + self.map_w - 3,
                              self.my0 + self.map_h - 3),
                     streams.fork("labels"), obstacles=obstacles)
        # glyphs yield to text: no symbol is drawn under a placed label
        suppress = [it.boxes()[it.chosen] for it in labels if not it.hidden]
        self._glyphs(page, suppress)
        self._settlements(page)
        if self.hex_miles:
            self._hex_overlay(page)
        self._draw_labels(page, labels)
        self._neatline(page)
        self._compass(page)
        self._scale_bar(page)
        self._cartouche(page)
        return page

    def _plan_furniture(self):
        order = self._corner_openness()
        # compass in the most open corner, cartouche in the next
        corner = order[0]
        pad = 40.0 * self.k
        self._compass_xy = (
            self.mx0 + (pad if "w" in corner else self.map_w - pad),
            self.my0 + (self.map_h - pad if "n" in corner else pad))

        w = self.world
        K = self.k
        title = _titlecase(w.phrase)
        sub = f"being a survey of the region called {w.endonym}"
        t_size = 15.0 * K
        while measure(title, "Times-Bold", t_size) > 210 * K and t_size > 9 * K:
            t_size -= 0.5
        tw = max(measure(title, "Times-Bold", t_size),
                 measure(sub, "Times-Italic", 7.5 * K)) + 30 * K
        th = 52.0 * K
        pad = 16.0 * K
        c2 = order[1] if len(order) > 1 else "ne"
        self._cart_rect = (
            self.mx0 + (pad if "w" in c2 else self.map_w - pad - tw),
            self.my0 + (self.map_h - pad - th if "n" in c2 else pad),
            tw, th, t_size, title, sub)

        miles = w.lore["miles_per_cell"] if w.lore else 2.0
        pts_per_mile = self.s / miles
        span = 100
        for cand in (25, 50, 100, 150, 200):
            if cand * pts_per_mile < self.map_w * 0.22:
                span = cand
        self._scale_span = span
        self._scale_rect = (self.mx0 + 14 * K, self.my0 + 12 * K,
                            span * pts_per_mile, 16.0 * K)

    def _furniture_obstacles(self):
        obs = []
        cx, cy = self._compass_xy
        obs.append((cx, cy, 24.0))
        x, y, tw, th, *_ = self._cart_rect
        for fx in (0.2, 0.5, 0.8):
            obs.append((x + tw * fx, y + th / 2, th * 0.75))
        x, y, bw, bh = self._scale_rect
        for fx in (0.1, 0.37, 0.63, 0.9):
            obs.append((x + bw * fx, y + bh / 2, bh * 1.6))
        return obs

    # ------------------------------------------------------------------
    def _raster_underlay(self, pdf, page):
        w = self.world
        t = w.terrain
        W, H = self.gw, self.gh
        R = 3 if self.pw > 1000 else 2  # denser underlay for poster sheets
        seed = 1234567

        # smoothed heights for shading
        hs = list(t.heights)
        for _ in range(2):
            nxt = list(hs)
            for y in range(1, H - 1):
                row = y * W
                for x in range(1, W - 1):
                    i = row + x
                    nxt[i] = (hs[i] * 0.36
                              + (hs[i - 1] + hs[i + 1] + hs[i - W]
                                 + hs[i + W]) * 0.16)
            hs = nxt

        sea = t.sea_level
        span = max(1e-9, 1.0 - sea)
        cell_rgb = [None] * (W * H)
        for i in range(W * H):
            if t.ocean[i]:
                depth = min(1.0, max(0.0, (sea - t.heights[i]) * 7.0))
                base = _mix(PARCHMENT, WATER_WASH, 0.42 + 0.30 * depth)
            else:
                tint = BIOME_TINT.get(w.biomes[i], PARCHMENT)
                base = _mix(PARCHMENT, tint, 0.62)
                prov = w.province[i] if w.province else -1
                if prov >= 0:
                    ptint = PROVINCE_TINTS[prov % len(PROVINCE_TINTS)]
                    base = _mix(base, ptint, 0.10)
                # shaded relief, light from the northwest
                gx = gy = 0.0
                x, y = i % W, i // W
                if 0 < x < W - 1:
                    gx = hs[i + 1] - hs[i - 1]
                if 0 < y < H - 1:
                    gy = hs[i + W] - hs[i - W]
                shade = 1.0 - (gx + gy) * 5.2
                rel = (t.heights[i] - sea) / span
                shade *= 1.0 - 0.10 * max(0.0, rel - 0.5)
                shade = min(1.18, max(0.72, shade))
                base = (base[0] * shade, base[1] * shade, base[2] * shade)
            cell_rgb[i] = base

        W2, H2 = W * R, H * R
        raw = bytearray(W2 * H2 * 3)
        pos = 0
        for sy in range(H2):
            fy = min(sy / R, H - 1.001)
            y0 = int(fy)
            ty = fy - y0
            y1 = min(y0 + 1, H - 1)
            row0 = y0 * W
            row1 = y1 * W
            for sx in range(W2):
                fx = min(sx / R, W - 1.001)
                x0 = int(fx)
                tx = fx - x0
                x1 = min(x0 + 1, W - 1)
                c00 = cell_rgb[row0 + x0]
                c10 = cell_rgb[row0 + x1]
                c01 = cell_rgb[row1 + x0]
                c11 = cell_rgb[row1 + x1]
                mott = 1.0 + (hash01(sx, sy, seed) - 0.5) * 0.05
                for ch in range(3):
                    top = c00[ch] + (c10[ch] - c00[ch]) * tx
                    bot = c01[ch] + (c11[ch] - c01[ch]) * tx
                    v = (top + (bot - top) * ty) * mott
                    raw[pos] = max(0, min(255, int(v * 255)))
                    pos += 1

        name = pdf.add_image(bytes(raw), W2, H2)
        page.image(name, self.mx0, self.my0, self.map_w, self.map_h)

    # ------------------------------------------------------------------
    def _coast_field(self):
        t = self.world.terrain
        sea = t.sea_level
        field = []
        for i in range(self.gw * self.gh):
            v = t.heights[i] - sea
            if not t.ocean[i]:
                v = max(v, 0.004)
            field.append(v)
        return field

    def _coast_loops(self):
        loops = marching_squares(self.gw, self.gh, self._coast_field(), 0.0)
        return [chaikin(lp, 2) for lp in loops if len(lp) >= 6]

    def _trace_loop(self, page, loop):
        pts = [self.pt(p) for p in loop]
        page.polyline(pts, closed=True)

    def _waterlines(self, page, coast_loops):
        if not coast_loops:
            return
        page.save()
        # clip to the sea: map rect minus all land loops (even-odd)
        page.rect(self.mx0, self.my0, self.map_w, self.map_h)
        for lp in coast_loops:
            self._trace_loop(page, lp)
        page.clip(even_odd=True)
        page.set_stroke(*WATER_INK)
        page.set_join(1)
        for width, a in ((2.4 * self.k, 0.16), (5.2 * self.k, 0.085),
                         (8.6 * self.k, 0.045)):
            page.alpha(a)
            page.set_width(width)
            for lp in coast_loops:
                self._trace_loop(page, lp)
                page.stroke()
        page.restore()

    def _coastline(self, page, coast_loops):
        page.set_stroke(*INK)
        page.set_width(0.75 * self.k)
        page.set_join(1)
        for lp in coast_loops:
            self._trace_loop(page, lp)
            page.stroke()

    # ------------------------------------------------------------------
    def _lakes(self, page):
        t = self.world.terrain
        n = self.gw * self.gh
        ids = sorted({t.lake_id[i] for i in range(n) if t.lake_id[i] >= 0})
        for lid in ids:
            field = [1.0 if t.lake_id[i] == lid else -1.0 for i in range(n)]
            loops = marching_squares(self.gw, self.gh, field, 0.0)
            for lp in loops:
                if len(lp) < 6:
                    continue
                sm = chaikin(lp, 3)
                pts = [self.pt(p) for p in sm]
                page.save()
                page.alpha(0.82)
                page.set_fill(*_mix(PARCHMENT, WATER_WASH, 0.75))
                page.polyline(pts, closed=True)
                page.fill()
                page.restore()
                page.set_stroke(*WATER_INK)
                page.set_width(0.55 * self.k)
                page.polyline(pts, closed=True)
                page.stroke()

    def _rivers(self, page):
        t = self.world.terrain
        page.set_stroke(*WATER_INK)
        page.set_cap(1)
        page.set_join(1)
        max_flux = max((max(seg["flux"]) for seg in self.world.rivers),
                       default=1.0)
        for seg in self.world.rivers:
            for raw_pts, fluxes in self._river_runs(seg):
                self._stroke_river(page, raw_pts, fluxes, max_flux)

    def _river_runs(self, seg):
        """Split a river at lakes: the channel vanishes under the water
        and re-emerges at the outflow instead of beelining across."""
        t = self.world.terrain
        W = self.gw
        runs = []
        cur_p, cur_f = [], []
        for k, (x, y) in enumerate(seg["points"]):
            f = seg["flux"][min(k, len(seg["flux"]) - 1)]
            in_lake = t.lake_id[y * W + x] >= 0
            if in_lake:
                if cur_p:
                    cur_p.append((x, y))  # reach one point into the lake
                    cur_f.append(f)
                    if len(cur_p) >= 2:
                        runs.append((cur_p, cur_f))
                    cur_p, cur_f = [], []
            else:
                cur_p.append((x, y))
                cur_f.append(f)
        if len(cur_p) >= 2:
            runs.append((cur_p, cur_f))
        return runs

    def _stroke_river(self, page, raw_pts, fluxes, max_flux):
        sm = chaikin_open(raw_pts, 2)
        # map smooth index back to flux index
        ratio = (len(raw_pts) - 1) / max(1, len(sm) - 1)
        pts = [self.pt(p) for p in sm]
        k = 0
        chunk = 6
        while k < len(pts) - 1:
            j = min(k + chunk, len(pts) - 1)
            f = fluxes[min(int(k * ratio), len(fluxes) - 1)]
            width = 0.35 + 1.5 * math.sqrt(f / max_flux)
            page.set_width(width * (self.s / 2.8))
            page.polyline(pts[k:j + 1])
            page.stroke()
            k = j

    # ------------------------------------------------------------------
    def _province_borders(self, page):
        w = self.world
        if not w.province:
            return
        t = w.terrain
        W, H = self.gw, self.gh
        segs = []
        for y in range(H):
            for x in range(W):
                i = y * W + x
                a = w.province[i]
                if a < 0 or t.ocean[i]:
                    continue
                if x + 1 < W:
                    j = i + 1
                    b = w.province[j]
                    if b >= 0 and b != a and not t.ocean[j]:
                        segs.append(((x + 0.5, y - 0.5), (x + 0.5, y + 0.5)))
                if y + 1 < H:
                    j = i + W
                    b = w.province[j]
                    if b >= 0 and b != a and not t.ocean[j]:
                        segs.append(((x - 0.5, y + 0.5), (x + 0.5, y + 0.5)))
        chains = _stitch(segs)
        page.save()
        page.alpha(0.6)
        page.set_stroke(*BORDER)
        page.set_width(0.85 * self.k)
        page.set_dash([2.6 * self.k, 1.9 * self.k])
        page.set_cap(1)
        for ch in chains:
            sm = chaikin_open(ch, 2)
            page.polyline([self.pt(p) for p in sm])
            page.stroke()
        page.restore()

    def _roads(self, page):
        page.save()
        page.set_stroke(*ROAD)
        page.set_width(0.8 * self.k)
        page.set_dash([2.8 * self.k, 1.8 * self.k])
        page.set_cap(1)
        page.set_join(1)
        for poly in self.world.roads:
            sm = chaikin_open(poly["points"], 2)
            page.polyline([self.pt(p) for p in sm])
            page.stroke()
        page.restore()

    def _sea_lanes(self, page):
        page.save()
        page.alpha(0.7)
        page.set_stroke(*WATER_INK)
        page.set_width(1.0 * self.k)
        page.set_dash([0.1, 3.2 * self.k])
        page.set_cap(1)
        for lane in self.world.sea_lanes:
            sm = chaikin_open(lane["points"], 3)
            page.polyline([self.pt(p) for p in sm])
            page.stroke()
        page.restore()

    def _bridges(self, page):
        page.set_stroke(*INK)
        page.set_cap(0)
        for (bx, by) in self.world.bridges:
            # find local road direction
            ang = self._road_dir_at(bx, by)
            ca, sa = math.cos(ang), math.sin(ang)
            cx, cy = self.px(bx), self.py(by)
            L = self.s * 0.9
            for off in (-1.1 * self.k, 1.1 * self.k):
                ox, oy = -sa * off, ca * off
                page.set_width(0.7 * self.k)
                page.move_to(cx - ca * L + ox, cy - sa * L + oy)
                page.line_to(cx + ca * L + ox, cy + sa * L + oy)
                page.stroke()

    def _road_dir_at(self, bx, by):
        for poly in self.world.roads:
            pts = poly["points"]
            for k, (x, y) in enumerate(pts):
                if x == bx and y == by:
                    k2 = min(k + 1, len(pts) - 1)
                    k1 = max(k - 1, 0)
                    dx = pts[k2][0] - pts[k1][0]
                    dy = pts[k2][1] - pts[k1][1]
                    return math.atan2(-dy, dx)
        return 0.0

    # ------------------------------------------------------------------
    def _glyphs(self, page, suppress=()):
        w = self.world
        t = w.terrain
        W, H = self.gw, self.gh
        sea = t.sea_level
        span = max(1e-9, 1.0 - sea)
        gseed = 424242
        items = []
        road_cells = w.road_cells or set()
        for y in range(H):
            for x in range(W):
                i = y * W + x
                if t.ocean[i] or t.lake_id[i] >= 0 or i in road_cells:
                    continue
                b = w.biomes[i]
                h01 = hash01(x, y, gseed)
                rel = (t.heights[i] - sea) / span
                if i in self.world.river_cells:
                    continue
                if b in ("peak", "alpine"):
                    dens = 0.42 if b == "peak" else 0.24
                    if h01 < dens:
                        items.append((y, "mtn", x, rel))
                elif b in ("forest", "rainforest") and h01 < 0.30:
                    items.append((y, "tree", x, rel))
                elif b == "taiga" and h01 < 0.30:
                    items.append((y, "pine", x, rel))
                elif b == "marsh" and h01 < 0.22:
                    items.append((y, "marsh", x, rel))
                elif b == "desert" and h01 < 0.07:
                    items.append((y, "dune", x, rel))
                elif b in ("grassland", "savanna", "shrubland") \
                        and 0.30 < rel < 0.55 and h01 < 0.07:
                    items.append((y, "hill", x, rel))
                elif b in ("grassland", "savanna", "shrubland",
                           "tundra") and h01 < 0.045:
                    items.append((y, "tuft", x, rel))
        items.sort(key=lambda it: (it[0], it[2]))
        pad = 1.5
        for (y, kind, x, rel) in items:
            jx = (hash01(x, y, 777) - 0.5) * 0.8
            jy = (hash01(x, y, 888) - 0.5) * 0.8
            cx, cy = self.px(x + jx), self.py(y + jy)
            covered = False
            for (bx0, by0, bx1, by1) in suppress:
                if bx0 - pad < cx < bx1 + pad and by0 - pad < cy < by1 + pad:
                    covered = True
                    break
            if covered:
                continue
            if kind == "mtn":
                self._glyph_mountain(page, cx, cy, self.s * (1.5 + rel * 1.6),
                                     hash01(x, y, 999))
            elif kind == "tree":
                self._glyph_tree(page, cx, cy, self.s * 0.95)
            elif kind == "pine":
                self._glyph_pine(page, cx, cy, self.s * 1.05)
            elif kind == "marsh":
                self._glyph_marsh(page, cx, cy, self.s)
            elif kind == "dune":
                self._glyph_dune(page, cx, cy, self.s)
            elif kind == "hill":
                self._glyph_hill(page, cx, cy, self.s * 1.1)
            elif kind == "tuft":
                self._glyph_tuft(page, cx, cy, self.s * 0.8)

    def _glyph_mountain(self, page, cx, cy, size, j):
        winjitter = (j - 0.5) * 0.4
        half = size * 0.55
        apex_x = cx + winjitter * size * 0.2
        apex_y = cy + size * 0.62
        page.set_fill(*_mix(PARCHMENT, (0.88, 0.87, 0.85), 0.5))
        page.move_to(cx - half, cy)
        page.line_to(apex_x, apex_y)
        page.line_to(cx + half, cy)
        page.close()
        page.fill()
        page.set_stroke(*INK)
        page.set_width(0.55)
        page.move_to(cx - half, cy)
        page.line_to(apex_x, apex_y)
        page.line_to(cx + half, cy)
        page.stroke()
        # shadow stroke down the right flank
        page.set_width(0.4)
        page.move_to(apex_x, apex_y)
        page.line_to(cx + half * 0.45, cy + size * 0.1)
        page.stroke()

    def _glyph_hill(self, page, cx, cy, size):
        page.set_stroke(*INK)
        page.set_width(0.45)
        h = size * 0.45
        page.move_to(cx - size * 0.6, cy)
        page.curve_to(cx - size * 0.25, cy + h, cx + size * 0.25, cy + h,
                      cx + size * 0.6, cy)
        page.stroke()

    def _glyph_tree(self, page, cx, cy, size):
        r = size * 0.5
        page.set_fill(*_mix(BIOME_TINT["forest"], (0.35, 0.48, 0.30), 0.55))
        _circle(page, cx, cy + r * 0.9, r)
        page.fill()
        page.set_stroke(*_mix(INK, (0.28, 0.40, 0.25), 0.5))
        page.set_width(0.4)
        _circle(page, cx, cy + r * 0.9, r)
        page.stroke()
        page.set_stroke(*INK)
        page.set_width(0.45)
        page.move_to(cx, cy)
        page.line_to(cx, cy + r * 0.5)
        page.stroke()

    def _glyph_pine(self, page, cx, cy, size):
        h = size * 1.1
        wd = size * 0.42
        page.set_fill(*_mix(BIOME_TINT["taiga"], (0.30, 0.42, 0.32), 0.6))
        page.move_to(cx - wd, cy)
        page.line_to(cx, cy + h)
        page.line_to(cx + wd, cy)
        page.close()
        page.fill()
        page.set_stroke(*INK)
        page.set_width(0.35)
        page.move_to(cx, cy)
        page.line_to(cx, cy - h * 0.18)
        page.stroke()

    def _glyph_tuft(self, page, cx, cy, size):
        page.save()
        page.alpha(0.55)
        page.set_stroke(*_mix(INK, BIOME_TINT["grassland"], 0.45))
        page.set_width(0.35)
        for (dx, ang) in ((-0.28, 1.9), (0.0, 1.57), (0.28, 1.25)):
            x = cx + dx * size
            page.move_to(x, cy)
            page.line_to(x + math.cos(ang) * size * 0.5,
                         cy + math.sin(ang) * size * 0.5)
            page.stroke()
        page.restore()

    def _glyph_marsh(self, page, cx, cy, size):
        page.set_stroke(*_mix(WATER_INK, BIOME_TINT["marsh"], 0.4))
        page.set_width(0.4)
        for (dx, dy, ln) in ((-0.5, 0, 0.9), (0.35, 0.28, 0.6),
                             (-0.1, -0.3, 0.6)):
            x = cx + dx * size
            y = cy + dy * size
            page.move_to(x - ln * size / 2, y)
            page.line_to(x + ln * size / 2, y)
            page.stroke()

    def _glyph_dune(self, page, cx, cy, size):
        page.set_fill(*_mix(INK, BIOME_TINT["desert"], 0.55))
        for (dx, dy) in ((-0.3, 0.1), (0.3, -0.15), (0.0, 0.3)):
            _circle(page, cx + dx * size, cy + dy * size, 0.22)
            page.fill()

    # ------------------------------------------------------------------
    def _settlements(self, page):
        seats = set(id(p) for p in self.world.seats)
        for p in sorted(self.world.settlements, key=lambda q: q.y):
            cx, cy = self.px(p.x), self.py(p.y)
            k = self.k
            if p.kind == "city":
                r = 3.2 * k
                page.set_fill(*PARCHMENT)
                _circle(page, cx, cy, r)
                page.fill()
                page.set_stroke(*INK)
                page.set_width(0.9 * k)
                _circle(page, cx, cy, r)
                page.stroke()
                page.set_fill(*INK)
                _circle(page, cx, cy, r * 0.45)
                page.fill()
            elif p.kind == "town":
                r = 2.2 * k
                page.set_fill(*INK)
                _circle(page, cx, cy, r)
                page.fill()
                page.set_stroke(*PARCHMENT)
                page.set_width(0.5 * k)
                _circle(page, cx, cy, r * 0.55)
                page.stroke()
            else:
                r = 1.5 * k
                page.set_fill(*PARCHMENT)
                _circle(page, cx, cy, r)
                page.fill()
                page.set_stroke(*INK)
                page.set_width(0.7 * k)
                _circle(page, cx, cy, r)
                page.stroke()
            if id(p) in seats:
                page.set_stroke(*INK)
                page.set_width(0.6 * k)
                page.move_to(cx, cy + r + 0.7 * k)
                page.line_to(cx, cy + r + 3.6 * k)
                page.stroke()
                page.set_fill(*_mix(INK, (0.6, 0.15, 0.1), 0.5))
                page.move_to(cx, cy + r + 3.6 * k)
                page.line_to(cx + 2.6 * k, cy + r + 2.8 * k)
                page.line_to(cx, cy + r + 2.0 * k)
                page.close()
                page.fill()

    # ------------------------------------------------------------------
    def _build_labels(self):
        w = self.world
        items = []
        K = self.k
        for p in w.settlements:
            size = {"city": 9.2, "town": 7.8, "village": 6.6}[p.kind] * K
            font = "Times-Bold" if p.kind == "city" else "Times-Roman"
            r = {"city": 4.6, "town": 3.6, "village": 3.0}[p.kind] * K
            cx, cy = self.px(p.x), self.py(p.y)
            gap = r + 2.0 * K
            cands = [
                (cx + gap, cy - size * 0.32, 0.0, "left"),
                (cx - gap, cy - size * 0.32, 0.0, "right"),
                (cx, cy + gap + size * 0.1, 0.0, "center"),
                (cx, cy - gap - size * 0.72, 0.0, "center"),
                (cx + gap * 0.8, cy + gap * 0.6, 0.0, "left"),
                (cx - gap * 0.8, cy + gap * 0.6, 0.0, "right"),
                (cx + gap * 0.8, cy - gap * 0.9, 0.0, "left"),
                (cx - gap * 0.8, cy - gap * 0.9, 0.0, "right"),
            ]
            items.append(LabelItem(
                p.name, font, size, cands, kind="settlement",
                priority={"city": 3.2, "town": 2.2, "village": 1.2}[p.kind],
                optional=(p.kind == "village")))

        for seg in w.rivers:
            if not seg.get("name"):
                continue
            sm = chaikin_open(seg["points"], 2)
            if len(sm) < 8:
                continue
            cands = []
            for tpos in (0.5, 0.35, 0.65, 0.22, 0.8):
                k = int(len(sm) * tpos)
                k = max(1, min(len(sm) - 2, k))
                x, y = self.pt(sm[k])
                x2, y2 = self.pt(sm[k + 1])
                ang = math.atan2(y2 - y, x2 - x)
                if ang > math.pi / 2:
                    ang -= math.pi
                if ang < -math.pi / 2:
                    ang += math.pi
                nx, ny = -math.sin(ang), math.cos(ang)
                for side in (4.2 * K, -4.2 * K):
                    cands.append((x + nx * side, y + ny * side, ang, "center"))
            items.append(LabelItem(seg["name"], "Times-Italic", 7.0 * K, cands,
                                   kind="river", color=WATER_INK,
                                   priority=1.6, optional=True))

        for f in (w.features or []):
            if not f.name:
                continue
            cx, cy = self.px(f.cx), self.py(f.cy)
            ang = -f.angle
            if ang > math.pi / 2:
                ang -= math.pi
            if ang < -math.pi / 2:
                ang += math.pi
            if f.kind == "sea":
                # clamp the anchor so the label body stays in frame
                tw2 = (measure(f.name, "Times-Italic", 13.5 * K)
                       + 2.2 * K * len(f.name)) / 2 + 10
                cx = min(max(cx, self.mx0 + tw2),
                         self.mx0 + self.map_w - tw2)
                cy = min(max(cy, self.my0 + 22), self.my0 + self.map_h - 22)
                cands = []
                anchors = getattr(f, "anchors", None) or [(f.cx, f.cy)]
                for (ax, ay) in anchors:
                    px, py = self.px(ax), self.py(ay)
                    for (dx, dy) in ((0, 0), (0, 18), (0, -18)):
                        cands.append(
                            (min(max(px + dx, self.mx0 + tw2),
                                 self.mx0 + self.map_w - tw2),
                             min(max(py + dy, self.my0 + 22),
                                 self.my0 + self.map_h - 22),
                             0.0, "center"))
                items.append(LabelItem(
                    f.name, "Times-Italic", 13.5 * K, cands,
                    kind="sea", color=_mix(WATER_INK, PARCHMENT, 0.25),
                    charspace=2.2 * K, priority=3.4))
            elif f.kind == "range":
                size = min(10.5, 7.6 + f.size / 700.0) * K
                items.append(LabelItem(
                    f.name.upper(), "Times-Roman", size,
                    [(cx, cy, ang, "center"),
                     (cx, cy + 10, ang, "center"),
                     (cx, cy - 10, ang, "center")],
                    kind="range", color=_mix(INK, PARCHMENT, 0.12),
                    charspace=1.6 * K, priority=2.4, optional=True))
            elif f.kind == "forest":
                items.append(LabelItem(
                    f.name, "Times-Italic", 7.6 * K,
                    [(cx, cy, ang * 0.5, "center"),
                     (cx, cy + 8, ang * 0.5, "center"),
                     (cx, cy - 8, ang * 0.5, "center")],
                    kind="forest", color=_mix(INK, (0.25, 0.4, 0.22), 0.5),
                    priority=1.6, optional=True))
            elif f.kind in ("marsh", "desert"):
                items.append(LabelItem(
                    f.name, "Times-Italic", 7.2 * K,
                    [(cx, cy, 0.0, "center"),
                     (cx, cy + 8, 0.0, "center")],
                    kind=f.kind, color=_mix(INK, PARCHMENT, 0.35),
                    priority=1.2, optional=True))
            elif f.kind == "lake":
                items.append(LabelItem(
                    f.name, "Times-Italic", 6.8 * K,
                    [(cx, cy, 0.0, "center"),
                     (cx, cy - 9, 0.0, "center"),
                     (cx, cy + 9, 0.0, "center")],
                    kind="lake", color=WATER_INK, priority=1.4,
                    optional=True))

        # province names fill the quiet interior
        if w.province and w.province_names:
            W, H = self.gw, self.gh
            sums = {}
            for i in range(0, W * H, 3):
                k = w.province[i]
                if k >= 0 and not w.terrain.ocean[i]:
                    sx, sy, cnt = sums.get(k, (0.0, 0.0, 0))
                    sums[k] = (sx + i % W, sy + i // W, cnt + 1)
            for k, name in w.province_names.items():
                if k not in sums or sums[k][2] < 60:
                    continue
                sx, sy, cnt = sums[k]
                cx, cy = self.px(sx / cnt), self.py(sy / cnt)
                items.append(LabelItem(
                    name.upper(), "Times-Roman", 7.6 * K,
                    [(cx, cy, 0.0, "center"),
                     (cx, cy + 12, 0.0, "center"),
                     (cx, cy - 12, 0.0, "center"),
                     (cx + 18, cy + 5, 0.0, "center"),
                     (cx - 18, cy - 5, 0.0, "center")],
                    kind="province", color=_mix(INK, PARCHMENT, 0.42),
                    charspace=1.8 * K, priority=1.0, optional=True))
        return items

    def _draw_labels(self, page, items):
        for it in items:
            if it.hidden:
                continue
            x, y, ang = it.draw_origin()
            if it.halo:
                page.save()
                page.alpha(0.66)
                page.set_fill(*PARCHMENT)
                d = max(0.5, it.size * 0.075)
                dd = d * 0.72
                for (dx, dy) in ((d, 0), (-d, 0), (0, d), (0, -d),
                                 (dd, dd), (-dd, dd), (dd, -dd), (-dd, -dd)):
                    page.text(x + dx, y + dy, it.text, font=it.font,
                              size=it.size, angle=ang, charspace=it.charspace)
                page.restore()
            page.set_fill(*it.color)
            page.text(x, y, it.text, font=it.font, size=it.size, angle=ang,
                      charspace=it.charspace)

    # ------------------------------------------------------------------
    def _neatline(self, page):
        k = self.k
        page.set_stroke(*INK)
        page.set_width(1.6 * k)
        page.rect(self.mx0 - 6 * k, self.my0 - 6 * k, self.map_w + 12 * k,
                  self.map_h + 12 * k)
        page.stroke()
        page.set_width(0.6 * k)
        page.rect(self.mx0 - 2.5 * k, self.my0 - 2.5 * k, self.map_w + 5 * k,
                  self.map_h + 5 * k)
        page.stroke()

    def _corner_openness(self):
        """Rank map corners by how empty they are (ocean = empty)."""
        t = self.world.terrain
        W, H = self.gw, self.gh
        cw, ch = W // 4, H // 4
        corners = {"nw": (0, 0), "ne": (W - cw, 0),
                   "sw": (0, H - ch), "se": (W - cw, H - ch)}
        scores = {}
        for key, (x0, y0) in corners.items():
            sea = 0
            tot = 0
            for y in range(y0, y0 + ch, 2):
                for x in range(x0, x0 + cw, 2):
                    tot += 1
                    if t.ocean[y * W + x]:
                        sea += 1
            scores[key] = sea / max(1, tot)
        return sorted(scores, key=scores.get, reverse=True)

    def _compass(self, page):
        x, y = self._compass_xy
        k = self.k
        r = 15.0 * k
        page.save()
        page.alpha(0.9)
        page.set_stroke(*INK)
        page.set_width(0.7 * k)
        _circle(page, x, y, r)
        page.stroke()
        _circle(page, x, y, r * 0.55)
        page.stroke()
        for step in range(8):
            ang = step * math.pi / 4
            ca, sa = math.cos(ang), math.sin(ang)
            L = r if step % 2 == 0 else r * 0.55
            if step == 2:  # north spike, drawn long below
                continue
            page.set_width((0.8 if step % 2 == 0 else 0.5) * self.k)
            page.move_to(x, y)
            page.line_to(x + ca * L, y + sa * L)
            page.stroke()
        # north spear
        page.set_fill(*INK)
        page.move_to(x - 2.2 * k, y)
        page.line_to(x, y + r * 1.45)
        page.line_to(x + 2.2 * k, y)
        page.close()
        page.fill()
        page.set_fill(*INK)
        nw = measure("N", "Times-Bold", 9 * k)
        page.text(x - nw / 2, y + r * 1.55, "N", font="Times-Bold",
                  size=9 * k)
        page.restore()

    def _scale_bar(self, page):
        miles = self.world.lore["miles_per_cell"] if self.world.lore else 2.0
        pts_per_mile = self.s / miles
        span = self._scale_span
        bar_w = span * pts_per_mile
        x, y = self._scale_rect[0], self._scale_rect[1]
        k = self.k
        page.save()
        page.alpha(0.85)
        page.set_fill(*PARCHMENT)
        page.rect(x - 6 * k, y - 5 * k, bar_w + 12 * k, 21 * k)
        page.fill()
        page.restore()
        page.set_stroke(*INK)
        page.set_width(0.7 * k)
        half = span // 2
        for (x0, x1, filled) in ((0, half, True), (half, span, False)):
            page.set_fill(*INK if filled else PARCHMENT)
            page.rect(x + x0 * pts_per_mile, y,
                      (x1 - x0) * pts_per_mile, 3.4 * k)
            page.fill()
            page.rect(x + x0 * pts_per_mile, y,
                      (x1 - x0) * pts_per_mile, 3.4 * k)
            page.stroke()
        page.set_fill(*INK)
        fs = 5.5 * k
        page.text(x - measure("0", "Helvetica", fs) / 2, y + 6.5 * k, "0",
                  font="Helvetica", size=fs)
        mid = str(half)
        page.text(x + bar_w / 2 - measure(mid, "Helvetica", fs) / 2,
                  y + 6.5 * k, mid, font="Helvetica", size=fs)
        lbl = f"{span} miles"
        page.text(x + bar_w - measure(str(span), "Helvetica", fs) / 2,
                  y + 6.5 * k, lbl, font="Helvetica", size=fs)

    def _cartouche(self, page):
        x, y, tw, th, t_size, title, sub = self._cart_rect
        k = self.k
        page.save()
        page.alpha(0.92)
        page.set_fill(*_mix(PARCHMENT, PARCHMENT_DEEP, 0.35))
        page.rect(x, y, tw, th)
        page.fill()
        page.restore()
        page.set_stroke(*INK)
        page.set_width(1.2 * k)
        page.rect(x, y, tw, th)
        page.stroke()
        page.set_width(0.5 * k)
        page.rect(x + 2.5 * k, y + 2.5 * k, tw - 5 * k, th - 5 * k)
        page.stroke()
        page.set_fill(*INK)
        cx = x + tw / 2
        page.text(cx - measure(title, "Times-Bold", t_size) / 2,
                  y + th - 22 * k, title, font="Times-Bold", size=t_size)
        page.text(cx - measure(sub, "Times-Italic", 7.5 * k) / 2, y + 10 * k,
                  sub, font="Times-Italic", size=7.5 * k)

    def _hex_overlay(self, page):
        miles = self.world.lore["miles_per_cell"] if self.world.lore else 2.0
        hex_r = (self.hex_miles / miles) * self.s / math.sqrt(3)
        if hex_r < 4:
            return
        page.save()
        page.rect(self.mx0, self.my0, self.map_w, self.map_h)
        page.clip()
        page.alpha(0.32)
        page.set_stroke(*INK)
        page.set_width(0.4)
        dy = hex_r * 1.5
        dx = hex_r * math.sqrt(3)
        row = 0
        y = self.my0
        while y < self.my0 + self.map_h + dy:
            x = self.mx0 + (dx / 2 if row % 2 else 0)
            while x < self.mx0 + self.map_w + dx:
                self._hex(page, x, y, hex_r)
                x += dx
            y += dy
            row += 1
        page.restore()

    def _hex(self, page, cx, cy, r):
        pts = []
        for k in range(6):
            a = math.pi / 6 + k * math.pi / 3
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        page.polyline(pts, closed=True)
        page.stroke()


def _mix(a, b, t):
    return (a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t)


def _circle(page, cx, cy, r):
    k = _K * r
    page.move_to(cx + r, cy)
    page.curve_to(cx + r, cy + k, cx + k, cy + r, cx, cy + r)
    page.curve_to(cx - k, cy + r, cx - r, cy + k, cx - r, cy)
    page.curve_to(cx - r, cy - k, cx - k, cy - r, cx, cy - r)
    page.curve_to(cx + k, cy - r, cx + r, cy - k, cx + r, cy)
    page.close()


def _stitch(segs):
    """Join short segments into chains by shared endpoints."""
    def key(p):
        return (round(p[0] * 4), round(p[1] * 4))

    adj = {}
    for a, b in segs:
        adj.setdefault(key(a), []).append((a, b))
        adj.setdefault(key(b), []).append((b, a))
    used = set()
    chains = []
    for a, b in segs:
        if (key(a), key(b)) in used or (key(b), key(a)) in used:
            continue
        used.add((key(a), key(b)))
        chain = [a, b]
        # extend forward
        cur = b
        while True:
            options = [e for e in adj.get(key(cur), [])
                       if (key(e[0]), key(e[1])) not in used
                       and (key(e[1]), key(e[0])) not in used]
            if not options:
                break
            _, nxt = options[0]
            used.add((key(cur), key(nxt)))
            chain.append(nxt)
            cur = nxt
        # extend backward
        cur = a
        while True:
            options = [e for e in adj.get(key(cur), [])
                       if (key(e[0]), key(e[1])) not in used
                       and (key(e[1]), key(e[0])) not in used]
            if not options:
                break
            _, nxt = options[0]
            used.add((key(cur), key(nxt)))
            chain.insert(0, nxt)
            cur = nxt
        chains.append(chain)
    return chains


def _titlecase(phrase):
    small = {"of", "the", "a", "an", "and", "in", "on", "at", "to"}
    words = phrase.strip().split()
    out = []
    for k, wd in enumerate(words):
        if k > 0 and wd.lower() in small:
            out.append(wd.lower())
        else:
            out.append(wd[:1].upper() + wd[1:])
    return " ".join(out)

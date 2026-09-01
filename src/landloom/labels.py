"""Cartographic label placement by simulated annealing.

Every label gets a slate of candidate positions (eight compass offsets
for a town, points along the course for a river, the principal axis for
a range). The placer then anneals the whole page at once, trading off
pairwise overlaps, covered symbols, out-of-frame spill, and each
label's preference order — the classic label-placement objective
(an NP-hard problem in general), solved the classic way.
"""

import math

from .pdfout import measure

__all__ = ["LabelItem", "place_labels"]


class LabelItem:
    def __init__(self, text, font, size, candidates, kind="generic",
                 color=(0.15, 0.13, 0.11), charspace=0.0, priority=1.0,
                 optional=False, halo=True):
        self.text = text
        self.font = font
        self.size = size
        self.kind = kind
        self.color = color
        self.charspace = charspace
        self.priority = priority
        self.optional = optional
        self.halo = halo
        # candidates: list of (x, y, angle, anchor); anchor in
        # {"center", "left", "right"} — x,y is the anchor point of the
        # baseline midpoint/left/right
        self.candidates = candidates
        self.chosen = 0
        self.hidden = False
        self._boxes = None

    def width(self):
        w = measure(self.text, self.font, self.size)
        if self.charspace:
            w += self.charspace * max(0, len(self.text) - 1)
        return w

    def boxes(self):
        """AABB per candidate, from the rotated text quad."""
        if self._boxes is not None:
            return self._boxes
        w = self.width()
        h = self.size * 1.0
        out = []
        for (x, y, ang, anchor) in self.candidates:
            if anchor == "center":
                x0 = -w / 2
            elif anchor == "right":
                x0 = -w
            else:
                x0 = 0.0
            corners = [(x0, -h * 0.25), (x0 + w, -h * 0.25),
                       (x0 + w, h * 0.78), (x0, h * 0.78)]
            ca, sa = math.cos(ang), math.sin(ang)
            xs, ys = [], []
            for (cx, cy) in corners:
                xs.append(x + cx * ca - cy * sa)
                ys.append(y + cx * sa + cy * ca)
            out.append((min(xs), min(ys), max(xs), max(ys)))
        self._boxes = out
        return out

    def draw_origin(self, idx=None):
        """Text-op origin (left end of baseline) for a candidate."""
        idx = self.chosen if idx is None else idx
        (x, y, ang, anchor) = self.candidates[idx]
        w = self.width()
        if anchor == "center":
            off = -w / 2
        elif anchor == "right":
            off = -w
        else:
            off = 0.0
        ca, sa = math.cos(ang), math.sin(ang)
        return (x + off * ca, y + off * sa, ang)


def _overlap(a, b):
    ox = min(a[2], b[2]) - max(a[0], b[0])
    oy = min(a[3], b[3]) - max(a[1], b[1])
    if ox <= 0 or oy <= 0:
        return 0.0
    return ox * oy


def place_labels(items, bounds, rng, obstacles=(), iterations=6000):
    """Anneal label positions. bounds = (x0, y0, x1, y1) page points."""
    if not items:
        return
    x0, y0, x1, y1 = bounds
    n = len(items)
    boxes = [it.boxes() for it in items]
    n_cands = [len(it.candidates) for it in items]

    HID = -1

    def box_energy(i, ci):
        if ci == HID:
            return 60.0 * items[i].priority
        b = boxes[i][ci]
        e = ci * 1.5  # prefer earlier candidates
        # spill outside the frame
        spill = (max(0.0, x0 - b[0]) + max(0.0, b[2] - x1)
                 + max(0.0, y0 - b[1]) + max(0.0, b[3] - y1))
        e += spill * 14.0
        for (ox, oy, orad) in obstacles:
            if b[0] - orad < ox < b[2] + orad and b[1] - orad < oy < b[3] + orad:
                e += 26.0 * items[i].priority
        return e

    def pair_energy(i, ci, j, cj):
        if ci == HID or cj == HID:
            return 0.0
        area = _overlap(boxes[i][ci], boxes[j][cj])
        if area <= 0.0:
            return 0.0
        return 4.0 * area * min(items[i].priority, items[j].priority)

    state = [0] * n
    for i, it in enumerate(items):
        it.chosen = 0
        it.hidden = False

    def item_energy(i, ci):
        e = box_energy(i, ci)
        for j in range(n):
            if j != i:
                e += pair_energy(i, ci, j, state[j])
        return e

    temp = 14.0
    cooling = 0.998
    for step in range(iterations):
        i = rng.randrange(n)
        options = n_cands[i] + (1 if items[i].optional else 0)
        pick = rng.randrange(options)
        new_ci = HID if pick == n_cands[i] else pick
        if new_ci == state[i]:
            continue
        d = item_energy(i, new_ci) - item_energy(i, state[i])
        if d < 0 or rng.random() < math.exp(-d / max(temp, 0.01)):
            state[i] = new_ci
        temp *= cooling

    # final greedy sweep: take the best candidate for each in turn
    for i in range(n):
        best, best_e = state[i], item_energy(i, state[i])
        for ci in list(range(n_cands[i])) + ([HID] if items[i].optional else []):
            e = item_energy(i, ci)
            if e < best_e - 1e-9:
                best, best_e = ci, e
        state[i] = best

    for i, it in enumerate(items):
        if state[i] == HID:
            it.hidden = True
            it.chosen = 0
        else:
            it.hidden = False
            it.chosen = state[i]

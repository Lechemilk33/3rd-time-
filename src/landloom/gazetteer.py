"""The gazetteer: typeset reference pages that follow the map.

A two-column layout engine (cursor, wrap, flow) set in the same antique
style: who lives where and in what numbers, what they trade, what
roads and rumors connect them, where the rivers rise, and how the
world's own language builds its names.
"""

import math

from .pdfout import measure
from .render import INK, PARCHMENT, PARCHMENT_DEEP, WATER_INK, _mix, _titlecase

__all__ = ["render_gazetteer"]

PAGE_W, PAGE_H = 612, 792
MARGIN = 54
COL_GAP = 22
HEADER_H = 20


def _wrap(text, font, size, width):
    words = text.split()
    lines = []
    cur = ""
    for w in words:
        cand = w if not cur else cur + " " + w
        if measure(cand, font, size) <= width or not cur:
            cur = cand
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


class _Flow:
    """Two-column page flow with a shared antique frame."""

    def __init__(self, pdf, title):
        self.pdf = pdf
        self.title = title
        self.pageno = 0
        self.col_w = (PAGE_W - 2 * MARGIN - COL_GAP) / 2
        self.page = None
        self.col = 0
        self.y = 0.0
        self._new_page()

    def _new_page(self):
        self.pageno += 1
        self.page = self.pdf.add_page(PAGE_W, PAGE_H)
        p = self.page
        p.set_fill(*PARCHMENT)
        p.rect(0, 0, PAGE_W, PAGE_H)
        p.fill()
        p.set_stroke(*INK)
        p.set_width(1.3)
        p.rect(MARGIN - 18, MARGIN - 26, PAGE_W - 2 * MARGIN + 36,
               PAGE_H - 2 * MARGIN + 44)
        p.stroke()
        p.set_width(0.5)
        p.rect(MARGIN - 14.5, MARGIN - 22.5, PAGE_W - 2 * MARGIN + 29,
               PAGE_H - 2 * MARGIN + 37)
        p.stroke()
        hdr = f"{self.title} · Gazetteer"
        p.set_fill(*_mix(INK, PARCHMENT, 0.25))
        p.text(PAGE_W / 2 - measure(hdr, "Times-Italic", 8.5) / 2,
               PAGE_H - MARGIN + 6, hdr, font="Times-Italic", size=8.5)
        pg = f"— {self.pageno + 1} —"
        p.text(PAGE_W / 2 - measure(pg, "Times-Roman", 8) / 2,
               MARGIN - 16, pg, font="Times-Roman", size=8)
        self.col = 0
        self.top = PAGE_H - MARGIN - HEADER_H
        self.y = self.top

    def col_x(self):
        return MARGIN + self.col * (self.col_w + COL_GAP)

    def _advance_col(self):
        if self.col == 0:
            self.col = 1
            self.y = self.top
        else:
            self._new_page()

    def need(self, height):
        if self.y - height < MARGIN + 6:
            self._advance_col()

    def spacer(self, h):
        self.y -= h

    def line(self, text, font, size, leading=None, color=INK, indent=0.0):
        leading = leading or size * 1.24
        width = self.col_w - indent
        for ln in _wrap(text, font, size, width):
            self.need(leading)
            self.page.set_fill(*color)
            self.page.text(self.col_x() + indent, self.y - size * 0.8,
                           ln, font=font, size=size)
            self.y -= leading

    def entry_height(self, parts):
        h = 0.0
        for (text, font, size, leading, indent) in parts:
            leading = leading or size * 1.24
            h += leading * len(_wrap(text, font, size, self.col_w - indent))
        return h

    def heading(self, text, size=12.5):
        self.need(size * 2.6)
        x = self.col_x()
        self.page.set_fill(*INK)
        self.page.text(x, self.y - size * 0.8, text,
                       font="Times-Bold", size=size)
        self.page.set_stroke(*_mix(INK, PARCHMENT, 0.4))
        self.page.set_width(0.6)
        self.page.move_to(x, self.y - size * 1.15)
        self.page.line_to(x + self.col_w, self.y - size * 1.15)
        self.page.stroke()
        self.y -= size * 1.9


def _feature_line(world, f):
    kinds = {"range": "A mountain range", "forest": "A forest",
             "marsh": "Fenland", "desert": "A dry waste",
             "lake": "A lake", "sea": "The open sea"}
    base = kinds.get(f.kind, "A region")
    best, bestd = None, 1e9
    for p in world.settlements:
        d = math.hypot(p.x - f.cx, p.y - f.cy)
        if d < bestd:
            bestd, best = d, p
    if best and f.kind != "sea":
        ang = math.degrees(math.atan2(f.cy - best.y, f.cx - best.x)) % 360
        dirs = ["east", "southeast", "south", "southwest", "west",
                "northwest", "north", "northeast"]
        b = dirs[int((ang + 22.5) // 45) % 8]
        miles = int(bestd * world.lore["miles_per_cell"])
        if miles >= 8:
            return f"{base}, some {miles} miles {b} of {best.name}."
        return f"{base}, hard by {best.name}."
    return base + "."


def render_gazetteer(pdf, world):
    title = _titlecase(world.phrase)
    flow = _Flow(pdf, title)
    p = flow.page

    # --- title block across both columns on the first page ------------
    t_size = 21.0
    while measure(title, "Times-Bold", t_size) > PAGE_W - 2 * MARGIN:
        t_size -= 0.5
    p.set_fill(*INK)
    p.text(PAGE_W / 2 - measure(title, "Times-Bold", t_size) / 2,
           flow.y - 6, title, font="Times-Bold", size=t_size)
    sub = f"A Gazetteer of {world.endonym}"
    p.set_fill(*_mix(INK, PARCHMENT, 0.2))
    p.text(PAGE_W / 2 - measure(sub, "Times-Italic", 10.5) / 2,
           flow.y - 24, sub, font="Times-Italic", size=10.5)
    flow.y -= 46
    intro_w = PAGE_W - 2 * MARGIN
    p.set_fill(*INK)
    yy = flow.y
    for ln in _wrap(world.lore["intro"], "Times-Roman", 9.5, intro_w):
        p.text(MARGIN, yy - 8, ln, font="Times-Roman", size=9.5)
        yy -= 12.2
    flow.y = yy - 10
    flow.top = flow.y  # both columns on page one start under the intro

    # --- factions -----------------------------------------------------
    flow.heading("Powers & Fellowships")
    for fac in world.lore["factions"]:
        flow.line(f"{fac['name']} — {fac['kind']}.", "Times-Roman", 9)
    flow.spacer(8)

    # --- settlements --------------------------------------------------
    flow.heading("Cities, Towns & Villages")
    ranked = sorted(world.settlements, key=lambda q: -q.lore["population"])
    for s in ranked:
        parts = [(s.name, "Times-Bold", 10, None, 0.0),
                 (s.lore["text"], "Times-Roman", 8.6, 11.0, 0.0),
                 (f"({s.etymology})", "Times-Italic", 7.3, 9.5, 0.0)]
        flow.need(min(flow.entry_height(parts) + 6,
                      (PAGE_H - 2 * MARGIN) * 0.5))
        name_w = measure(s.name, "Times-Bold", 10)
        flow.page.set_fill(*INK)
        flow.page.text(flow.col_x(), flow.y - 8, s.name,
                       font="Times-Bold", size=10)
        kind_tag = f"  ·  {s.kind}"
        flow.page.set_fill(*_mix(INK, PARCHMENT, 0.35))
        flow.page.text(flow.col_x() + name_w, flow.y - 8, kind_tag,
                       font="Times-Italic", size=8)
        flow.y -= 12.5
        body = s.lore["text"]
        if body.startswith(s.name):
            body = body[len(s.name):].lstrip(" —")
        body = body[:1].upper() + body[1:]
        flow.line(body, "Times-Roman", 8.6, leading=11.0)
        flow.line(f"({s.etymology})", "Times-Italic", 7.3, leading=9.5,
                  color=_mix(INK, PARCHMENT, 0.3))
        flow.spacer(7)

    # --- rivers -------------------------------------------------------
    named_rivers = [s for s in world.rivers if s.get("name")]
    if named_rivers:
        flow.spacer(4)
        flow.heading("Rivers & Waters")
        for seg in named_rivers:
            flow.need(34)
            flow.page.set_fill(*_mix(WATER_INK, INK, 0.4))
            flow.page.text(flow.col_x(), flow.y - 8, seg["name"],
                           font="Times-Bold", size=9.2)
            flow.y -= 11.5
            flow.line(seg.get("lore", ""), "Times-Roman", 8.4, leading=10.8)
            flow.line(f"({seg['etymology']})", "Times-Italic", 7.3,
                      leading=9.5, color=_mix(INK, PARCHMENT, 0.3))
            flow.spacer(6)

    # --- features -----------------------------------------------------
    named_feats = [f for f in (world.features or []) if f.name]
    if named_feats:
        flow.spacer(4)
        flow.heading("The Wild Country")
        for f in named_feats:
            flow.need(30)
            flow.page.set_fill(*INK)
            flow.page.text(flow.col_x(), flow.y - 8, f.name,
                           font="Times-Bold", size=9.2)
            flow.y -= 11.5
            flow.line(_feature_line(world, f), "Times-Roman", 8.4,
                      leading=10.8)
            if f.etymology:
                flow.line(f"({f.etymology})", "Times-Italic", 7.3,
                          leading=9.5, color=_mix(INK, PARCHMENT, 0.3))
            flow.spacer(5)

    # --- the language -------------------------------------------------
    flow.spacer(4)
    flow.heading(f"Of the {world.language.name} Tongue")
    flow.line("The names on this map are not random letters: the land's "
              "own language builds them from roots, and the same root "
              "recurs wherever the land repeats itself. Among its words:",
              "Times-Roman", 8.6, leading=11.0)
    flow.spacer(3)
    show = ["water", "old", "stone", "salt", "cold", "wolf", "home", "dark"]
    for g in show:
        root = world.language.roots.get(g)
        if root:
            flow.line(f"{root} — “{g}”", "Times-Roman", 8.4, indent=10)
    flow.spacer(3)
    forms, gloss = world.language.suffixes["town"]
    flow.line(f"A settlement often ends in -{' or -'.join(forms)} "
              f"(“{gloss}”).", "Times-Roman", 8.6, leading=11.0)
    flow.line(f"The region calls itself {world.endonym}: "
              f"{world.endonym_etymology}.", "Times-Roman", 8.6,
              leading=11.0)

    # --- colophon -----------------------------------------------------
    flow.spacer(14)
    flow.line("Every part of this survey — coasts, rivers, roads, names, "
              "and rumors — was woven from a single seed phrase. The same "
              "phrase always weaves the same world; share it, and another "
              "hand can hold this exact map.", "Times-Italic", 8.2,
              leading=10.6, color=_mix(INK, PARCHMENT, 0.2))
    flow.line(f"The phrase of this world is “{world.phrase.strip()}”.",
              "Times-Bold", 8.4, leading=11,
              color=_mix(INK, PARCHMENT, 0.1))
    return flow.pageno

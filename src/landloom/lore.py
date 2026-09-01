"""Gazetteer prose: populations, trades, factions, rumors.

Every sentence is assembled from world facts, not free-floating flavor:
distances are measured on the map, goods follow from the biome, rumors
name real places reachable by real roads. A game master can follow any
thread on the page and find the terrain agrees with it.
"""

import math

__all__ = ["build_lore"]

_SIZE_WORDS = {"city": ["walled city", "old city", "harbor city", "high city"],
               "town": ["market town", "river town", "hill town",
                        "trading town", "garrison town"],
               "village": ["village", "hamlet", "fishing village",
                           "farming village", "way-station"]}

_FACTION_FORMS = [
    ("the Guild of {}", "merchant guild"),
    ("the Order of the {}", "knightly order"),
    ("the {} Compact", "league of towns"),
    ("House {}", "old noble line"),
    ("the {} Circle", "quiet fellowship of scholars"),
    ("the Wardens of {}", "rangers of the old roads"),
]

_FACTION_GLOSS = ["raven", "star", "iron", "silver", "storm", "moon",
                  "king", "salt", "fire", "wolf"]


def _bearing(x1, y1, x2, y2):
    ang = math.degrees(math.atan2(y2 - y1, x2 - x1)) % 360
    dirs = ["east", "southeast", "south", "southwest", "west",
            "northwest", "north", "northeast"]
    return dirs[int((ang + 22.5) // 45) % 8]


def _goods_for(world, p):
    t = world.terrain
    b = world.biomes[p.i]
    goods = []
    if p.harbor:
        goods += ["fish", "salt"]
    if b in ("forest", "taiga", "rainforest"):
        goods += ["timber", "furs"]
    if b in ("grassland", "savanna"):
        goods += ["grain", "wool", "horses"]
    if b == "marsh":
        goods += ["peat", "eels"]
    if b == "desert":
        goods += ["glasswork", "hides"]
    rel = (t.heights[p.i] - t.sea_level) / max(1e-9, 1.0 - t.sea_level)
    if rel > 0.3:
        goods += ["stone", "iron"]
    if world.climate.temperature[p.i] > 0.6:
        goods += ["wine", "oil"]
    if world.climate.temperature[p.i] < 0.3:
        goods += ["furs", "tallow"]
    if p.on_river:
        goods += ["river trade"]
    return goods or ["subsistence crops"]


_HOOKS = [
    "Barges out of {other} have stopped arriving, and {faction} is paying "
    "well to learn why.",
    "Something has been taking sheep on the {bearing} road to {other}; the "
    "shepherds say it walks upright.",
    "A courier from {other} was found at the {days}-mile stone with empty "
    "saddlebags and a full purse.",
    "{faction} is quietly buying every map of {feature} it can find.",
    "The ferrymen refuse to work {river} after dark, and none will say what "
    "they saw.",
    "An old shaft above town broke into galleries no one dug, and the "
    "miners' wages have tripled.",
    "Pilgrims bound for {other} have begun arriving with the same dream, "
    "told in the same words.",
    "The toll-keeper on the {other} road has not been seen in a fortnight; "
    "the tolls are still being collected.",
    "A ship out of {other} came in crewed by half the men who set out, and "
    "the survivors will not speak of {sea}.",
    "Wolves came down from {feature} a season early this year; the hunters "
    "say something moved them.",
    "{faction} has posted a bounty on any traveler's account of the ruins "
    "in {feature}.",
    "The bell in the old tower rang by itself on midwinter night, once for "
    "each year since the founding.",
]


def _fill_hook(rng, world, p, template):
    others = [q for q in world.settlements if q is not p and q.name]
    others.sort(key=lambda q: math.hypot(q.x - p.x, q.y - p.y))
    other = rng.choice(others[:5]) if others else None
    named_feats = [f for f in world.features
                   if f.name and f.kind in ("range", "forest", "desert", "marsh")]
    feature = rng.choice(named_feats) if named_feats else None
    named_rivers = [s for s in world.rivers if s.get("name")]
    river = rng.choice(named_rivers) if named_rivers else None
    sea = next((f for f in world.features if f.kind == "sea" and f.name), None)
    fac = rng.choice(world.lore["factions"]) if world.lore["factions"] else None

    txt = template
    if "{other}" in txt:
        if not other:
            return None
        txt = txt.replace("{other}", other.name)
    if "{bearing}" in txt:
        txt = txt.replace("{bearing}", _bearing(p.x, p.y, other.x, other.y)
                          if other else "old")
    if "{faction}" in txt:
        if not fac:
            return None
        txt = txt.replace("{faction}", fac["name"])
    if "{feature}" in txt:
        if not feature:
            return None
        txt = txt.replace("{feature}", feature.name)
    if "{river}" in txt:
        if not river:
            return None
        txt = txt.replace("{river}", river["name"])
    if "{sea}" in txt:
        if not sea:
            return None
        txt = txt.replace("{sea}", sea.name)
    if "{days}" in txt:
        txt = txt.replace("{days}", str(rng.randint(3, 19)))
    return txt[:1].upper() + txt[1:]


def _settlement_text(rng, world, p):
    pop = p.lore["population"]
    size_word = rng.choice(_SIZE_WORDS[p.kind])
    where = []
    if p.harbor:
        sea = next((f for f in world.features if f.kind == "sea" and f.name),
                   None)
        if sea:
            where.append(rng.choice([
                f"on the shore of {sea.name}",
                f"where the land meets {sea.name}",
                f"with a harbor giving onto {sea.name}",
                "behind a sheltered anchorage"]))
        else:
            where.append("on the coast")
    elif p.on_river:
        river = _nearest_river(world, p)
        if river:
            where.append(rng.choice([
                f"on {river['name']}",
                f"astride {river['name']}",
                f"at a crossing of {river['name']}"]))
        else:
            where.append("on the river")
    elif p.on_lake:
        where.append("on the lakeshore")
    prov = world.province_names.get(p.province)
    seat = any(s is p for s in world.seats)
    ident = f"{p.name} — {size_word} of some {pop:,} souls"
    if where:
        ident += ", " + where[0]
    if prov:
        ident += f"; seat of {prov}" if seat else f", in {prov}"
    ident += "."

    goods = p.lore["goods"]
    trade = f"Its trade is {goods[0]}" if len(goods) == 1 else \
        f"Its trade runs to {', '.join(goods[:-1])} and {goods[-1]}"
    trade += "."

    hook = None
    for _ in range(8):
        hook = _fill_hook(rng, world, p, rng.choice(_HOOKS))
        if hook:
            break
    parts = [ident, trade]
    if hook:
        parts.append(hook)
    return " ".join(parts)


def _nearest_river(world, p):
    best, bestd = None, 9.0
    for seg in world.rivers:
        if not seg.get("name"):
            continue
        for (x, y) in seg["points"][::3]:
            d = math.hypot(x - p.x, y - p.y)
            if d < bestd:
                bestd, best = d, seg
    return best


def _river_lore(world, seg, miles_per_cell):
    pts = seg["points"]
    length = sum(math.hypot(pts[k + 1][0] - pts[k][0],
                            pts[k + 1][1] - pts[k][1])
                 for k in range(len(pts) - 1)) * miles_per_cell
    W = world.grid.W
    sx, sy = pts[0]
    src_biome = world.biomes[sy * W + sx]
    src = {"peak": "under the high peaks", "alpine": "on the high fells",
           "glacier": "from the ice", "tundra": "on the cold moors",
           "forest": "deep in the woods", "taiga": "in the black pines",
           "rainforest": "under the green canopy",
           "marsh": "out of the fens"}.get(src_biome, "in the hills")
    mouth = None
    ex, ey = pts[-1]
    end = ey * W + ex
    if world.terrain.ocean[end]:
        mouth = "the sea"
    elif world.terrain.lake_id[end] >= 0:
        mouth = "the lake country"
    dest = f" and runs {int(round(length))} miles to {mouth}" if mouth \
        else f"; its waters run {int(round(length))} miles"
    return f"Rises {src}{dest}."


def build_lore(streams, world):
    rng = streams.fork("lore")
    miles = rng.uniform(1.6, 2.6)
    world.lore = {"miles_per_cell": miles, "factions": []}

    n_fac = rng.randint(2, 4)
    forms = list(_FACTION_FORMS)
    rng.shuffle(forms)
    glosses = list(_FACTION_GLOSS)
    rng.shuffle(glosses)
    from .naming import _ENGLISH
    for k in range(n_fac):
        form, kind = forms[k]
        g = glosses[k % len(glosses)]
        name = form.format(_ENGLISH.get(g, g.title()))
        world.lore["factions"].append({"name": name, "kind": kind})

    ranked = sorted(world.settlements, key=lambda p: -p.score)
    n = max(1, len(ranked))
    for idx, p in enumerate(ranked):
        pctl = 1.0 - idx / n
        lo, hi = {"city": (8000, 36000), "town": (1500, 7500),
                  "village": (140, 1400)}[p.kind]
        pop = int(lo + (hi - lo) * (0.35 + 0.65 * pctl) * rng.uniform(0.7, 1.0))
        p.lore = {"population": pop // 10 * 10, "goods": []}
        goods = _goods_for(world, p)
        rng.shuffle(goods)
        seen = []
        for g in goods:
            if g not in seen:
                seen.append(g)
        p.lore["goods"] = seen[:3]
    for p in ranked:
        p.lore["text"] = _settlement_text(rng, world, p)

    for seg in world.rivers:
        if seg.get("name"):
            seg["lore"] = _river_lore(world, seg, miles)

    world_line = {
        "continent": "a lone continent in open water",
        "coast": "a long coast at the edge of a greater landmass",
        "isles": "a scatter of islands and drowned hills",
        "highlands": "a high inland country far from any sea",
    }[world.terrain.archetype]
    wind = {(1, 0): "west", (1, 1): "northwest", (0, 1): "north",
            (-1, 1): "northeast", (-1, 0): "east", (-1, -1): "southeast",
            (0, -1): "south", (1, -1): "southwest"}[world.climate.wind]
    cold = "north" if world.climate.north_cold else "south"
    world.lore["intro"] = (
        f"{world.endonym} is {world_line}. The prevailing winds blow out of "
        f"the {wind}, and the {cold} of the region runs cold. "
        f"Its folk name their land in the {world.language.name} tongue"
        f" — {world.endonym_etymology.split(',')[0]}.")
    return world

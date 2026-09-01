"""Binding language to landscape: every name has a reason.

A settlement on a cold coast draws its name from roots for ice and
harbors; the river that rises under the peaks is the Coldwater — or its
equivalent in the world's own tongue, with the etymology recorded. Some
worlds lean on the invented language, others on common-tongue compounds
(the way Tolkien let "Rivendell" sit beside "Imladris"); the mix itself
is a property of the world.
"""

import math

from .features import detect_features
from .language import build_language, capitalize, join_morphemes

__all__ = ["name_world"]

_ENGLISH = {
    "water": "Water", "river": "River", "lake": "Lake", "sea": "Sea",
    "bay": "Bay", "marsh": "Marsh", "hill": "Hill", "mountain": "Mount",
    "peak": "Peak", "valley": "Dale", "forest": "Wold", "wood": "Wood",
    "field": "Field", "stone": "Stone", "sand": "Sand", "salt": "Salt",
    "ice": "Ice", "snow": "Snow", "ash": "Ash", "iron": "Iron",
    "gold": "Gold", "wolf": "Wolf", "bear": "Bear", "eagle": "Eagle",
    "raven": "Raven", "king": "King", "god": "God", "old": "Old",
    "new": "New", "black": "Black", "white": "White", "red": "Red",
    "grey": "Grey", "green": "Green", "high": "High", "deep": "Deep",
    "cold": "Cold", "bright": "Bright", "dark": "Dark", "wind": "Wind",
    "storm": "Storm", "sun": "Sun", "moon": "Moon", "star": "Star",
    "fire": "Fire", "home": "Ham", "gate": "Gate", "bridge": "Bridge",
    "ford": "Ford", "harbor": "Haven", "market": "Chep", "tower": "Tor",
    "fort": "Burg", "temple": "Minster", "well": "Well", "land": "Land",
    "folk": "Folk", "far": "Far", "still": "Still", "swift": "Swift",
    "long": "Long", "broken": "Broken", "hidden": "Hidden",
    "silver": "Silver",
}

_TOWN_SUFFIX = ["wick", "stead", "field", "gate", "market", "cross",
                "watch", "hollow", "dale", "moor", "combe", "barrow",
                "worth", "thorpe", "by", "ton"]
_PORT_SUFFIX = ["haven", "harbor", "port", "strand", "quay", "mouth"]
_RIVER_TOWN_SUFFIX = ["ford", "bridge", "mill", "banks", "wade"]
_LAKE_TOWN_SUFFIX = ["mere", "shore", "stair"]
_HILL_TOWN_SUFFIX = ["fell", "crag", "tor", "cliff", "howe"]
_RIVER_SUFFIX = ["water", "beck", "burn", "run", "flow", "rush"]
_RANGE_WORDS = ["Fells", "Peaks", "Crags", "Tors", "Teeth", "Horns",
                "Heights", "Reach"]
_FOREST_FORMS = ["{}wood", "{}holt", "the {} Weald", "the {}wood",
                 "{} Forest"]
_MARSH_FORMS = ["the {} Fens", "the {} Mire", "{}marsh", "the {} Flats"]
_DESERT_FORMS = ["the {} Waste", "the {} Sands", "the {} Expanse"]
_SEA_FORMS = ["the {} Sea", "the Sea of {}", "the {} Deep", "the {} Main"]
_PROVINCE_FORMS = ["{} March", "the {}mark", "{} Vale", "the {} Reach",
                   "{}shire", "the {} Lands"]


class _Namer:
    def __init__(self, rng, lang):
        self.rng = rng
        self.lang = lang
        self.used = set()
        self.common_ratio = rng.uniform(0.25, 0.55)

    def claim(self, name):
        # normalize so near-twins ("Difbush"/"Difbushe") collide too
        key = name.lower().rstrip("e")
        for art in ("the ", "river ", "lake "):
            if key.startswith(art):
                key = key[len(art):]
        if key in self.used:
            return False
        self.used.add(key)
        return True

    def endonym(self, glosses, suffix_slot=None):
        parts = [self.lang.roots[g] for g in glosses]
        if suffix_slot:
            forms, slot_gloss = self.lang.suffixes[suffix_slot]
            parts.append(self.rng.choice(forms))
        word = join_morphemes(self.lang, parts, self.rng)
        ety = " + ".join(glosses + ([slot_gloss] if suffix_slot else []))
        return capitalize(word), f"{ety}, in the {self.lang.name} tongue"

    def common(self, gloss, suffix):
        stem = _ENGLISH[gloss]
        name = stem + suffix if not suffix.startswith(" ") else stem + suffix
        return name, f"common tongue: {gloss} + {suffix.strip()}"

    def pick(self, seq):
        return self.rng.choice(seq)


def _settlement_glosses(world, p):
    """Candidate name roots justified by what is actually there."""
    t = world.terrain
    i = p.i
    b = world.biomes[i]
    tt = world.climate.temperature[i]
    out = []
    if p.harbor:
        out += ["salt", "sea", "harbor", "bay"]
    if p.on_river:
        out += ["ford", "bridge", "river", "swift"]
    if p.on_lake:
        out += ["lake", "still", "deep"]
    if b in ("forest", "taiga", "rainforest"):
        out += ["wood", "wolf", "bear", "raven"]
    if b in ("grassland", "savanna"):
        out += ["field", "sun", "eagle"]
    if b == "desert":
        out += ["sand", "sun", "well"]
    if b == "marsh":
        out += ["marsh", "still"]
    if tt < 0.3:
        out += ["cold", "ice", "snow", "winter" if "winter" in _ENGLISH else "cold"]
    rel = (t.heights[i] - t.sea_level) / max(1e-9, 1.0 - t.sea_level)
    if rel > 0.35:
        out += ["high", "stone", "hill"]
    out += ["old", "new", "king", "home", "market", "bright", "star",
            "moon", "gold", "grey", "green", "white", "black"]
    return out


def _settlement_suffixes(p, kind_rank):
    if p.harbor:
        return _PORT_SUFFIX
    if p.on_river:
        return _RIVER_TOWN_SUFFIX + _TOWN_SUFFIX[:6]
    if p.on_lake:
        return _LAKE_TOWN_SUFFIX + _TOWN_SUFFIX[:6]
    return _TOWN_SUFFIX + (_HILL_TOWN_SUFFIX if kind_rank < 2 else [])


def _name_settlement(nm, world, p):
    glosses = _settlement_glosses(world, p)
    rank = {"city": 0, "town": 1, "village": 2}[p.kind]
    for _ in range(24):
        g = nm.pick(glosses)
        if nm.rng.random() < nm.common_ratio and g in _ENGLISH:
            suffix = nm.pick(_settlement_suffixes(p, rank))
            name, ety = nm.common(g, suffix)
        else:
            slot = "fort" if (rank < 2 and nm.rng.random() < 0.35) else "town"
            name, ety = nm.endonym([g], slot)
            if len(name) > 11:
                continue
        if nm.claim(name):
            p.name, p.etymology = name, ety
            return
    # deterministic fallback: qualify with Old/New
    base = p.name or "Newstead"
    for prefix in ("New ", "Old ", "Little ", "High "):
        cand = prefix + (base if p.name else "Stead")
        if nm.claim(cand):
            p.name, p.etymology = cand, "common tongue"
            return
    p.name, p.etymology = f"Stead {p.i}", "unnamed"


def _river_glosses(world, seg):
    t = world.terrain
    W = t.grid.W
    x0, y0 = seg["points"][0]
    src = y0 * W + x0
    out = []
    b = world.biomes[src]
    if b in ("peak", "alpine", "glacier", "tundra"):
        out += ["cold", "ice", "white", "stone"]
    if b in ("forest", "taiga", "rainforest"):
        out += ["dark", "wolf", "green"]
    drop = t.heights[src] - t.sea_level
    if drop > 0.45:
        out += ["swift", "bright"]
    if len(seg["points"]) > 45:
        out += ["long", "old"]
    out += ["silver", "black", "deep", "still", "grey", "raven", "eagle",
            "moon", "swift"]
    return out


def _name_river(nm, world, seg):
    glosses = _river_glosses(world, seg)
    for _ in range(24):
        g = nm.pick(glosses)
        if nm.rng.random() < nm.common_ratio and g in _ENGLISH:
            base = _ENGLISH[g] + nm.pick(_RIVER_SUFFIX)
            ety = f"common tongue: {g} + water"
            name = "the " + base
        else:
            base, ety = nm.endonym([g], "water")
            if len(base) > 10:
                continue
            name = "the " + base if nm.rng.random() < 0.5 else "River " + base
        # claim the bare word too, so "River Cruj" blocks "the Cruj"
        if base.lower() not in nm.used and nm.claim(name):
            nm.used.add(base.lower())
            seg["name"], seg["etymology"] = name, ety
            return
    seg["name"], seg["etymology"] = None, None


_FEATURE_GLOSSES = {
    "range": ["white", "grey", "iron", "storm", "wolf", "raven", "broken",
              "hidden", "far", "high", "cold", "ash", "god", "king",
              "silver", "star"],
    "forest": ["wolf", "bear", "raven", "dark", "green", "old", "hidden",
               "moon", "god", "deep", "still"],
    "marsh": ["still", "grey", "black", "salt", "hidden", "old"],
    "desert": ["sun", "ash", "red", "bright", "broken", "far", "old"],
    "lake": ["still", "deep", "silver", "bright", "moon", "star", "cold",
             "black", "old"],
    "sea": ["salt", "grey", "storm", "deep", "broken", "far", "sun",
            "white", "old", "king"],
}


def _name_feature(nm, f):
    glosses = _FEATURE_GLOSSES[f.kind]
    for _ in range(24):
        g = nm.pick(glosses)
        use_common = nm.rng.random() < nm.common_ratio + 0.2 and g in _ENGLISH
        if f.kind == "range":
            if use_common:
                name = f"the {_ENGLISH[g]} {nm.pick(_RANGE_WORDS)}"
                ety = f"common tongue: {g}"
            else:
                base, ety = nm.endonym([g], "mount")
                name = f"the {base}" if len(base) <= 10 else None
        elif f.kind == "forest":
            if use_common:
                name = nm.pick(_FOREST_FORMS).format(_ENGLISH[g])
                ety = f"common tongue: {g}"
            else:
                base, ety = nm.endonym([g], "wood")
                name = f"the {base}" if len(base) <= 10 else None
        elif f.kind == "marsh":
            name = nm.pick(_MARSH_FORMS).format(_ENGLISH[g])
            ety = f"common tongue: {g}"
        elif f.kind == "desert":
            name = nm.pick(_DESERT_FORMS).format(_ENGLISH[g])
            ety = f"common tongue: {g}"
        elif f.kind == "lake":
            if use_common:
                name = f"{_ENGLISH[g]}mere" if nm.rng.random() < 0.5 \
                    else f"Lake {_ENGLISH[g].rstrip('e')}water"
                ety = f"common tongue: {g} + lake"
            else:
                base, ety = nm.endonym([g])
                name = f"Lake {base}" if 3 <= len(base) <= 9 else None
        else:  # sea
            if use_common:
                name = nm.pick(_SEA_FORMS).format(_ENGLISH[g])
                ety = f"common tongue: {g}"
            else:
                base, _e = nm.endonym([g])
                name = nm.pick(_SEA_FORMS).format(base) \
                    if 3 <= len(base) <= 9 else None
                ety = _e
        if name and nm.claim(name):
            f.name, f.etymology = name, ety
            return
    f.name = None


def _name_provinces(nm, world):
    names = {}
    for k, seat in enumerate(world.seats):
        stem = seat.name or "March"
        stem_clean = stem.replace("the ", "").split()[0]
        for _ in range(12):
            form = nm.pick(_PROVINCE_FORMS)
            # a province named for its seat, clipped to the stem
            base = stem_clean
            clip = ("ford", "bridge", "haven", "port", "mouth", "wick",
                    "stead", "ton", "by", "quay", "strand", "mill", "gate",
                    "market", "cross", "field", "stair", "mere", "shore")
            for suf in clip:
                if base.endswith(suf) and len(base) - len(suf) >= 3:
                    base = base[:len(base) - len(suf)]
                    break
            cand = form.format(base)
            if nm.claim(cand):
                names[k] = cand
                break
        else:
            names[k] = f"{stem_clean} March"
    return names


def name_world(streams, world):
    lang = build_language(streams.fork("language"))
    world.language = lang
    nm = _Namer(streams.fork("naming"), lang)

    features = detect_features(world)
    world.features = features

    # the region's own name for itself
    rgn_gloss = nm.pick(["old", "green", "bright", "far", "high", "gold",
                         "storm", "star", "king"])
    endonym, endo_ety = nm.endonym([rgn_gloss], "region")
    nm.claim(endonym)
    world.endonym = endonym
    world.endonym_etymology = endo_ety

    for p in sorted(world.settlements, key=lambda p: p.score, reverse=True):
        _name_settlement(nm, world, p)

    # name the majors: rivers ranked by mouth flux, short streams skipped
    ranked = sorted(world.rivers, key=lambda s: -max(s["flux"]))
    named = 0
    for seg in ranked:
        if named < 10 and len(seg["points"]) >= 16:
            _name_river(nm, world, seg)
            if seg.get("name"):
                named += 1
        else:
            seg["name"] = seg["etymology"] = None

    for f in features:
        if f.kind in ("range", "forest", "lake", "sea") or \
                (f.kind in ("marsh", "desert") and f.size > 120):
            _name_feature(nm, f)
        else:
            f.name = None

    world.province_names = _name_provinces(nm, world)
    return world

"""Invented naming languages.

Each world gets its own tongue: a consonant/vowel inventory drawn with
cross-linguistic frequency weights, a syllable grammar with legal onset
clusters and codas, an orthographic style, and a lexicon of roots for a
gloss list of landscape concepts. Place names are *compounds* of those
roots, joined with simple sandhi repairs — so every name on the map has
an etymology, and the same root for "salt" or "old" recurs across the
map wherever the land shares the feature. Nothing here is a lookup
table of pre-written names; the language is built, then spoken.
"""

__all__ = ["Language", "build_language", "GLOSSES"]

# (romanization, cross-linguistic frequency weight)
_CONSONANTS = [
    ("t", 10), ("k", 10), ("n", 10), ("m", 9), ("s", 9), ("r", 8), ("l", 8),
    ("d", 7), ("b", 6), ("g", 6), ("p", 6), ("h", 6), ("v", 5), ("f", 5),
    ("w", 4), ("y", 4), ("th", 3), ("sh", 3), ("z", 3), ("ch", 2),
    ("kh", 2), ("gr", 0), ("j", 2), ("ng", 2),
]

_VOWEL_SYSTEMS = [
    (["a", "e", "i", "o", "u"], 10),
    (["a", "i", "u"], 4),
    (["a", "e", "i", "o"], 4),
    (["a", "e", "i", "o", "u", "ae"], 3),
    (["a", "e", "i", "o", "u", "y"], 2),
]

_ONSET_CLUSTERS = [("s", "t"), ("s", "k"), ("s", "p"), ("s", "l"), ("s", "n"),
                   ("t", "r"), ("d", "r"), ("k", "r"), ("g", "r"), ("b", "r"),
                   ("p", "r"), ("f", "r"), ("t", "w"), ("d", "w"), ("k", "l"),
                   ("g", "l"), ("p", "l"), ("f", "l"), ("b", "l")]

_CODAS = ["n", "m", "r", "l", "s", "t", "k", "th", "sh", "nd", "rn", "st",
          "ld", "rm", "ng", "f", "d"]

GLOSSES = [
    "water", "river", "lake", "sea", "bay", "marsh", "hill", "mountain",
    "peak", "valley", "forest", "wood", "field", "stone", "sand", "salt",
    "ice", "snow", "ash", "iron", "gold", "wolf", "bear", "eagle", "raven",
    "king", "god", "old", "new", "black", "white", "red", "grey", "green",
    "high", "deep", "cold", "bright", "dark", "wind", "storm", "sun",
    "moon", "star", "fire", "home", "gate", "bridge", "ford", "harbor",
    "market", "tower", "fort", "temple", "well", "land", "folk", "far",
    "still", "swift", "long", "broken", "hidden", "silver",
]

# suffix slots: what a name can end in, by feature category
_SUFFIX_SLOTS = ["town", "fort", "water", "mount", "region", "wood"]


class Language:
    def __init__(self):
        self.consonants = []
        self.vowels = []
        self.onsets = []
        self.codas = []
        self.templates = []
        self.roots = {}          # gloss -> romanized root
        self.suffixes = {}       # slot -> (form, gloss)
        self.style = {}
        self.name = None         # what the language calls itself

    def describe(self):
        return {"name": self.name,
                "vowels": self.vowels,
                "consonants": self.consonants,
                "sample_roots": {g: self.roots[g] for g in
                                 ("water", "old", "stone", "wolf")}}


def _weighted_sample(rng, pool, k):
    chosen = []
    pool = list(pool)
    while pool and len(chosen) < k:
        total = sum(w for _, w in pool)
        r = rng.random() * total
        acc = 0.0
        for idx, (item, w) in enumerate(pool):
            acc += w
            if r <= acc:
                chosen.append(item)
                pool.pop(idx)
                break
    return chosen


def build_language(rng):
    lang = Language()
    n_cons = rng.randint(9, 14)
    lang.consonants = _weighted_sample(
        rng, [(c, w) for c, w in _CONSONANTS if w > 0], n_cons)
    systems = [s for s, _ in _VOWEL_SYSTEMS]
    weights = [w for _, w in _VOWEL_SYSTEMS]
    lang.vowels = list(rng.choices(systems, weights=weights)[0])

    cons_set = set(lang.consonants)
    lang.onsets = [a + b for a, b in _ONSET_CLUSTERS
                   if a in cons_set and b in cons_set
                   and rng.random() < 0.45]
    lang.codas = [c for c in _CODAS
                  if (len(c) == 1 and c in cons_set) or len(c) > 1]
    rng.shuffle(lang.codas)
    lang.codas = lang.codas[:rng.randint(4, 9)]

    # syllable templates, weighted: how often each shape occurs
    lang.templates = [("CV", 10), ("CVC", rng.randint(3, 10)),
                      ("V", rng.randint(1, 4)), ("VC", rng.randint(1, 4))]
    if lang.onsets:
        lang.templates.append(("XVC", rng.randint(2, 6)))  # cluster onset
        lang.templates.append(("XV", rng.randint(2, 5)))

    lang.style = {
        "double_vowel": rng.random() < 0.25,   # occasional long vowels
        "hard_c": rng.random() < 0.5,          # k vs c romanization
        "final_e": rng.random() < 0.3,
    }

    used = set()
    for gloss in GLOSSES:
        for _ in range(60):
            syls = 1 if rng.random() < 0.55 else 2
            w = _word(rng, lang, syls)
            if 2 <= len(w) <= 8 and w not in used:
                used.add(w)
                lang.roots[gloss] = w
                break
        else:
            lang.roots[gloss] = _word(rng, lang, 2)

    # several forms per suffix slot, like -ton/-by/-ham in English
    slot_gloss = {"town": "stead", "fort": "hold", "water": "water",
                  "mount": "horn", "region": "land", "wood": "grove"}
    for slot in _SUFFIX_SLOTS:
        forms = []
        want_forms = rng.randint(2, 4)
        for _ in range(80):
            w = _word(rng, lang, 1)
            if 2 <= len(w) <= 4 and w not in used:
                used.add(w)
                forms.append(w)
                if len(forms) >= want_forms:
                    break
        if not forms:
            forms = [_word(rng, lang, 1)]
        lang.suffixes[slot] = (forms, slot_gloss[slot])

    lang.name = capitalize(join_morphemes(
        lang, [lang.roots["folk"]], None)) + rng.choice(["ic", "ish", "i", "ese", "ari"])
    return lang


def _word(rng, lang, syllables):
    parts = []
    for s in range(syllables):
        shapes = [t for t, _ in lang.templates]
        weights = [w for _, w in lang.templates]
        shape = rng.choices(shapes, weights=weights)[0]
        syl = ""
        for ch in shape:
            if ch == "C":
                syl += rng.choice(lang.consonants)
            elif ch == "X":
                syl += rng.choice(lang.onsets)
            elif ch == "V":
                v = rng.choice(lang.vowels)
                if lang.style["double_vowel"] and rng.random() < 0.08 and len(v) == 1:
                    v = v + v
                syl += v
        parts.append(syl)
    word = "".join(parts)
    word = _orthography(lang, word)
    # reject clunkers: reduplicated halves ("trutrug"), mirrored
    # single syllables ("gog"), all-vowel mush
    half = len(word) // 2
    if half >= 2 and word[:half] == word[half:]:
        return _word(rng, lang, syllables)
    if len(word) == 3 and word[0] == word[2] and word[1] in _VOWELCHARS:
        return _word(rng, lang, syllables)
    return word


def _orthography(lang, word):
    if lang.style["hard_c"]:
        word = word.replace("k", "c").replace("ch", "ch")
    # collapse triples and awkward doubles
    out = []
    for ch in word:
        if len(out) >= 2 and out[-1] == ch and out[-2] == ch:
            continue
        out.append(ch)
    word = "".join(out)
    for bad, good in (("hh", "h"), ("yy", "y"), ("ww", "w"), ("aei", "ae"),
                      ("iy", "y"), ("uw", "u"), ("thh", "th")):
        word = word.replace(bad, good)
    return word


_VOWELCHARS = set("aeiouy")


def join_morphemes(lang, morphemes, rng):
    """Compound morphemes with sandhi repairs at the boundaries."""
    word = morphemes[0]
    for nxt in morphemes[1:]:
        # compress long compounds the way real languages do: clip the
        # first element back to its opening consonant(s) + vowel
        if len(word) + len(nxt) > 9:
            clipped = word
            while len(clipped) > 3 and clipped[-1] not in _VOWELCHARS:
                clipped = clipped[:-1]
            if len(clipped) + len(nxt) > 10 and len(clipped) > 4:
                clipped = clipped[:4]
                while clipped and clipped[-1] not in _VOWELCHARS \
                        and len(clipped) > 2:
                    clipped = clipped[:-1]
            word = clipped
        a, b = word[-1], nxt[0]
        if a == b:
            word = word + nxt[1:]
        elif a in _VOWELCHARS and b in _VOWELCHARS:
            word = word + nxt[1:] if len(nxt) > 1 else word + nxt
        elif a not in _VOWELCHARS and b not in _VOWELCHARS:
            # illegal-looking cluster: keep it only if it reads like a
            # legal onset, otherwise insert a linking vowel
            pair = a + b
            if pair not in lang.onsets and pair not in ("st", "nd", "ld",
                                                        "rn", "rm", "nt",
                                                        "lt", "ns", "rs"):
                link = "e" if "e" in lang.vowels else lang.vowels[0]
                word = word + link + nxt
            else:
                word = word + nxt
        else:
            word = word + nxt
    word = _orthography(lang, word)
    if lang.style["final_e"] and rng is not None and rng.random() < 0.18 \
            and word[-1] not in _VOWELCHARS and len(word) <= 8:
        word += "e"
    return word


def capitalize(word):
    return word[:1].upper() + word[1:]

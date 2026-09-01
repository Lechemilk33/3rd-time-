"""Landloom command-line interface."""

import argparse
import json
import re
import sys
import time

from . import __version__


def _slug(phrase):
    s = re.sub(r"[^a-z0-9]+", "-", phrase.strip().lower()).strip("-")
    return s or "world"


def _random_phrase():
    import random
    a = ["salt", "ember", "winter", "harrow", "gloam", "thorn", "amber",
         "cinder", "fen", "iron", "sorrow", "bright", "hollow", "raven",
         "gale", "moss", "tide", "flint", "heather", "rust"]
    b = ["reach", "vale", "march", "shore", "fell", "weald", "deep",
         "gate", "moor", "strand", "hold", "run", "barrow", "mere",
         "spur", "wake", "field", "crown", "watch", "cross"]
    r = random.SystemRandom()
    return f"{r.choice(a)} {r.choice(b)} {r.randrange(10, 99)}"


def build_parser():
    p = argparse.ArgumentParser(
        prog="landloom",
        description="Weave a complete fantasy region — terrain, rivers, "
                    "towns, roads, names, and a printable PDF atlas — from "
                    "a seed phrase. The same phrase always weaves the same "
                    "world.",
        epilog="examples:\n"
               "  landloom \"The Salt Reaches\"\n"
               "  landloom \"emberfall\" --paper a4 --shape isles\n"
               "  landloom --preview \"quiet harbor\"\n"
               "  landloom  (no phrase: weaves a world from a random one)",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("phrase", nargs="?", default=None,
                   help="seed phrase for the world (quoted). Omit for a "
                        "random phrase.")
    p.add_argument("-o", "--output", metavar="FILE",
                   help="output PDF path (default: derived from the phrase)")
    p.add_argument("--paper", choices=["letter", "a4", "poster"],
                   default="letter", help="page size of the map sheet")
    p.add_argument("--shape",
                   choices=["continent", "coast", "isles", "highlands"],
                   help="force a landform (default: the phrase decides)")
    p.add_argument("--quality", choices=["fast", "standard", "fine"],
                   default="standard",
                   help="erosion simulation depth (fine is slower)")
    p.add_argument("--hex", type=float, metavar="MILES", dest="hex_miles",
                   help="overlay a hex grid, MILES miles across each hex")
    p.add_argument("--preview", action="store_true",
                   help="print the map to the terminal instead of "
                        "writing a PDF")
    p.add_argument("--json", metavar="FILE", dest="json_path",
                   help="also write the world's data as JSON")
    p.add_argument("--no-gazetteer", action="store_true",
                   help="write the map sheet only")
    p.add_argument("--quiet", action="store_true",
                   help="print nothing but errors")
    p.add_argument("--version", action="version",
                   version=f"landloom {__version__}")
    return p


def world_as_dict(w):
    return {
        "phrase": w.canonical_phrase,
        "endonym": w.endonym,
        "language": w.language.name,
        "archetype": w.terrain.archetype,
        "land_fraction": round(w.terrain.land_fraction, 3),
        "miles_per_cell": round(w.lore["miles_per_cell"], 2),
        "settlements": [dict(p.as_dict(), population=p.lore["population"],
                             etymology=p.etymology, notes=p.lore["text"])
                        for p in w.settlements],
        "rivers": [{"name": s["name"], "etymology": s.get("etymology"),
                    "points": s["points"]}
                   for s in w.rivers if s.get("name")],
        "features": [dict(f.as_dict(), etymology=f.etymology)
                     for f in w.features if f.name],
        "provinces": w.province_names,
        "factions": w.lore["factions"],
    }


def main(argv=None):
    args = build_parser().parse_args(argv)
    phrase = args.phrase
    if phrase is None:
        phrase = _random_phrase()
        if not args.quiet:
            print(f"No phrase given — weaving one from “{phrase}”.")
    if not phrase.strip():
        print("error: the seed phrase is empty", file=sys.stderr)
        return 2

    from . import world as world_mod
    t0 = time.time()
    if not args.quiet:
        print(f"Weaving “{phrase.strip()}” …", flush=True)
    w = world_mod.weave(phrase, archetype=args.shape, quality=args.quality)

    if args.preview:
        from .preview import render_ansi
        print(render_ansi(w, cols=100))
        _summary(w, t0, quiet=args.quiet)
        return 0

    out = args.output or (_slug(phrase) + ".pdf")
    from .pdfout import PDF
    from .render import MapRenderer, _titlecase
    from .gazetteer import render_gazetteer
    from .rng import Streams
    pdf = PDF(title=_titlecase(phrase))
    streams = Streams(phrase)
    MapRenderer(w, paper=args.paper,
                hex_miles=args.hex_miles).render(pdf, streams)
    pages = 1
    if not args.no_gazetteer:
        pages += render_gazetteer(pdf, w)
    pdf.save(out)

    if args.json_path:
        with open(args.json_path, "w") as f:
            json.dump(world_as_dict(w), f, indent=2)

    if not args.quiet:
        _summary(w, t0, quiet=False)
        print(f"Wrote {out} ({pages} pages).")
        if args.json_path:
            print(f"Wrote {args.json_path}.")
    return 0


def _summary(w, t0, quiet):
    if quiet:
        return
    cities = sum(1 for p in w.settlements if p.kind == "city")
    towns = sum(1 for p in w.settlements if p.kind == "town")
    villages = sum(1 for p in w.settlements if p.kind == "village")
    rivers = sum(1 for s in w.rivers if s.get("name"))
    print(f"{w.endonym} — {w.terrain.archetype}, "
          f"{int(w.terrain.land_fraction * 100)}% land. "
          f"{cities} cities, {towns} towns, {villages} villages; "
          f"{rivers} named rivers; tongue: {w.language.name}. "
          f"({time.time() - t0:.1f}s)")


if __name__ == "__main__":
    sys.exit(main())

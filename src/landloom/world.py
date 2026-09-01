"""World assembly: the full pipeline from phrase to populated region."""

from . import climate as climate_mod
from . import culture, hydrology, lore as lore_mod, naming
from . import roads as roads_mod, terrain as terrain_mod
from .rng import Streams, normalize_phrase

__all__ = ["World", "weave"]


class World:
    def __init__(self, phrase):
        self.phrase = phrase
        self.canonical_phrase = normalize_phrase(phrase)
        self.terrain = None
        self.climate = None
        self.biomes = None
        self.rivers = None
        self.river_cells = None
        self.settlements = None
        self.province = None
        self.seats = None
        self.roads = None
        self.road_cells = None
        self.bridges = None
        self.sea_lanes = None
        self.language = None
        self.names = None
        self.lore = None

    @property
    def grid(self):
        return self.terrain.grid


def weave(phrase, width=260, height=200, archetype=None, land_target=None,
          quality="standard", stages=("civilization",)):
    """Build a world. `stages` may stop early: () = terrain+climate only."""
    streams = Streams(phrase)
    w = World(phrase)

    t = terrain_mod.build_terrain(streams, width=width, height=height,
                                  archetype=archetype, land_target=land_target,
                                  quality=quality)
    w.terrain = t

    c = climate_mod.build_climate(streams, t)
    w.climate = c
    w.biomes = c.biomes

    # final drainage solve under real rainfall: wet highlands feed big rivers
    terrain_mod.finalize(t, rain=c.rain)
    land_rain = sum(c.rain[i] for i in range(t.grid.n) if not t.ocean[i])
    threshold = max(8.0, 0.012 * land_rain)
    w.rivers = hydrology.trace_rivers(t.grid, t.down, t.flux, t.ocean,
                                      t.lake_id, threshold)
    W = t.grid.W
    w.river_cells = {y * W + x for seg in w.rivers for (x, y) in seg["points"]}

    if "civilization" in stages:
        w.settlements = culture.build_settlements(streams, t, c, w.river_cells)
        w.province, w.seats = culture.build_territories(t, c, w.settlements)
        w.roads, w.road_cells, w.bridges = roads_mod.build_roads(
            t, c, w.settlements, w.river_cells)
        w.sea_lanes = roads_mod.build_sea_lanes(t, w.settlements, w.roads)
        naming.name_world(streams, w)
        lore_mod.build_lore(streams, w)
    else:
        w.settlements = []
        w.province = [-1] * t.grid.n
        w.seats = []
        w.roads, w.road_cells, w.bridges = [], set(), []
        w.sea_lanes = []
        w.features = []
        w.province_names = {}
    return w

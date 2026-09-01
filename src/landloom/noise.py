"""Seeded lattice value noise and fractal Brownian motion.

Pure-integer lattice hashing (splitmix64-style avalanche) means the field
is defined everywhere, needs no stored permutation tables, and is exactly
reproducible for a given seed on any platform.
"""

__all__ = ["hash01", "value_noise", "fbm"]

_MASK = 0xFFFFFFFFFFFFFFFF


def _mix(h: int) -> int:
    h &= _MASK
    h = ((h ^ (h >> 30)) * 0xBF58476D1CE4E5B9) & _MASK
    h = ((h ^ (h >> 27)) * 0x94D049BB133111EB) & _MASK
    return h ^ (h >> 31)


def hash01(ix: int, iy: int, seed: int) -> float:
    """Deterministic uniform [0,1) value at an integer lattice point."""
    h = _mix((ix * 0x9E3779B97F4A7C15 + iy * 0xC2B2AE3D27D4EB4F + seed) & _MASK)
    return h / 18446744073709551616.0


def _smooth(t: float) -> float:
    return t * t * (3.0 - 2.0 * t)


def value_noise(x: float, y: float, seed: int) -> float:
    """Smoothly interpolated lattice noise in [0,1)."""
    ix, iy = int(x // 1), int(y // 1)
    fx, fy = x - ix, y - iy
    sx, sy = _smooth(fx), _smooth(fy)
    v00 = hash01(ix, iy, seed)
    v10 = hash01(ix + 1, iy, seed)
    v01 = hash01(ix, iy + 1, seed)
    v11 = hash01(ix + 1, iy + 1, seed)
    top = v00 + (v10 - v00) * sx
    bot = v01 + (v11 - v01) * sx
    return top + (bot - top) * sy


def fbm(x: float, y: float, seed: int, octaves: int = 5,
        lacunarity: float = 2.0, gain: float = 0.5) -> float:
    """Fractal sum of value noise, normalized to [0,1)."""
    total = 0.0
    amp = 1.0
    freq = 1.0
    norm = 0.0
    s = seed
    for _ in range(octaves):
        total += amp * value_noise(x * freq, y * freq, s)
        norm += amp
        amp *= gain
        freq *= lacunarity
        s = _mix(s + 0x9E3779B97F4A7C15)
    return total / norm

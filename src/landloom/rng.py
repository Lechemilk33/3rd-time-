"""Deterministic random streams derived from a seed phrase.

Every subsystem forks its own independent stream keyed by a tag, so a
change in how one subsystem consumes randomness never reshuffles the
output of another. The same phrase always weaves the same world.
"""

import hashlib
import random

__all__ = ["normalize_phrase", "seed_int", "Streams"]


def normalize_phrase(phrase: str) -> str:
    """Case- and whitespace-insensitive canonical form of a seed phrase."""
    return " ".join(phrase.strip().lower().split())


def seed_int(phrase: str) -> int:
    digest = hashlib.sha256(normalize_phrase(phrase).encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big")


class Streams:
    """Factory for named, independent deterministic RNG streams."""

    def __init__(self, phrase: str):
        self.phrase = phrase
        self.base = seed_int(phrase)

    def fork(self, tag: str) -> random.Random:
        digest = hashlib.sha256(f"{self.base}:{tag}".encode("utf-8")).digest()
        return random.Random(int.from_bytes(digest[:8], "big"))

    def fork_int(self, tag: str) -> int:
        digest = hashlib.sha256(f"{self.base}:{tag}".encode("utf-8")).digest()
        return int.from_bytes(digest[:8], "big")

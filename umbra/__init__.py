"""Two words, one solid, and a shadow that can't tell you which."""

__version__ = "1.0.0"

from .carve import Solid
from .font import Uncarvable

__all__ = ["Solid", "Uncarvable", "__version__"]

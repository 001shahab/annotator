"""Label colours: a hand-picked palette first, generated hues after that.

(c) 2026 - Prof. Shahab Anbarjafari
"""

from __future__ import annotations

import colorsys
from typing import Iterable

# Chosen to stay distinguishable from each other on photos and on white pages.
PALETTE = [
    "#0A84FF",  # blue
    "#30D158",  # green
    "#FF9F0A",  # orange
    "#BF5AF2",  # purple
    "#FF375F",  # pink
    "#64D2FF",  # cyan
    "#FFD60A",  # yellow
    "#5E5CE6",  # indigo
    "#00C7BE",  # teal
    "#AC8E68",  # brown
    "#FF6961",  # coral
    "#8FD14F",  # lime
]

_GOLDEN_ANGLE = 137.508


def _generated(index: int) -> str:
    hue = (index * _GOLDEN_ANGLE) % 360.0
    lightness = 0.52 if index % 2 == 0 else 0.62
    r, g, b = colorsys.hls_to_rgb(hue / 360.0, lightness, 0.72)
    return "#{:02X}{:02X}{:02X}".format(round(r * 255), round(g * 255), round(b * 255))


def next_color(used: Iterable[str]) -> str:
    """Return a colour that no existing label is using."""
    taken = {c.upper() for c in used}
    for color in PALETTE:
        if color not in taken:
            return color
    index = len(taken)
    for offset in range(360):
        color = _generated(index + offset)
        if color not in taken:
            return color
    return _generated(index)

"""Small time-shaping functions. Every animated property is one of these applied to the clock."""

import math


def lin(t: float, start: float, end: float) -> float:
    """0 before `start`, 1 after `end`, straight in between."""
    if end <= start:
        return 1.0 if t >= end else 0.0
    return min(1.0, max(0.0, (t - start) / (end - start)))


def smooth(t: float, start: float, end: float) -> float:
    """Like `lin`, but easing in and out."""
    x = lin(t, start, end)
    return x * x * (3 - 2 * x)


def bump(t: float, start: float, end: float) -> float:
    """Rises from 0 to 1 and falls back to 0 across the interval."""
    return math.sin(math.pi * lin(t, start, end))


def window(t: float, start: float, end: float, edge: float = 0.15) -> float:
    """1 between `start` and `end`, with soft edges of `edge` seconds."""
    return smooth(t, start, start + edge) * (1 - smooth(t, end, end + edge))

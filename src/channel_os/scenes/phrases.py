"""Map a phrase in the narration to a time (M2).

Speech does not move through text at an even rate: the pauses sit at clause ends. Placing a
phrase by its character position alone was up to 0.9 s early on the owner's narration. So the
voice stage records each segment's pauses, and here clause ends in the text are matched to
those pauses to make anchors; a phrase's time is interpolated between the anchors around it.

Word-level alignment (M3) can replace this module without changing its callers.
"""

import re
from collections.abc import Sequence
from itertools import pairwise

Anchor = tuple[int, float]  # (character offset in the normalised text, seconds)

# A pause further than this from where the text expects a clause end is not matched to one.
MAX_SHIFT_SECONDS = 1.6
EDGE_SECONDS = 0.05
_CLAUSE_END = re.compile(r"""[,.;:!?]+["')]*(?=\s|$)""")


def normalise(text: str) -> str:
    return " ".join(text.split())


def clause_ends(text: str) -> list[int]:
    """Offsets just past each clause-ending punctuation mark in the normalised text."""
    return [match.end() for match in _CLAUSE_END.finditer(normalise(text))]


def anchors(text: str, duration: float, pauses: Sequence[tuple[float, float]]) -> list[Anchor]:
    """Known (offset, time) points: the two ends, plus clause ends matched to measured pauses."""
    length = len(normalise(text))
    result: list[Anchor] = [(0, 0.0)]
    ends = [end for end in clause_ends(text) if 0 < end < length]
    first_free = 0
    for start, end in pauses:
        if start <= EDGE_SECONDS or end >= duration - EDGE_SECONDS:
            continue  # silence before the first word or after the last is not a clause pause
        last_offset, last_time = result[-1]
        rate = (duration - last_time) / max(1, length - last_offset)  # seconds per character
        middle = (start + end) / 2
        best: tuple[float, int] | None = None
        for index in range(first_free, len(ends)):
            expected = last_time + (ends[index] - last_offset) * rate
            miss = abs(expected - middle)
            if best is None or miss < best[0]:
                best = (miss, index)
        if best is None or best[0] > MAX_SHIFT_SECONDS:
            continue
        offset = ends[best[1]]
        result.append((offset, start))  # the clause finishes as the pause begins
        result.append((min(offset + 1, length), end))  # the next one starts as it ends
        first_free = best[1] + 1
    result.append((length, duration))
    return result


def phrase_time(phrase: str, text: str, anchor_list: Sequence[Anchor]) -> float:
    """When `phrase` starts being spoken. The phrase `start` means time zero."""
    if phrase == "start":
        return 0.0
    offset = normalise(text).casefold().find(normalise(phrase).casefold())
    if offset < 0:
        raise ValueError(f"phrase {phrase!r} is not in the narration")
    for (left, left_time), (right, right_time) in pairwise(anchor_list):
        if left <= offset <= right:
            if right == left:
                return left_time
            return left_time + (right_time - left_time) * (offset - left) / (right - left)
    return anchor_list[-1][1]

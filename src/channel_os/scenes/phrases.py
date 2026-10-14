"""Map a phrase in the narration to a time (M2).

A phrase's time is interpolated between anchors: points in the text whose time is known. The
best anchors are the words themselves: the voice stage writes down when each word is said
(captions/align.py), and with those a phrase lands on its first word.

A narration without word times (rendered with --no-listen, or before 14 October 2026) is
anchored on its pauses instead. Speech does not move through text at an even rate: the pauses
sit at clause ends, so clause ends in the text are matched to the measured pauses. That is an
estimate, and it can slip by a clause, which put a run of captions three seconds early.
"""

import re
from collections.abc import Sequence
from itertools import pairwise

from channel_os.captions.align import TimedWord

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


def anchors(text: str, duration: float, pauses: Sequence[tuple[float, float]],
            words: Sequence[TimedWord] = ()) -> list[Anchor]:
    """Known (offset, time) points.

    With word times, every timed word is an anchor at its start. Without them: the two ends,
    plus clause ends matched to measured pauses.
    """
    length = len(normalise(text))
    if words:
        timed: list[Anchor] = [] if words[0][0] == 0 else [(0, 0.0)]
        for offset, start, _ in words:
            if timed and (offset <= timed[-1][0] or start < timed[-1][1]):
                continue
            timed.append((offset, min(start, duration)))
        if timed[-1][0] < length:
            timed.append((length, max(duration, timed[-1][1])))
        return timed
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


def find_offset(phrase: str, text: str, start: int = 0) -> int:
    """Offset of `phrase` in the normalised text at or after `start`; -1 when it is not there."""
    return normalise(text).casefold().find(normalise(phrase).casefold(), start)


def phrase_time(phrase: str, text: str, anchor_list: Sequence[Anchor]) -> float:
    """When `phrase` starts being spoken. The phrase `start` means time zero."""
    if phrase == "start":
        return 0.0
    offset = find_offset(phrase, text)
    if offset < 0:
        raise ValueError(f"phrase {phrase!r} is not in the narration")
    return time_at(offset, anchor_list)


def time_at(offset: int, anchor_list: Sequence[Anchor]) -> float:
    """The time at which the character at `offset` is spoken, interpolated between anchors."""
    for (left, left_time), (right, right_time) in pairwise(anchor_list):
        if left <= offset <= right:
            if right == left:
                return left_time
            return left_time + (right_time - left_time) * (offset - left) / (right - left)
    return anchor_list[-1][1]

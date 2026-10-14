"""When each word of the script is spoken: the recogniser's word times, matched to the script.

Planned for M3, brought forward on 14 October 2026. Captions and the steps of scenes used to be
placed by a word's position in the text, corrected by the pauses measured in the audio
(scenes/phrases.py). On episode 001 that showed a run of captions three seconds before their
words: one silence was measured as three short ones, and each took a sentence end. The voice
stage already runs speech recognition over the narration (voice/listen.py), so it also writes
down when each word starts, and the planner places everything between those times.

A word the recogniser writes another way ("thirty" as "30") or does not hear has no time of its
own; the planner places it between the timed words around it.
"""

import difflib
import re
from collections.abc import Sequence

HeardWord = tuple[str, float, float]  # a word as the recogniser wrote it, its start and end
TimedWord = tuple[int, float, float]  # a script word: its offset in the normalised text, start, end

_APOSTROPHES = "'" + chr(0x2019)  # straight and curly, as in "you'll"
_WORD = re.compile(rf"[A-Za-z0-9]+(?:[{_APOSTROPHES}][A-Za-z]+)?")


def _key(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", word.lower())


def script_words(text: str) -> list[tuple[int, str]]:
    """The words of `text` with their offsets in its normalised form (whitespace collapsed)."""
    plain = " ".join(text.split())
    return [(found.start(), _key(found.group())) for found in _WORD.finditer(plain)]


def _spoken(heard: Sequence[HeardWord]) -> list[HeardWord]:
    """The recogniser's words split like the script's ("at-least-once" is three words), each
    part taking its share of the word's time."""
    parts: list[HeardWord] = []
    for word, start, end in heard:
        keys = [key for key in map(_key, _WORD.findall(word)) if key]
        share = (end - start) / max(1, len(keys))
        parts += [(key, start + index * share, start + (index + 1) * share)
                  for index, key in enumerate(keys)]
    return parts


def align(text: str, heard: Sequence[HeardWord]) -> list[TimedWord]:
    """The words of `text` that were heard, with when they were said, in spoken order."""
    script = script_words(text)
    spoken = _spoken(heard)
    matcher = difflib.SequenceMatcher(a=[key for _, key in script],
                                      b=[key for key, _, _ in spoken], autojunk=False)
    timed: list[TimedWord] = []
    for block in matcher.get_matching_blocks():
        for k in range(block.size):
            _, start, end = spoken[block.b + k]
            if timed and start < timed[-1][1]:
                continue  # a stray match must not make time run backwards
            timed.append((script[block.a + k][0], round(start, 3), round(end, 3)))
    return timed

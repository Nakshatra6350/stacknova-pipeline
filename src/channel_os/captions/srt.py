"""The English subtitle track uploaded with every video (M3, docs/CAPTIONS_SPEC.md §B).

Sentence-level cues of at most two lines of 42 characters, each on screen for 1 to 7 seconds,
timed from the word times the voice stage measured (captions/align.py). A sentence too long for
two lines is split at the punctuation nearest its middle, or at a space; a cue too short to read
joins its neighbour. Each unit's cues start where the video plan puts the unit, so the logo
intro after the hook is counted the way the picture counts it.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass, replace

from channel_os.captions.align import TimedWord
from channel_os.scenes.formats import FPS
from channel_os.scenes.phrases import anchors, normalise, time_at
from channel_os.scenes.plan import VideoPlan

LINE_CHARS = 42
MAX_LINES = 2
MIN_SECONDS = 1.0
MAX_SECONDS = 7.0
LINGER_SECONDS = 0.5  # a cue stays this long after its last word, if the next one allows
_SENTENCE_END = re.compile(r"[.!?]+[\"')]*(?=\s|$)")
_CLAUSE_MARK = re.compile(r"[,;:—]\s")
_TIME = re.compile(r"^(\d\d):(\d\d):(\d\d),(\d\d\d) --> (\d\d):(\d\d):(\d\d),(\d\d\d)$")


@dataclass(frozen=True)
class Cue:
    start: float
    end: float
    lines: tuple[str, ...]


def wrap(text: str) -> tuple[str, ...] | None:
    """`text` as at most two lines of LINE_CHARS, broken at the space that balances them best;
    None when it does not fit."""
    text = " ".join(text.split())
    if len(text) <= LINE_CHARS:
        return (text,)
    best: tuple[int, int] | None = None
    for space in (m.start() for m in re.finditer(" ", text)):
        first, second = text[:space], text[space + 1:]
        if len(first) <= LINE_CHARS and len(second) <= LINE_CHARS:
            longer = max(len(first), len(second))
            if best is None or longer < best[0]:
                best = (longer, space)
    if best is None:
        return None
    return text[:best[1]], text[best[1] + 1:]


def _sentences(plain: str) -> list[tuple[int, int]]:
    spans, start = [], 0
    for found in _SENTENCE_END.finditer(plain):
        if plain[:found.end()].count('"') % 2:
            continue  # inside a quotation: "Something went wrong. Try again." is one line
        spans.append((start, found.end()))
        start = found.end()
    if plain[start:].strip():
        spans.append((start, len(plain)))
    return [_trim(plain, a, b) for a, b in spans if plain[a:b].strip()]


def _trim(plain: str, a: int, b: int) -> tuple[int, int]:
    while a < b and plain[a] == " ":
        a += 1
    while b > a and plain[b - 1] == " ":
        b -= 1
    return a, b


def _split(plain: str, a: int, b: int) -> list[tuple[int, int]]:
    """Pieces of plain[a:b] that each fit two lines: at the clause mark nearest the middle if
    one lies in the middle half, else at the space nearest the middle."""
    if wrap(plain[a:b]) is not None:
        return [(a, b)]
    middle = (a + b) / 2
    marks = [a + m.end() for m in _CLAUSE_MARK.finditer(plain[a:b])]
    marks = [m for m in marks if abs(m - middle) <= (b - a) / 4]
    if not marks:
        marks = [a + m.start() for m in re.finditer(" ", plain[a:b])]
    if not marks:
        return [(a, b)]  # one enormous word: nothing to break
    cut = min(marks, key=lambda mark: abs(mark - middle))
    left, right = _trim(plain, a, cut), _trim(plain, cut, b)
    return _split(plain, *left) + _split(plain, *right)


def _timed(plain: str, spans: Sequence[tuple[int, int]], points: Sequence[tuple[int, float]],
           words: Sequence[TimedWord]) -> list[tuple[float, float, int, int]]:
    out: list[tuple[float, float, int, int]] = []
    for a, b in spans:
        ends = [end for offset, _, end in words if a <= offset < b]
        # A piece whose first words were not heard has its start placed between timed words,
        # which can fall before the previous piece's last word has ended.
        start = max(time_at(a, points), out[-1][1] if out else 0.0)
        end = max(ends) if ends else time_at(b, points)
        out.append((start, max(end, start), a, b))
    return out


def unit_cues(text: str, duration: float, pauses: Sequence[tuple[float, float]],
              words: Sequence[TimedWord]) -> list[Cue]:
    """The cues of one narrated unit, in seconds from the start of its narration."""
    plain = normalise(text)
    points = anchors(text, duration, pauses, words)
    spans = [piece for a, b in _sentences(plain) for piece in _split(plain, a, b)]
    timed = _timed(plain, spans, points, words)
    # A cue too short to read joins the next one, or else the one before, when the two still
    # fit two lines and seven seconds.
    changed = True
    while changed:
        changed = False
        for index, (start, end, _, _) in enumerate(timed):
            if end - start >= MIN_SECONDS:
                continue
            for other in (index + 1, index - 1):
                if not 0 <= other < len(timed):
                    continue
                first, second = sorted((index, other))
                s0, _, a0, _ = timed[first]
                _, e1, _, b1 = timed[second]
                if wrap(plain[a0:b1]) is not None and e1 - s0 <= MAX_SECONDS:
                    timed[first:second + 1] = [(s0, e1, a0, b1)]
                    changed = True
                    break
            if changed:
                break
    cues: list[Cue] = []
    for index, (start, end, a, b) in enumerate(timed):
        following = timed[index + 1][0] if index + 1 < len(timed) else duration
        if end - start < MIN_SECONDS:
            end = min(start + MIN_SECONDS, max(following, end))
        end = min(end, start + MAX_SECONDS)
        lines = wrap(plain[a:b]) or (plain[a:b],)
        cues.append(Cue(round(start, 3), round(end, 3), lines))
    return cues


def unit_starts(plan: VideoPlan, fps: int = FPS) -> dict[str, float]:
    """When each narrated unit's first scene starts in the video, in seconds. Read from the
    plan's clips, so it is exactly where the picture puts it, logo intro included."""
    starts: dict[str, float] = {}
    frames = 0
    for clip in plan.clips:
        starts.setdefault(clip.unit, round(frames / fps, 3))
        frames += clip.frames
    return starts


def track(units: Sequence[tuple[float, Sequence[Cue]]]) -> list[Cue]:
    """One video's cues from each unit's cues and when that unit starts in the video, each
    left on screen a little after its last word when the next cue allows."""
    moved = [Cue(round(start + cue.start, 3), round(start + cue.end, 3), cue.lines)
             for start, cues in units for cue in cues]
    done: list[Cue] = []
    for index, cue in enumerate(moved):
        following = moved[index + 1].start if index + 1 < len(moved) else cue.end + LINGER_SECONDS
        end = min(cue.end + LINGER_SECONDS, cue.start + MAX_SECONDS, max(following, cue.end))
        done.append(replace(cue, end=round(end, 3)))
    return done


def _stamp(seconds: float) -> str:
    millis = round(seconds * 1000)
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def to_srt(cues: Sequence[Cue]) -> str:
    blocks = [f"{number}\n{_stamp(cue.start)} --> {_stamp(cue.end)}\n" + "\n".join(cue.lines)
              for number, cue in enumerate(cues, start=1)]
    return "\n\n".join(blocks) + "\n"


def problems(text: str) -> list[str]:
    """What breaks the track rules: numbering, times, overlaps, 1-7 s, two lines of 42."""
    found: list[str] = []
    previous_end = 0.0
    for expected, block in enumerate(text.strip().split("\n\n"), start=1):
        rows = block.split("\n")
        if rows[0] != str(expected):
            found.append(f"cue {expected} is numbered {rows[0]!r}")
        times = _TIME.match(rows[1]) if len(rows) > 1 else None
        if times is None:
            found.append(f"cue {expected} has no valid time line")
            continue
        h1, m1, s1, ms1, h2, m2, s2, ms2 = map(int, times.groups())
        start = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000
        end = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000
        length = round(end - start, 3)
        if not MIN_SECONDS <= length <= MAX_SECONDS:
            found.append(f"cue {expected} lasts {length} s")
        if start < previous_end:
            found.append(f"cue {expected} overlaps cue {expected - 1}")
        previous_end = end
        lines = rows[2:]
        if not 1 <= len(lines) <= MAX_LINES:
            found.append(f"cue {expected} has {len(lines)} lines")
        for number, line in enumerate(lines, start=1):
            if len(line) > LINE_CHARS:
                found.append(f"cue {expected} line {number} has {len(line)} characters")
    return found


def chapters(starts: Sequence[tuple[float, str]]) -> list[str]:
    """YouTube chapter lines ("1:05 Title") for (seconds into the video, title) pairs."""
    lines = []
    for seconds, title in starts:
        whole = int(seconds)
        hours, rest = divmod(whole, 3600)
        minutes, secs = divmod(rest, 60)
        stamp = f"{hours}:{minutes:02}:{secs:02}" if hours else f"{minutes}:{secs:02}"
        lines.append(f"{stamp} {title}")
    return lines

"""The English subtitle track: sentence cues on the measured word times (CAPTIONS_SPEC.md §B)."""

from itertools import pairwise

from channel_os.captions.align import script_words
from channel_os.captions.srt import (
    LINE_CHARS,
    Cue,
    chapters,
    problems,
    to_srt,
    track,
    unit_cues,
    unit_starts,
    wrap,
)
from channel_os.scenes.plan import Clip, VideoPlan
from channel_os.scenes.spec import SceneSpec


def _evenly(text: str, seconds_per_word: float = 0.3, gap_after: str = "") -> list[
        tuple[int, float, float]]:
    """Word times for `text`, one word every `seconds_per_word`, with a second of silence after
    the word `gap_after`."""
    timed, clock = [], 0.0
    for offset, word in script_words(text):
        timed.append((offset, round(clock, 3), round(clock + seconds_per_word * 0.8, 3)))
        clock += seconds_per_word + (1.0 if word == gap_after else 0.0)
    return timed


def test_a_line_wraps_into_two_balanced_lines_of_at_most_42() -> None:
    assert wrap("Short enough.") == ("Short enough.",)
    two = wrap("Every movement of money is a set of entries that add up to zero.")
    assert two is not None and len(two) == 2
    assert all(len(line) <= LINE_CHARS for line in two)
    assert " ".join(two) == "Every movement of money is a set of entries that add up to zero."
    assert wrap("x" * 43) is None
    assert wrap("word " * 20) is None  # 99 characters cannot fit two lines


def test_cues_cover_every_word_once_in_order_and_fit_the_rules() -> None:
    text = ("Recap. Take each payment once, with an idempotency key scoped to the merchant. "
            "Store money as whole cents. Move every payment through a state machine, one "
            "guarded step at a time, and never let a timeout count as a failure, because the "
            "money may already have moved by the time the provider stops answering.")
    words = _evenly(text)
    duration = words[-1][2] + 0.4
    cues = unit_cues(text, duration, [], words)
    said = " ".join(" ".join(cue.lines) for cue in cues)
    assert said.split() == text.split()
    for cue in cues:
        assert all(len(line) <= LINE_CHARS for line in cue.lines) and len(cue.lines) <= 2
        assert 1.0 <= cue.end - cue.start <= 7.0
    assert all(a.end <= b.start for a, b in pairwise(cues))


def test_a_cue_starts_when_its_first_word_is_said_and_ends_with_its_last() -> None:
    text = "Did the money move? You don't know, and nobody can tell you yet."
    words = _evenly(text, gap_after="move")
    cues = unit_cues(text, words[-1][2] + 0.5, [], words)
    assert [cue.lines for cue in cues] == [("Did the money move?",),
                                           ("You don't know, and", "nobody can tell you yet.")]
    assert cues[0].start == 0.0 and cues[0].end == words[3][2]  # "move" ends the first cue
    assert cues[1].start == words[4][1]  # "You" starts the second


def test_a_cue_whose_first_words_were_not_heard_never_starts_before_the_last_one_ends() -> None:
    # Measured on episode 005: "fifty thousand" was written "50,000" by the recogniser, so the
    # second cue's start fell between timed words, 10 ms before the first cue's last word ended.
    text = ("One customer's script goes into a loop and sends fifty thousand requests a minute "
            "to your API.")
    words = [(0, 0.0, 0.5), (4, 0.5, 1.08), (15, 1.08, 1.24), (22, 1.24, 1.56),
             (27, 1.56, 1.84), (32, 1.84, 2.04), (34, 2.04, 2.2), (39, 2.2, 2.6),
             (43, 2.6, 2.94), (64, 3.76, 4.16), (73, 4.16, 4.48), (75, 4.48, 4.58),
             (82, 4.58, 4.7), (85, 4.7, 4.9), (90, 4.9, 5.2)]
    cues = unit_cues(text, 5.5, [], words)
    assert len(cues) == 2
    assert cues[1].start >= cues[0].end


def test_a_cue_too_short_to_read_joins_its_neighbour() -> None:
    text = "Recap. Every movement of money is a set of entries that add up to zero."
    words = _evenly(text, seconds_per_word=0.25)
    cues = unit_cues(text, words[-1][2] + 0.3, [], words)
    assert all(cue.end - cue.start >= 1.0 for cue in cues)
    assert cues[0].lines[0].startswith("Recap.")


def test_a_unit_starts_where_the_plan_puts_its_first_scene() -> None:
    def clip(unit: str, frames: int) -> Clip:
        return Clip(unit, SceneSpec("cards", 0.0, frames / 30, {}, ()), frames)
    plan = VideoPlan((clip("s01", 851), clip("intro", 129), clip("welcome", 120),
                      clip("s02", 300), clip("s02", 200), clip("outro", 360)), ())
    assert unit_starts(plan) == {"s01": 0.0, "intro": 28.367, "welcome": 32.667,
                                 "s02": 36.667, "outro": 53.333}
    cues = track([(0.0, [Cue(0.0, 2.0, ("Hook.",))]), (36.667, [Cue(0.2, 2.0, ("Part two.",))])])
    assert cues == [Cue(0.0, 2.5, ("Hook.",)), Cue(36.867, 39.167, ("Part two.",))]


def test_a_quoted_sentence_stays_with_its_quotation() -> None:
    text = 'Then: "Something went wrong. Try again." So you tried again.'
    cues = unit_cues(text, 6.0, [], _evenly(text))
    assert [cue.lines for cue in cues] == [('Then: "Something went wrong. Try again."',),
                                           ("So you tried again.",)]


def test_srt_text_and_its_validator() -> None:
    cues = [Cue(0.0, 2.5, ("Did the money move?",)), Cue(2.5, 4.0, ("You don't know.",))]
    text = to_srt(cues)
    assert text.startswith("1\n00:00:00,000 --> 00:00:02,500\nDid the money move?\n\n2\n")
    assert problems(text) == []
    bad = to_srt([Cue(0.0, 3.0, ("a" * 43,)), Cue(2.0, 2.5, ("overlap",))])
    found = problems(bad)
    assert any("43 characters" in p for p in found)
    assert any("overlaps" in p for p in found)
    assert any("0.5 s" in p for p in found)


def test_chapters_start_at_zero_and_use_segment_titles() -> None:
    assert chapters([(0.0, "Did the money move?"), (41.2, "The requirements"),
                     (605.0, "Recap and next")]) == [
        "0:00 Did the money move?", "0:41 The requirements", "10:05 Recap and next"]

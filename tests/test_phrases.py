"""A phrase's time comes from its place in the text, corrected by the pauses in the audio."""

import pytest

from channel_os.scenes.phrases import anchors, clause_ends, phrase_time

# Short 1 of episode 001 and the pauses measured in its approved narration (9 October 2026).
TEXT = (
    "You tapped Pay, got an error, tapped again, and got charged twice. Here's why. When your "
    "request times out, you can't tell if the server never got it, or charged you and lost the "
    "reply. A retry in that second case is a second charge. The fix: send an idempotency key, "
    "one random ID per payment, reused on every retry. The server stores it with a unique "
    "constraint, so the second attempt can't charge again; it just replays the first response. "
    "Same key, same result. That's why your retry should be harmless. Unless someone forgot "
    "the key."
)
DURATION = 32.66
PAUSES = [
    (1.13, 1.29), (2.13, 2.29), (4.34, 4.48), (5.41, 5.58), (6.98, 7.16), (13.81, 14.14),
    (19.64, 19.94), (24.09, 24.27), (26.11, 26.71), (28.35, 28.51), (30.68, 31.0),
]


def at(phrase: str, pauses: list[tuple[float, float]] = PAUSES) -> float:
    return phrase_time(phrase, TEXT, anchors(TEXT, DURATION, pauses))


def test_clause_ends_follow_punctuation() -> None:
    assert clause_ends("One, two. Three") == [4, 9]
    assert clause_ends('He said "stop." Then left.') == [15, 26]


def test_phrases_after_a_pause_land_where_the_pause_ends() -> None:
    assert at("got an error") == pytest.approx(1.29, abs=0.05)
    assert at("Here's why") == pytest.approx(4.48, abs=0.05)
    assert at("When your request") == pytest.approx(5.58, abs=0.05)
    assert at("The fix") == pytest.approx(14.14, abs=0.05)


def test_a_clause_without_a_pause_is_interpolated_inside_its_stretch() -> None:
    assert at("tapped again") == pytest.approx(2.29, abs=0.05)  # it follows a pause
    assert 2.6 < at("and got charged") < 4.34  # no pause before it: placed inside the stretch
    assert 7.16 < at("or charged you") < 13.81


def test_pauses_beat_plain_proportion() -> None:
    plain = at("When your request", pauses=[])
    assert plain == pytest.approx(TEXT.index("When your request") / len(TEXT) * DURATION)
    assert abs(plain - 5.58) > 0.5  # proportion alone is far off; the anchored value is not


def test_times_never_run_backwards() -> None:
    phrases = ["tapped Pay", "got an error", "charged twice", "Here's why", "never got it",
               "A retry", "The fix", "one random ID", "unique constraint", "second attempt",
               "replays", "Same key", "harmless", "Unless someone"]
    times = [at(phrase) for phrase in phrases]
    assert times == sorted(times)
    assert times[-1] < DURATION


def test_start_is_zero_and_matching_ignores_case_and_line_breaks() -> None:
    assert at("start") == 0.0
    assert at("here's\n  WHY") == at("Here's why")


def test_a_phrase_that_is_not_spoken_is_an_error() -> None:
    with pytest.raises(ValueError, match="not in the narration"):
        at("blockchain")


def test_measured_word_times_are_used_when_there_are_some() -> None:
    # Each word is placed where it was said, whatever the pauses suggest.
    plain = " ".join(TEXT.split())
    words = [(plain.index("Here's why"), 4.9, 5.2), (plain.index("When your"), 6.1, 6.3),
             (plain.index("The fix"), 15.0, 15.3)]
    points = anchors(TEXT, DURATION, PAUSES, words)
    assert phrase_time("Here's why", TEXT, points) == 4.9
    assert phrase_time("The fix", TEXT, points) == 15.0
    # Before the first timed word, time runs from zero.
    assert 0.0 < phrase_time("got an error", TEXT, points) < 4.9


def test_leading_and_trailing_silence_are_not_clause_pauses() -> None:
    padded = [(0.0, 0.3), *PAUSES, (32.4, 32.66)]
    assert at("Here's why", pauses=padded) == pytest.approx(at("Here's why"))

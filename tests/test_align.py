"""The recogniser's word times are matched to the script's own words."""

from channel_os.captions.align import align, script_words

TEXT = "If anything fails, the client retries.  Clean. But that picture hides a question:"


def test_script_words_have_offsets_in_the_normalised_text() -> None:
    plain = " ".join(TEXT.split())
    words = script_words(TEXT)
    assert [plain[offset:offset + 5] for offset, _ in words[:3]] == ["If an", "anyth", "fails"]
    assert [key for _, key in words][-2:] == ["a", "question"]


def test_heard_words_give_their_times_to_the_script_words() -> None:
    heard = [("If", 7.9, 8.0), ("anything", 8.0, 8.4), ("fails,", 8.4, 8.9), ("the", 9.1, 9.2),
             ("client", 9.2, 9.6), ("retries.", 9.86, 10.42), ("But", 12.06, 12.28),
             ("that", 12.3, 12.5), ("picture", 12.5, 12.9), ("hides", 12.9, 13.3),
             ("a", 13.3, 13.4), ("question?", 13.4, 14.0)]
    timed = align(TEXT, heard)
    plain = " ".join(TEXT.split())
    found = {plain[offset:].split()[0]: start for offset, start, _ in timed}
    assert found["retries."] == 9.86 and found["But"] == 12.06
    # "Clean." was not heard, so it has no time of its own.
    assert "Clean." not in found
    assert len(timed) == len(heard)


def test_words_written_another_way_are_left_out() -> None:
    timed = align("Thirty seconds, then 409.", [("30", 0.0, 0.4), ("seconds,", 0.4, 0.9),
                                                ("then", 1.0, 1.2), ("409.", 1.2, 2.0)])
    assert [start for _, start, _ in timed] == [0.4, 1.0, 1.2]


def test_a_hyphenated_word_is_split_and_shares_its_time() -> None:
    timed = align("at-least-once delivery", [("at-least-once", 1.0, 1.6), ("delivery", 1.6, 2.2)])
    assert [(offset, start) for offset, start, _ in timed] == [
        (0, 1.0), (3, 1.2), (9, 1.4), (14, 1.6)]


def test_time_never_runs_backwards() -> None:
    # A recogniser's timestamps can step back a little at a window edge; such a word is dropped.
    timed = align("one two three", [("one", 1.0, 1.2), ("two", 0.9, 1.1), ("three", 1.5, 1.8)])
    assert [start for _, start, _ in timed] == [1.0, 1.5]

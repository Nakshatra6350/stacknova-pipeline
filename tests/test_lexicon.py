"""Words are respelled for the voice model, and only for it."""

from pathlib import Path

import pytest

from channel_os.voice.lexicon import Lexicon, load_lexicon

LEXICON = Lexicon({"retry": "re-try", "retries": "re-tries", "PUT": "put"})


def test_a_word_is_respelled_in_any_casing_and_keeps_its_capital() -> None:
    assert LEXICON.respell("So you retry.") == "So you re-try."
    assert LEXICON.respell("Retries are guaranteed.") == "Re-tries are guaranteed."
    assert LEXICON.respell("Your retry, your RETRY.") == "Your re-try, your Re-try."


def test_only_the_whole_word_is_respelled() -> None:
    # "retrying" is its own word; so is a part of a hyphenated name.
    assert LEXICON.respell("retrying a retry") == "retrying a re-try"
    assert LEXICON.respell("the retry-budget header") == "the retry-budget header"
    assert LEXICON.respell("no retries, no-retries") == "no re-tries, no-retries"


def test_a_key_with_capitals_matches_only_as_written() -> None:
    # PUT is the HTTP method; the verb must be left alone.
    assert LEXICON.respell("GET, PUT and DELETE") == "GET, put and DELETE"
    assert LEXICON.respell("Put the key in a header. You put it there.") == (
        "Put the key in a header. You put it there.")


def test_respelling_twice_changes_nothing_more() -> None:
    once = LEXICON.respell("A retry of the PUT, then more retries.")
    assert once == "A re-try of the put, then more re-tries."
    assert LEXICON.respell(once) == once


SPELLED = Lexicon({"retry": ("re try", "ree try"), "PUT": "put"})


def test_a_word_with_several_spellings_takes_them_in_turn() -> None:
    # A reading that is done again writes the word another way; a word with one spelling
    # keeps it.
    text = "Retry the PUT, then retry."
    assert SPELLED.respell(text) == "Re try the put, then re try."
    assert SPELLED.respell(text, 1) == "Ree try the put, then ree try."
    assert SPELLED.respell(text, 2) == "Re try the put, then re try."


def test_how_many_ways_a_text_can_be_written() -> None:
    assert SPELLED.spellings("So you retry.") == 2
    assert SPELLED.spellings("A PUT is idempotent.") == 1
    assert SPELLED.spellings("Nothing to respell here.") == 1


def test_the_words_the_owner_heard_wrong_are_in_the_config(repo_root: Path) -> None:
    # 13 October 2026: "retries pronounced as retrees and put as patt".
    lexicon = load_lexicon(repo_root / "config" / "pronunciation.yaml")
    text = "Retries happen. GET, PUT, DELETE, POST. Every retry is safe."
    assert lexicon.respell(text) == "Re tries happen. get, put, delete, post. Every re try is safe."
    # Each spelling is another try at the word, so none repeats and none is the written form.
    ways = [lexicon.respell("a retry", turn) for turn in range(lexicon.spellings("a retry"))]
    assert len(ways) == len(set(ways)) >= 2 and "a retry" not in ways
    assert "idempotency" in lexicon.terms


def test_a_missing_file_is_an_empty_lexicon(tmp_path: Path) -> None:
    lexicon = load_lexicon(tmp_path / "pronunciation.yaml")
    assert lexicon.respell("a retry") == "a retry" and lexicon.terms == ()


@pytest.mark.parametrize("entry", ["3", "[]", "[re try, 3]", "['']"])
def test_a_broken_entry_is_refused(tmp_path: Path, entry: str) -> None:
    path = tmp_path / "pronunciation.yaml"
    path.write_text(f"say:\n  retry: {entry}\n", encoding="utf-8")
    with pytest.raises(ValueError, match=r"pronunciation\.yaml: `say` maps a written word"):
        load_lexicon(path)

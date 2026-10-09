"""Narration is packed into chunks of whole sentences."""

from pathlib import Path

import yaml

from channel_os.voice.chunking import chunk_text


def test_short_text_is_one_chunk() -> None:
    assert chunk_text("One two. Three four.", 280) == ["One two. Three four."]


def test_sentences_are_packed_up_to_the_limit() -> None:
    assert chunk_text("One two. Three four. Five.", 12) == ["One two.", "Three four.", "Five."]


def test_whitespace_and_line_breaks_are_collapsed() -> None:
    assert chunk_text("One\n  two.   Three.", 280) == ["One two. Three."]


def test_a_closing_quote_stays_with_its_sentence() -> None:
    assert chunk_text('He said "Stop." Then he left.', 16) == ['He said "Stop."', "Then he left."]


def test_decimal_points_do_not_end_a_sentence() -> None:
    assert chunk_text("Go 1.26 is out. Use it.", 16) == ["Go 1.26 is out.", "Use it."]


def test_an_overlong_sentence_breaks_at_clauses_then_words() -> None:
    text = "First clause here, second clause here, third."
    assert chunk_text(text, 20) == ["First clause here,", "second clause here,", "third."]
    assert chunk_text("alpha beta gamma delta", 11) == ["alpha beta", "gamma delta"]


def test_episode_001_survives_chunking_word_for_word(repo_root: Path) -> None:
    path = repo_root / "content" / "episodes" / "001-idempotency" / "episode.yaml"
    episode = yaml.safe_load(path.read_text(encoding="utf-8"))
    for segment in episode["segments"]:
        chunks = chunk_text(segment["narration"], 280)
        assert " ".join(chunks) == " ".join(segment["narration"].split())
        assert all(len(chunk) <= 280 for chunk in chunks)

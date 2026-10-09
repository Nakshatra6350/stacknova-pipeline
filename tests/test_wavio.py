"""WAV duration and concatenation are exact to the sample."""

from pathlib import Path
from typing import Any

import pytest

from channel_os.voice.wavio import concat, duration_seconds


def test_duration_is_exact(tmp_path: Path, audio: Any) -> None:
    assert duration_seconds(audio(tmp_path / "a.wav", [(1.5, 0.2)])) == 1.5


def test_concat_puts_the_gap_between_neighbours_only(tmp_path: Path, audio: Any) -> None:
    first = audio(tmp_path / "a.wav", [(1.0, 0.2)])
    second = audio(tmp_path / "b.wav", [(0.5, 0.2)])
    out = tmp_path / "nested" / "joined.wav"
    concat([first, second], out, gap_ms=250)
    assert duration_seconds(out) == 1.75


def test_concat_of_one_file_adds_no_gap(tmp_path: Path, audio: Any) -> None:
    only = audio(tmp_path / "a.wav", [(1.0, 0.2)])
    out = tmp_path / "joined.wav"
    concat([only], out, gap_ms=250)
    assert duration_seconds(out) == 1.0


def test_concat_rejects_mixed_formats(tmp_path: Path, audio: Any) -> None:
    first = audio(tmp_path / "a.wav", [(0.5, 0.2)], rate=24000)
    second = audio(tmp_path / "b.wav", [(0.5, 0.2)], rate=48000)
    with pytest.raises(ValueError, match="does not match"):
        concat([first, second], tmp_path / "joined.wav", gap_ms=0)


def test_concat_of_nothing_is_an_error(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="nothing"):
        concat([], tmp_path / "joined.wav", gap_ms=0)

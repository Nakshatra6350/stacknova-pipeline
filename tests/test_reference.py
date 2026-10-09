"""The voice reference gets a cleaned working copy; the original is never changed."""

import wave
from pathlib import Path
from typing import Any

import pytest

from channel_os.voice.loudness import measure
from channel_os.voice.reference import prepare_reference
from channel_os.voice.settings import ReferenceSettings
from channel_os.voice.wavio import duration_seconds

SETTINGS = ReferenceSettings(target_lufs=-27.0, silence_threshold_db=-45.0, max_pause_ms=300)


def test_reference_is_trimmed_tightened_and_levelled(tmp_path: Path, audio: Any) -> None:
    parts = [(1.0, 0.0), (4.0, 0.05), (1.5, 0.0), (4.0, 0.05), (0.5, 0.0)]
    src = audio(tmp_path / "ref.wav", parts, rate=44100, channels=2)
    before = src.read_bytes()
    dst = tmp_path / "work" / "reference.wav"

    prepare_reference(src, dst, SETTINGS)

    assert src.read_bytes() == before
    with wave.open(str(dst), "rb") as wav:
        assert wav.getnchannels() == 1
    # 8 s of tone, 0.05 s kept before it, and the two pauses cut to max_pause_ms each.
    assert duration_seconds(dst) == pytest.approx(8.0 + 0.05 + 2 * 0.3, abs=0.1)
    assert measure(dst).integrated_lufs == pytest.approx(-27.0, abs=0.7)
    assert [path.name for path in dst.parent.iterdir()] == ["reference.wav"]


def test_a_reference_shorter_than_the_model_minimum_is_rejected(
    tmp_path: Path, audio: Any
) -> None:
    src = audio(tmp_path / "ref.wav", [(3.0, 0.05)])
    with pytest.raises(ValueError, match="voice reference"):
        prepare_reference(src, tmp_path / "out.wav", SETTINGS)


def test_a_silent_reference_is_rejected(tmp_path: Path, audio: Any) -> None:
    src = audio(tmp_path / "ref.wav", [(8.0, 0.0)])
    with pytest.raises(ValueError, match="voice reference"):
        prepare_reference(src, tmp_path / "out.wav", SETTINGS)

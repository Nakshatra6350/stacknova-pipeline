"""Loudness is measured and brought to target, also for audio with sharp peaks."""

import wave
from pathlib import Path
from typing import Any

import pytest

from channel_os.voice.loudness import Target, measure, normalize
from channel_os.voice.wavio import duration_seconds

TARGET = Target(integrated_lufs=-14.0, true_peak_db=-1.5, loudness_range=11.0, sample_rate=48000)


def test_normalize_reaches_the_target(tmp_path: Path, audio: Any) -> None:
    src = audio(tmp_path / "quiet.wav", [(4.0, 0.05)])
    achieved = normalize(src, tmp_path / "out.wav", TARGET)
    assert achieved.integrated_lufs == pytest.approx(-14.0, abs=0.5)
    assert achieved.true_peak_db <= -1.0


def test_normalize_reaches_the_target_when_loud_onsets_need_limiting(
    tmp_path: Path, audio: Any
) -> None:
    # Plain two-pass loudnorm stops near -18.5 LUFS on this signal; the limiter path must not.
    syllables = [(0.01, 0.9), (0.2, 0.05), (0.15, 0.0)] * 12
    src = audio(tmp_path / "syllables.wav", syllables)
    achieved = normalize(src, tmp_path / "out.wav", TARGET)
    assert achieved.integrated_lufs == pytest.approx(-14.0, abs=1.0)
    assert achieved.true_peak_db <= -1.0


def test_true_peak_stays_legal_for_sharp_transients(tmp_path: Path, audio: Any) -> None:
    # Hard edges overshoot between samples after resampling; the result must still be legal.
    clicks = [(0.003, 0.9), (0.15, 0.06), (0.1, 0.0)] * 16
    achieved = normalize(audio(tmp_path / "clicks.wav", clicks), tmp_path / "out.wav", TARGET)
    assert achieved.true_peak_db <= -1.0
    assert achieved.integrated_lufs == pytest.approx(-14.0, abs=1.0)


def test_output_is_mono_16_bit_at_the_target_rate_and_keeps_its_length(
    tmp_path: Path, audio: Any
) -> None:
    src = audio(tmp_path / "in.wav", [(3.0, 0.05)], rate=24000, channels=2)
    dst = tmp_path / "nested" / "out.wav"
    normalize(src, dst, TARGET)
    with wave.open(str(dst), "rb") as wav:
        assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) == (1, 2, 48000)
    assert duration_seconds(dst) == pytest.approx(3.0, abs=0.01)


def test_measure_reads_back_what_normalize_reports(tmp_path: Path, audio: Any) -> None:
    dst = tmp_path / "out.wav"
    achieved = normalize(audio(tmp_path / "in.wav", [(4.0, 0.05)]), dst, TARGET)
    assert measure(dst) == achieved


def test_silence_cannot_be_normalised(tmp_path: Path, audio: Any) -> None:
    src = audio(tmp_path / "silent.wav", [(2.0, 0.0)])
    with pytest.raises(ValueError, match="silent"):
        normalize(src, tmp_path / "out.wav", TARGET)

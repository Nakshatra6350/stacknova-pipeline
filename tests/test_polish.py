"""Optional pace and clarity filters between synthesis and loudness."""

from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from channel_os.voice.loudness import measure
from channel_os.voice.polish import polish, polish_filters
from channel_os.voice.settings import VoiceSettings, load_settings
from channel_os.voice.wavio import duration_seconds


@pytest.fixture
def neutral(repo_root: Path) -> VoiceSettings:
    """Settings with every polish step switched off, whatever config/voice.yaml says."""
    settings = load_settings(repo_root / "config" / "voice.yaml")
    off = replace(settings.clarity, highpass_hz=0, presence_db=0.0, air_db=0.0)
    return replace(settings, tempo=1.0, clarity=off)


def test_nothing_switched_on_means_no_filters_and_no_new_file(
    tmp_path: Path, audio: Any, neutral: VoiceSettings
) -> None:
    src = audio(tmp_path / "in.wav", [(1.0, 0.2)])
    assert polish_filters(neutral) == []
    assert polish(src, tmp_path / "out.wav", neutral) == src
    assert not (tmp_path / "out.wav").exists()


def test_filters_follow_the_settings(neutral: VoiceSettings) -> None:
    clarity = replace(
        neutral.clarity, highpass_hz=80, presence_db=2.5, presence_hz=3000, air_db=2.0, air_hz=7000
    )
    assert polish_filters(replace(neutral, tempo=0.92, clarity=clarity)) == [
        "volume=-6dB",
        "highpass=f=80",
        "equalizer=f=3000:t=q:w=1.0:g=2.5",
        "highshelf=f=7000:g=2.0",
        "atempo=0.92",
    ]


def test_tempo_alone_needs_no_headroom(neutral: VoiceSettings) -> None:
    assert polish_filters(replace(neutral, tempo=0.9)) == ["atempo=0.9"]


def test_a_slower_tempo_lengthens_the_audio(
    tmp_path: Path, audio: Any, neutral: VoiceSettings
) -> None:
    src = audio(tmp_path / "in.wav", [(2.0, 0.2)])
    out = polish(src, tmp_path / "nested" / "out.wav", replace(neutral, tempo=0.8))
    assert duration_seconds(out) == pytest.approx(2.5, abs=0.03)


def test_a_boost_does_not_clip(tmp_path: Path, audio: Any, neutral: VoiceSettings) -> None:
    src = audio(tmp_path / "loud.wav", [(3.0, 0.9)])
    boosted = replace(neutral, clarity=replace(neutral.clarity, presence_db=6.0, presence_hz=220))
    out = polish(src, tmp_path / "out.wav", boosted)
    # 6 dB of headroom is taken before the 6 dB boost, so a clean result is as loud as the input.
    assert measure(out).integrated_lufs == pytest.approx(measure(src).integrated_lufs, abs=0.7)

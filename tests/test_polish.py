"""Optional pace and clarity filters between synthesis and loudness."""

from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from channel_os.voice.loudness import detect_pauses, measure
from channel_os.voice.polish import polish, polish_filters
from channel_os.voice.settings import VoiceSettings, load_settings
from channel_os.voice.wavio import duration_seconds


@pytest.fixture
def neutral(repo_root: Path) -> VoiceSettings:
    """Settings with every polish step switched off, whatever config/voice.yaml says."""
    settings = load_settings(repo_root / "config" / "voice.yaml")
    off = replace(settings.clarity, highpass_hz=0, presence_db=0.0, air_db=0.0)
    return replace(settings, tempo=1.0, clarity=off, max_pause_ms=0)


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


def test_a_stalled_gap_is_cut_down_and_a_real_pause_is_left_alone(
    tmp_path: Path, audio: Any, neutral: VoiceSettings
) -> None:
    # The voice model once left 29 s of silence inside a sentence. Speech, a 0.5 s pause,
    # speech, a 6 s stall, speech: only the stall may shrink, to the 0.8 s cap.
    src = audio(tmp_path / "in.wav", [(1.0, 0.2), (0.5, 0.0), (1.0, 0.2), (6.0, 0.0), (1.0, 0.2)])
    capped = replace(neutral, max_pause_ms=800)
    assert polish_filters(capped) == [
        "silenceremove=stop_periods=-1:stop_duration=0.4:stop_threshold=-50dB:stop_silence=0.4"
    ]
    out = polish(src, tmp_path / "out.wav", capped)
    assert duration_seconds(out) == pytest.approx(1.0 + 0.5 + 1.0 + 0.8 + 1.0, abs=0.06)
    assert [round(end - start, 1) for start, end in detect_pauses(out)] == [0.5, 0.8]


def test_the_pause_cap_changes_nothing_when_no_gap_is_too_long(
    tmp_path: Path, audio: Any, neutral: VoiceSettings
) -> None:
    src = audio(tmp_path / "in.wav", [(1.0, 0.2), (0.6, 0.0), (1.0, 0.2)])
    out = polish(src, tmp_path / "out.wav", replace(neutral, max_pause_ms=800))
    assert duration_seconds(out) == pytest.approx(duration_seconds(src), abs=0.001)


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

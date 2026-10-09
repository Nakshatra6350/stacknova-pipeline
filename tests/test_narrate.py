"""Units become cached chunks, normalised segments, one narration and a timing entry."""

import json
from pathlib import Path
from typing import Any

import pytest

from channel_os.voice import narrate as narrate_module
from channel_os.voice.chunking import chunk_text
from channel_os.voice.loudness import Loudness
from channel_os.voice.narrate import (
    LoudnessError,
    Unit,
    all_targets,
    narrate,
    select_units,
    update_timing,
)
from channel_os.voice.settings import VoiceSettings, load_settings
from channel_os.voice.wavio import duration_seconds

Data = dict[str, Any]
UNITS = [
    Unit("s01", "Here is the retry that matters. It works."),
    Unit("s02", "Then it fails. Twice."),
]


@pytest.fixture
def settings(repo_root: Path) -> VoiceSettings:
    return load_settings(repo_root / "config" / "voice.yaml")


def test_the_long_video_uses_every_segment(episode: Data) -> None:
    assert [unit.id for unit in select_units(episode, "long")] == ["s01", "s02", "s03"]


def test_a_cut_short_uses_its_segments(episode: Data) -> None:
    assert select_units(episode, "short-1") == [Unit("s02", episode["segments"][1]["narration"])]


def test_a_standalone_short_uses_its_script(episode: Data) -> None:
    assert select_units(episode, "short-2") == [
        Unit("short-2", "A standalone script about one retry.")
    ]


def test_an_unknown_target_is_an_error(episode: Data) -> None:
    with pytest.raises(ValueError, match="unknown target"):
        select_units(episode, "short-9")


def test_all_targets_lists_the_long_video_then_the_shorts(episode: Data) -> None:
    assert all_targets(episode) == ["long", "short-1", "short-2"]


def test_narrate_writes_segments_narration_and_timing(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    out = tmp_path / "out"
    entry = narrate(UNITS, "long", fake_synthesizer(), settings, out, tmp_path / "cache")

    names = sorted(path.name for path in (out / "voice" / "long").iterdir())
    assert names == ["narration.wav", "seg-s01.wav", "seg-s02.wav"]
    first, second = entry["segments"]
    assert (first["id"], first["file"], first["start"]) == ("s01", "voice/long/seg-s01.wav", 0.0)
    assert first["duration"] == pytest.approx(duration_seconds(out / first["file"]), abs=0.001)
    assert second["start"] == pytest.approx(first["duration"] + 0.25, abs=0.002)
    assert entry["duration"] == pytest.approx(
        first["duration"] + 0.25 + second["duration"], abs=0.002
    )
    assert entry["narration"] == "voice/long/narration.wav"
    assert (entry["pause_ms"], entry["model"]) == (250, "original")
    assert entry["loudness"]["integrated_lufs"] == pytest.approx(-14.0, abs=1.0)
    assert entry["loudness"]["true_peak_db"] <= -1.0


def test_chunks_are_synthesised_once_and_then_reused(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    cache = tmp_path / "cache"
    synthesizer = fake_synthesizer()
    narrate(UNITS, "long", synthesizer, settings, tmp_path / "one", cache)
    assert len(synthesizer.calls) == 2
    narrate(UNITS, "long", synthesizer, settings, tmp_path / "two", cache)
    assert len(synthesizer.calls) == 2
    assert list(cache.glob("*.part")) == []

    other_voice = fake_synthesizer("fake-v2")
    narrate(UNITS, "long", other_voice, settings, tmp_path / "three", cache)
    assert len(other_voice.calls) == 2


def test_long_text_is_synthesised_chunk_by_chunk(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    text = " ".join(f"Sentence number {n} is here." for n in range(30))
    synthesizer = fake_synthesizer()
    narrate([Unit("s01", text)], "long", synthesizer, settings, tmp_path / "out", tmp_path / "c")
    assert synthesizer.calls == chunk_text(text, settings.max_chunk_chars)
    assert len(synthesizer.calls) > 1


def test_a_narration_outside_the_loudness_limits_fails(
    tmp_path: Path,
    settings: VoiceSettings,
    fake_synthesizer: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(narrate_module, "measure", lambda path: Loudness(-20.0, -3.0))
    with pytest.raises(LoudnessError, match=r"-20\.0 LUFS"):
        narrate(UNITS, "long", fake_synthesizer(), settings, tmp_path / "out", tmp_path / "c")


def test_a_true_peak_over_the_limit_fails(
    tmp_path: Path,
    settings: VoiceSettings,
    fake_synthesizer: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(narrate_module, "measure", lambda path: Loudness(-14.0, -0.5))
    with pytest.raises(LoudnessError, match=r"-0\.5 dBTP"):
        narrate(UNITS, "long", fake_synthesizer(), settings, tmp_path / "out", tmp_path / "c")


def test_update_timing_keeps_other_targets(tmp_path: Path) -> None:
    update_timing(tmp_path, "900-fixture", "long", {"duration": 1.0})
    path = update_timing(tmp_path, "900-fixture", "short-1", {"duration": 2.0})
    assert json.loads(path.read_text(encoding="utf-8")) == {
        "episode": "900-fixture",
        "targets": {"long": {"duration": 1.0}, "short-1": {"duration": 2.0}},
    }

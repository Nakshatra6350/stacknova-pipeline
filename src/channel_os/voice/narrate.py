"""Turn narration text into normalised WAV files and a timing record (milestone M1)."""

import json
import tempfile
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from channel_os.voice.chunking import chunk_text
from channel_os.voice.loudness import Loudness, Target, measure, normalize
from channel_os.voice.settings import VoiceSettings
from channel_os.voice.tts import Synthesizer, cache_key
from channel_os.voice.wavio import concat, duration_seconds

# Acceptance limits from docs/BUILD_PLAN.md M1. Settings aim inside them; these are the gate.
LUFS_TOLERANCE = 1.0
TRUE_PEAK_LIMIT_DB = -1.0


class LoudnessError(RuntimeError):
    """A rendered narration is outside the loudness acceptance limits."""


@dataclass(frozen=True)
class Unit:
    """One stretch of narration that becomes one seg-<id>.wav file."""

    id: str
    text: str


def all_targets(episode: Mapping[str, Any]) -> list[str]:
    return ["long", *(short["id"] for short in episode["shorts"])]


def select_units(episode: Mapping[str, Any], only: str) -> list[Unit]:
    """Units for one target: 'long' is every segment; a Short is its script or its segments."""
    narrations = {segment["id"]: segment["narration"] for segment in episode["segments"]}
    if only == "long":
        return [Unit(segment_id, text) for segment_id, text in narrations.items()]
    for short in episode["shorts"]:
        if short["id"] == only:
            if short["source"] == "standalone":
                return [Unit(only, short["script"])]
            return [Unit(segment_id, narrations[segment_id]) for segment_id in short["segments"]]
    raise ValueError(f"unknown target {only!r}: use 'long' or a Short id")


def _raw_unit(
    unit: Unit, synthesizer: Synthesizer, settings: VoiceSettings, cache_dir: Path, work: Path
) -> Path:
    """Synthesise a unit chunk by chunk, reusing cached chunks, and join them."""
    chunk_files: list[Path] = []
    for chunk in chunk_text(unit.text, settings.max_chunk_chars):
        cached = cache_dir / f"{cache_key(synthesizer.identity, chunk)}.wav"
        if not cached.exists():
            partial = cached.with_suffix(".part")
            synthesizer.synthesize(chunk, partial)
            partial.replace(cached)
        chunk_files.append(cached)
    raw = work / f"raw-{unit.id}.wav"
    concat(chunk_files, raw, settings.sentence_gap_ms)
    return raw


def _check(loudness: Loudness, settings: VoiceSettings) -> None:
    if abs(loudness.integrated_lufs - settings.target_lufs) > LUFS_TOLERANCE:
        raise LoudnessError(
            f"narration is at {loudness.integrated_lufs} LUFS; "
            f"allowed is {settings.target_lufs} +/- {LUFS_TOLERANCE}"
        )
    if loudness.true_peak_db > TRUE_PEAK_LIMIT_DB:
        raise LoudnessError(
            f"narration peaks at {loudness.true_peak_db} dBTP; limit is {TRUE_PEAK_LIMIT_DB}"
        )


def narrate(
    units: Sequence[Unit],
    target_name: str,
    synthesizer: Synthesizer,
    settings: VoiceSettings,
    out_dir: Path,
    cache_dir: Path,
) -> dict[str, Any]:
    """Render units into out_dir/voice/<target_name>/ and return that target's timing entry."""
    voice_dir = out_dir / "voice" / target_name
    voice_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = Target(
        settings.target_lufs,
        settings.true_peak_ceiling_db,
        settings.loudness_range,
        settings.sample_rate,
    )
    gap = settings.segment_gap_ms / 1000
    files: list[Path] = []
    segments: list[dict[str, Any]] = []
    cursor = 0.0
    with tempfile.TemporaryDirectory() as work:
        for unit in units:
            raw = _raw_unit(unit, synthesizer, settings, cache_dir, Path(work))
            segment = voice_dir / f"seg-{unit.id}.wav"
            normalize(raw, segment, target)
            duration = duration_seconds(segment)
            segments.append(
                {
                    "id": unit.id,
                    "file": segment.relative_to(out_dir).as_posix(),
                    "start": round(cursor, 3),
                    "duration": round(duration, 3),
                }
            )
            cursor += duration + gap
            files.append(segment)
    narration = voice_dir / "narration.wav"
    concat(files, narration, settings.segment_gap_ms)
    loudness = measure(narration)
    _check(loudness, settings)
    return {
        "narration": narration.relative_to(out_dir).as_posix(),
        "duration": round(duration_seconds(narration), 3),
        "pause_ms": settings.segment_gap_ms,
        "model": settings.model,
        "loudness": {
            "integrated_lufs": loudness.integrated_lufs,
            "true_peak_db": loudness.true_peak_db,
        },
        "segments": segments,
    }


def update_timing(
    out_dir: Path, episode_id: str, target_name: str, entry: Mapping[str, Any]
) -> Path:
    """Record one target in out_dir/timing.json, keeping the targets already there."""
    path = out_dir / "timing.json"
    timing: dict[str, Any] = (
        json.loads(path.read_text(encoding="utf-8"))
        if path.exists()
        else {"episode": episode_id, "targets": {}}
    )
    timing["targets"][target_name] = dict(entry)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(timing, indent=2) + "\n", encoding="utf-8")
    return path

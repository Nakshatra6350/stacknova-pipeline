"""Shared fixtures: a minimal valid episode, generated audio and a fake voice model."""

import math
import struct
import wave
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = ["hi", "es", "pt", "id", "vi", "ar"]
AudioWriter = Callable[..., Path]


def write_audio(
    path: Path, parts: list[tuple[float, float]], rate: int = 24000, channels: int = 1
) -> Path:
    """Write a 16-bit WAV made of (seconds, amplitude) stretches of a 220 Hz tone."""
    frames = bytearray()
    position = 0
    for seconds, amplitude in parts:
        for _ in range(round(seconds * rate)):
            sample = round(amplitude * 32767 * math.sin(2 * math.pi * 220 * position / rate))
            frames += struct.pack("<h", sample) * channels
            position += 1
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(bytes(frames))
    return path


class FakeSynthesizer:
    """Stands in for the voice model: writes a tone that grows with the text and counts calls."""

    def __init__(self, identity: str = "fake-v1") -> None:
        self.identity = identity
        self.calls: list[str] = []

    def synthesize(self, text: str, out_path: Path) -> None:
        self.calls.append(text)
        write_audio(out_path, [(1.5 + 0.02 * len(text), 0.1)])


def _segment(segment_id: str) -> dict[str, Any]:
    return {
        "id": segment_id,
        "title": f"Segment {segment_id}",
        "narration": "Here is the retry that matters." + " filler" * 400,
        "emphasis": ["retry"],
        "visual": {
            "layout": "client-server-db",
            "steps": [
                {"at": "start", "action": "add", "target": "client"},
                {"at": "the retry", "action": "highlight", "target": "client"},
            ],
        },
    }


@pytest.fixture
def episode() -> dict[str, Any]:
    return {
        "id": "900-fixture",
        "version": 1,
        "status": "ready_to_render",
        "pillar": "money-systems",
        "language": "en",
        "keywords": {"primary": "idempotency"},
        "packaging": {
            "titles": ["Idempotency keys explained", "Idempotency: why retries are safe"],
            "thumbnail_texts": ["CHARGED TWICE?"],
            "description": "Fixture description.",
            "tags": ["a", "b", "c", "d", "e"],
        },
        "segments": [_segment("s01"), _segment("s02"), _segment("s03")],
        "shorts": [
            {
                "id": "short-1",
                "source": "segments",
                "segments": ["s02"],
                "hook_on_screen": "This retry charged you twice",
                "youtube_title": "Why Your Retry Charged You Twice #Shorts",
                "instagram_caption": "Caption.",
            },
            {
                "id": "short-2",
                "source": "standalone",
                "script": "A standalone script about one retry.",
                "hook_on_screen": "Exactly-once is a lie",
                "youtube_title": "Exactly-Once Delivery Doesn't Exist #Shorts",
                "instagram_caption": "Caption.",
            },
        ],
        "sources": [{"title": "RFC 9110", "url": "https://www.rfc-editor.org/rfc/rfc9110"}],
        "fact_check": [
            {"claim": "GET is idempotent", "source": "https://www.rfc-editor.org/rfc/rfc9110"}
        ],
        "localizations": {
            language: {"title": f"Title {language}", "description": f"Description {language}"}
            for language in LANGUAGES
        },
    }


@pytest.fixture
def reach() -> dict[str, Any]:
    return {"subtitle_languages": list(LANGUAGES), "quality_gates": {"title_max_chars": 60}}


@pytest.fixture
def repo_root() -> Path:
    return REPO_ROOT


@pytest.fixture
def audio() -> AudioWriter:
    return write_audio


@pytest.fixture
def fake_synthesizer() -> type[FakeSynthesizer]:
    return FakeSynthesizer

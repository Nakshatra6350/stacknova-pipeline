"""Voice settings loaded from config/voice.yaml."""

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

MODELS = ("original", "turbo")


@dataclass(frozen=True)
class ReferenceSettings:
    target_lufs: float
    silence_threshold_db: float
    max_pause_ms: int


@dataclass(frozen=True)
class VoiceSettings:
    model: str
    seed: int
    exaggeration: float
    cfg_weight: float
    temperature: float
    max_chunk_chars: int
    sentence_gap_ms: int
    segment_gap_ms: int
    target_lufs: float
    true_peak_ceiling_db: float
    loudness_range: float
    sample_rate: int
    reference: ReferenceSettings


def load_settings(path: Path, model: str | None = None) -> VoiceSettings:
    """Read the settings file; `model` overrides the configured model."""
    raw: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8"))
    if model:
        raw["model"] = model
    if raw["model"] not in MODELS:
        raise ValueError(f"unknown voice model {raw['model']!r}; use one of {', '.join(MODELS)}")
    reference = ReferenceSettings(**raw.pop("reference"))
    return VoiceSettings(reference=reference, **raw)

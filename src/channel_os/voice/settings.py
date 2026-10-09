"""Voice settings loaded from config/voice.yaml."""

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

MODELS = ("original", "turbo")
TEMPO_RANGE = (0.7, 1.3)  # beyond this the time-stretch becomes audible
BOOST_RANGE_DB = (-6.0, 6.0)  # polish.py reserves 6 dB of headroom for boosts


@dataclass(frozen=True)
class ReferenceSettings:
    target_lufs: float
    silence_threshold_db: float
    max_pause_ms: int


@dataclass(frozen=True)
class ClaritySettings:
    highpass_hz: int
    presence_db: float
    presence_hz: int
    air_db: float
    air_hz: int


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
    tempo: float
    clarity: ClaritySettings
    reference: ReferenceSettings


def _override(raw: dict[str, Any], assignment: str) -> None:
    """Apply one KEY=VALUE override; dots reach nested blocks (clarity.presence_db=2.5)."""
    key, separator, value = assignment.partition("=")
    if not separator:
        raise ValueError(f"override {assignment!r} is not KEY=VALUE")
    *parents, leaf = key.split(".")
    node: Any = raw
    for name in parents:
        node = node.get(name) if isinstance(node, dict) else None
    if not isinstance(node, dict) or leaf not in node or isinstance(node[leaf], dict):
        raise ValueError(f"unknown voice setting {key!r}")
    node[leaf] = yaml.safe_load(value)


def _check_range(name: str, value: float, allowed: tuple[float, float]) -> None:
    low, high = allowed
    if not low <= value <= high:
        raise ValueError(f"{name} {value} is outside {low} to {high}")


def load_settings(
    path: Path, model: str | None = None, overrides: Sequence[str] = ()
) -> VoiceSettings:
    """Read the settings file; `model` and KEY=VALUE `overrides` replace single values."""
    raw: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8"))
    for assignment in overrides:
        _override(raw, assignment)
    if model:
        raw["model"] = model
    if raw["model"] not in MODELS:
        raise ValueError(f"unknown voice model {raw['model']!r}; use one of {', '.join(MODELS)}")
    reference = ReferenceSettings(**raw.pop("reference"))
    clarity = ClaritySettings(**raw.pop("clarity"))
    _check_range("tempo", raw["tempo"], TEMPO_RANGE)
    _check_range("clarity.presence_db", clarity.presence_db, BOOST_RANGE_DB)
    _check_range("clarity.air_db", clarity.air_db, BOOST_RANGE_DB)
    return VoiceSettings(reference=reference, clarity=clarity, **raw)

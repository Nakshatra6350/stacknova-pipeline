"""The cache key and the synthesizer interface. The real model runs only in the workflow."""

import importlib.util
import sys
import types
from pathlib import Path
from typing import Any

import pytest

from channel_os.voice.settings import load_settings
from channel_os.voice.tts import (
    ChatterboxSynthesizer,
    Synthesizer,
    cache_key,
    require_watermarker,
)


def test_a_watermarker_that_failed_to_import_stops_synthesis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # resemble-perth sets the class to None when its own imports fail (seen with setuptools 84).
    monkeypatch.setitem(sys.modules, "perth", types.SimpleNamespace(PerthImplicitWatermarker=None))
    with pytest.raises(RuntimeError, match="watermarker"):
        require_watermarker()


def test_a_working_watermarker_passes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(
        sys.modules, "perth", types.SimpleNamespace(PerthImplicitWatermarker=object)
    )
    require_watermarker()


def test_cache_key_changes_with_identity_and_text() -> None:
    assert cache_key("a", "hello") == cache_key("a", "hello")
    assert cache_key("a", "hello") != cache_key("b", "hello")
    assert cache_key("a", "hello") != cache_key("a", "hello!")
    assert len(cache_key("a", "hello")) == 64


def test_the_fake_fits_the_interface(tmp_path: Path, fake_synthesizer: Any) -> None:
    synthesizer: Synthesizer = fake_synthesizer()
    synthesizer.synthesize("Hello there.", tmp_path / "hello.wav")
    assert (tmp_path / "hello.wav").stat().st_size > 44
    assert synthesizer.identity == "fake-v1"


@pytest.mark.skipif(
    importlib.util.find_spec("chatterbox") is not None, reason="the voice group is installed"
)
def test_missing_voice_dependencies_are_explained(repo_root: Path, tmp_path: Path) -> None:
    settings = load_settings(repo_root / "config" / "voice.yaml")
    with pytest.raises(RuntimeError, match="uv sync --group voice"):
        ChatterboxSynthesizer(settings, tmp_path / "reference.wav")

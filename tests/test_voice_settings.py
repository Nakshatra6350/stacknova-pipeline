"""Voice settings come from config/voice.yaml."""

from pathlib import Path

import pytest

from channel_os.voice.settings import load_settings


def test_repo_config_loads(repo_root: Path) -> None:
    settings = load_settings(repo_root / "config" / "voice.yaml")
    assert settings.model == "original"
    assert settings.target_lufs == -14.0
    assert settings.true_peak_ceiling_db < -1.0
    assert settings.segment_gap_ms == 250
    assert settings.reference.target_lufs == -27.0


def test_model_can_be_overridden(repo_root: Path) -> None:
    assert load_settings(repo_root / "config" / "voice.yaml", model="turbo").model == "turbo"


def test_unknown_model_is_rejected(repo_root: Path) -> None:
    with pytest.raises(ValueError, match="unknown voice model"):
        load_settings(repo_root / "config" / "voice.yaml", model="loud")


def test_nano_is_not_offered(repo_root: Path) -> None:
    # Nano exists only in unreleased chatterbox code; the pinned 0.1.7 has original and turbo.
    with pytest.raises(ValueError, match="unknown voice model"):
        load_settings(repo_root / "config" / "voice.yaml", model="nano")


def test_overrides_replace_single_settings(repo_root: Path) -> None:
    settings = load_settings(
        repo_root / "config" / "voice.yaml",
        overrides=["cfg_weight=0.3", "tempo=0.92", "clarity.presence_db=2.5"],
    )
    assert (settings.cfg_weight, settings.tempo, settings.clarity.presence_db) == (0.3, 0.92, 2.5)


@pytest.mark.parametrize(
    "override", ["speed=2", "clarity.sparkle=1", "tempo", "clarity=1", "reference=2"]
)
def test_bad_overrides_are_rejected(repo_root: Path, override: str) -> None:
    with pytest.raises(ValueError, match=r"voice setting|KEY=VALUE"):
        load_settings(repo_root / "config" / "voice.yaml", overrides=[override])


@pytest.mark.parametrize("override", ["tempo=0.4", "tempo=1.6", "clarity.presence_db=9"])
def test_values_that_would_damage_the_audio_are_rejected(repo_root: Path, override: str) -> None:
    with pytest.raises(ValueError, match="outside"):
        load_settings(repo_root / "config" / "voice.yaml", overrides=[override])


def test_unknown_key_is_rejected(tmp_path: Path, repo_root: Path) -> None:
    text = (repo_root / "config" / "voice.yaml").read_text(encoding="utf-8")
    broken = tmp_path / "voice.yaml"
    broken.write_text(text + "\nspeed: 2\n", encoding="utf-8")
    with pytest.raises(TypeError):
        load_settings(broken)

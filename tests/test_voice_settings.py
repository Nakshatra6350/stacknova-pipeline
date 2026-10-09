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
    assert load_settings(repo_root / "config" / "voice.yaml", model="nano").model == "nano"


def test_unknown_model_is_rejected(repo_root: Path) -> None:
    with pytest.raises(ValueError, match="unknown voice model"):
        load_settings(repo_root / "config" / "voice.yaml", model="loud")


def test_unknown_key_is_rejected(tmp_path: Path, repo_root: Path) -> None:
    text = (repo_root / "config" / "voice.yaml").read_text(encoding="utf-8")
    broken = tmp_path / "voice.yaml"
    broken.write_text(text + "\nspeed: 2\n", encoding="utf-8")
    with pytest.raises(TypeError):
        load_settings(broken)

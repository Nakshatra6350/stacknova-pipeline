"""The ffmpeg runner returns the report and fails loudly."""

from pathlib import Path
from typing import Any

import pytest

from channel_os.assemble.ffmpeg import FfmpegError, run_ffmpeg


def test_run_ffmpeg_returns_the_report(tmp_path: Path, audio: Any) -> None:
    path = audio(tmp_path / "a.wav", [(1.0, 0.2)])
    report = run_ffmpeg(["-i", str(path), "-af", "volumedetect", "-f", "null", "-"])
    assert "mean_volume" in report


def test_run_ffmpeg_raises_with_the_reason(tmp_path: Path) -> None:
    with pytest.raises(FfmpegError, match=r"nope\.wav"):
        run_ffmpeg(["-i", str(tmp_path / "nope.wav"), "-f", "null", "-"])


def test_a_missing_binary_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("channel_os.assemble.ffmpeg.shutil.which", lambda name: None)
    with pytest.raises(FfmpegError, match="not found"):
        run_ffmpeg(["-version"])

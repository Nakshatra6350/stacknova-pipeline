"""ffmpeg invocation shared by the voice stage (M1) and assembly (M3)."""

import shutil
import subprocess
from collections.abc import Sequence


class FfmpegError(RuntimeError):
    """ffmpeg is missing or exited with an error."""


def run_ffmpeg(args: Sequence[str]) -> str:
    """Run ffmpeg quietly and return its stderr, which is where filters print their reports."""
    binary = shutil.which("ffmpeg")
    if binary is None:
        raise FfmpegError("ffmpeg was not found on PATH")
    done = subprocess.run(
        [binary, "-hide_banner", "-nostats", "-nostdin", *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if done.returncode != 0:
        raise FfmpegError(f"ffmpeg failed ({done.returncode}): {done.stderr.strip()[-2000:]}")
    return done.stderr

"""Sample-exact WAV helpers built on the standard library."""

import wave
from collections.abc import Sequence
from pathlib import Path


def duration_seconds(path: Path) -> float:
    with wave.open(str(path), "rb") as wav:
        return wav.getnframes() / wav.getframerate()


def concat(paths: Sequence[Path], out: Path, gap_ms: int) -> None:
    """Join WAV files of one format, with gap_ms of silence between neighbours."""
    if not paths:
        raise ValueError("nothing to concatenate")
    with wave.open(str(paths[0]), "rb") as first:
        channels, width, rate = first.getnchannels(), first.getsampwidth(), first.getframerate()
    silence = b"\x00" * (round(rate * gap_ms / 1000) * channels * width)
    out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out), "wb") as target:
        target.setnchannels(channels)
        target.setsampwidth(width)
        target.setframerate(rate)
        for index, path in enumerate(paths):
            with wave.open(str(path), "rb") as source:
                found = (source.getnchannels(), source.getsampwidth(), source.getframerate())
                if found != (channels, width, rate):
                    raise ValueError(f"{path} does not match the format of {paths[0]}")
                if index:
                    target.writeframes(silence)
                target.writeframes(source.readframes(source.getnframes()))

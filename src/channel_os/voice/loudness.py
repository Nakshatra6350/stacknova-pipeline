"""Loudness measurement and normalisation with ffmpeg (EBU R128), milestone M1.

A single two-pass loudnorm cannot lift speech with sharp peaks to -14 LUFS under a true-peak
ceiling: it stops short. So when plain gain would cross the ceiling, a limiter tames the peaks
first, and two-pass loudnorm then sets the level.
"""

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

from channel_os.assemble.ffmpeg import run_ffmpeg

LIMIT_MARGIN_DB = 0.5
MAX_PRE_GAIN_ROUNDS = 3
PRE_GAIN_TOLERANCE_LU = 0.3
PEAK_TOLERANCE_DB = 0.05
_JSON_BLOCK = re.compile(r"\{[^{}]*\}")


@dataclass(frozen=True)
class Loudness:
    integrated_lufs: float
    true_peak_db: float


@dataclass(frozen=True)
class Target:
    integrated_lufs: float
    true_peak_db: float
    loudness_range: float
    sample_rate: int


def _report(stderr: str) -> dict[str, str]:
    """The loudnorm JSON block; ffmpeg prints a status line after it, so search for it."""
    blocks = _JSON_BLOCK.findall(stderr)
    if not blocks:
        raise ValueError("ffmpeg printed no loudnorm report")
    report: dict[str, str] = json.loads(blocks[-1])
    return report


def _loudnorm(target: Target) -> str:
    return (
        f"loudnorm=I={target.integrated_lufs}:TP={target.true_peak_db}"
        f":LRA={target.loudness_range}"
    )


def _analyse(path: Path, target: Target, prefix: str = "") -> dict[str, str]:
    chain = f"{prefix}{_loudnorm(target)}:print_format=json"
    return _report(run_ffmpeg(["-i", str(path), "-af", chain, "-f", "null", "-"]))


def measure(path: Path) -> Loudness:
    """Integrated loudness and true peak of a file."""
    chain = "loudnorm=print_format=json"
    report = _report(run_ffmpeg(["-i", str(path), "-af", chain, "-f", "null", "-"]))
    return Loudness(float(report["input_i"]), float(report["input_tp"]))


def _peak_tamer(path: Path, target: Target) -> str:
    """Gain plus limiter to prepend when plain gain would push peaks over the ceiling."""
    first = _analyse(path, target)
    measured = float(first["input_i"])
    if math.isinf(measured):
        raise ValueError(f"{path} is silent; nothing to normalise")
    gain = target.integrated_lufs - measured
    ceiling = target.true_peak_db - LIMIT_MARGIN_DB
    if float(first["input_tp"]) + gain <= ceiling:
        return ""
    limit = 10 ** (ceiling / 20)
    prefix = ""
    for _ in range(MAX_PRE_GAIN_ROUNDS):
        prefix = f"volume={gain:.2f}dB,alimiter=limit={limit:.4f}:level=false:attack=5:release=50,"
        shortfall = target.integrated_lufs - float(_analyse(path, target, prefix)["input_i"])
        if abs(shortfall) <= PRE_GAIN_TOLERANCE_LU:
            break
        gain += shortfall
    return prefix


def normalize(src: Path, dst: Path, target: Target) -> Loudness:
    """Write src to dst at the target loudness (mono, 16-bit) and return what was achieved."""
    prefix = _peak_tamer(src, target)
    seen = _analyse(src, target, prefix)
    chain = (
        f"{prefix}{_loudnorm(target)}"
        f":measured_I={seen['input_i']}:measured_TP={seen['input_tp']}"
        f":measured_LRA={seen['input_lra']}:measured_thresh={seen['input_thresh']}"
        f":offset={seen['target_offset']}:linear=true:print_format=json"
    )
    dst.parent.mkdir(parents=True, exist_ok=True)
    output = ["-ar", str(target.sample_rate), "-ac", "1", "-c:a", "pcm_s16le", str(dst)]
    run_ffmpeg(["-y", "-i", str(src), "-af", chain, *output])
    achieved = measure(dst)
    overshoot = achieved.true_peak_db - target.true_peak_db
    if overshoot > PEAK_TOLERANCE_DB:
        # Sharp transients overshoot between samples once resampled; take the excess back off.
        trimmed = dst.with_suffix(".trim.wav")
        quieter = f"volume=-{overshoot:.2f}dB"
        run_ffmpeg(["-y", "-i", str(dst), "-af", quieter, "-c:a", "pcm_s16le", str(trimmed)])
        trimmed.replace(dst)
        achieved = measure(dst)
    return achieved

"""Prepare the owner's voice reference for the model without touching the original file.

chatterbox reads only the first 6-15 s of the reference and does not trim silence, so the
working copy is mono, starts at the first word, has its pauses shortened and sits at the level
the library normalises references to.
"""

import math
from pathlib import Path

from channel_os.assemble.ffmpeg import run_ffmpeg
from channel_os.voice.loudness import measure
from channel_os.voice.settings import ReferenceSettings
from channel_os.voice.wavio import duration_seconds

MIN_SECONDS = 6.0  # chatterbox turbo rejects references of 5 s or less
PEAK_LIMIT = 0.89  # about -1 dBFS, in case the level change meets a stray peak


def prepare_reference(src: Path, dst: Path, settings: ReferenceSettings) -> None:
    """Write a mono copy with leading silence trimmed, pauses shortened and the level set."""
    threshold = f"{settings.silence_threshold_db}dB"
    # silenceremove keeps stop_duration + stop_silence of each pause, so give each half.
    half_pause = settings.max_pause_ms / 2000
    cleanup = (
        "aformat=channel_layouts=mono,"
        f"silenceremove=start_periods=1:start_threshold={threshold}:start_silence=0.05"
        f":stop_periods=-1:stop_duration={half_pause}:stop_threshold={threshold}"
        f":stop_silence={half_pause}"
    )
    dst.parent.mkdir(parents=True, exist_ok=True)
    trimmed = dst.with_suffix(".trimmed.wav")
    try:
        run_ffmpeg(["-y", "-i", str(src), "-af", cleanup, "-c:a", "pcm_s16le", str(trimmed)])
        seconds = duration_seconds(trimmed)
        level = measure(trimmed).integrated_lufs
        if seconds < MIN_SECONDS or math.isinf(level):
            raise ValueError(
                f"voice reference has {seconds:.1f} s of speech; the model needs {MIN_SECONDS} s"
            )
        gain = settings.target_lufs - level
        levelled = f"volume={gain:.2f}dB,alimiter=limit={PEAK_LIMIT}:level=false"
        run_ffmpeg(["-y", "-i", str(trimmed), "-af", levelled, "-c:a", "pcm_s16le", str(dst)])
    finally:
        trimmed.unlink(missing_ok=True)

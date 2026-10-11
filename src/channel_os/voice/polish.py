"""Pause, pace and clarity adjustments, applied to raw speech before loudness (M1).

All are plain ffmpeg filters driven by config/voice.yaml. They are not part of the chunk
cache key, so changing them never re-synthesises anything.
"""

from pathlib import Path

from channel_os.assemble.ffmpeg import run_ffmpeg
from channel_os.voice.settings import VoiceSettings

HEADROOM = "volume=-6dB"  # taken before any boost; loudness normalisation gives it back
# A stalled model emits digital silence. Real pauses in speech sit far above this level, so
# only a true gap is ever shortened.
STALL_THRESHOLD_DB = -50


def polish_filters(settings: VoiceSettings) -> list[str]:
    """ffmpeg audio filters for the pause cap, clarity EQ and tempo; empty when all are off."""
    clarity = settings.clarity
    filters: list[str] = []
    if settings.max_pause_ms > 0:
        # silenceremove keeps stop_duration + stop_silence of each gap, so give each half.
        half = settings.max_pause_ms / 2000
        filters.append(
            f"silenceremove=stop_periods=-1:stop_duration={half}"
            f":stop_threshold={STALL_THRESHOLD_DB}dB:stop_silence={half}"
        )
    if clarity.presence_db > 0 or clarity.air_db > 0:
        filters.append(HEADROOM)
    if clarity.highpass_hz > 0:
        filters.append(f"highpass=f={clarity.highpass_hz}")
    if clarity.presence_db:
        filters.append(f"equalizer=f={clarity.presence_hz}:t=q:w=1.0:g={clarity.presence_db}")
    if clarity.air_db:
        filters.append(f"highshelf=f={clarity.air_hz}:g={clarity.air_db}")
    if settings.tempo != 1.0:
        filters.append(f"atempo={settings.tempo}")
    return filters


def polish(src: Path, dst: Path, settings: VoiceSettings) -> Path:
    """Apply the configured filters to src; return src untouched when nothing is switched on."""
    filters = polish_filters(settings)
    if not filters:
        return src
    dst.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(["-y", "-i", str(src), "-af", ",".join(filters), "-c:a", "pcm_s16le", str(dst)])
    return dst

"""Optional pace and clarity adjustments, applied to raw speech before loudness (M1).

Both are plain ffmpeg filters driven by config/voice.yaml. They are not part of the chunk
cache key, so changing them never re-synthesises anything.
"""

from pathlib import Path

from channel_os.assemble.ffmpeg import run_ffmpeg
from channel_os.voice.settings import VoiceSettings

HEADROOM = "volume=-6dB"  # taken before any boost; loudness normalisation gives it back


def polish_filters(settings: VoiceSettings) -> list[str]:
    """ffmpeg audio filters for the configured clarity EQ and tempo; empty when all are off."""
    clarity = settings.clarity
    filters: list[str] = []
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

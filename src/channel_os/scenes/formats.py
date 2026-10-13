"""The two picture formats, their safe content areas and the frame rate (M2).

All geometry is in pixels of the final frame, origin top-left.
"""

from dataclasses import dataclass

FPS = 30


@dataclass(frozen=True)
class Rect:
    x0: float
    y0: float
    x1: float
    y1: float


@dataclass(frozen=True)
class Format:
    name: str
    width: int
    height: int
    content: Rect  # everything the page marks `data-safe` stays inside this


# Portrait leaves the top 260 px and everything below y=1040 to captions and platform UI.
PORTRAIT = Format("portrait", 1080, 1920, Rect(60, 260, 1020, 1040))
# Landscape uses nearly the whole frame; only the progress bar sits below y=1040.
LANDSCAPE = Format("landscape", 1920, 1080, Rect(40, 0, 1880, 1040))
FORMATS = {fmt.name: fmt for fmt in (PORTRAIT, LANDSCAPE)}


def natural_format(target: str) -> Format:
    """The long video is landscape; Shorts and Reels are portrait."""
    return LANDSCAPE if target == "long" else PORTRAIT


def frame_count(duration: float, fps: int = FPS) -> int:
    return max(1, round(duration * fps))

"""The two picture formats, their safe content areas and the frame rate (M2). No Manim here.

All geometry is in pixels of the final frame, origin top-left.
"""

from dataclasses import dataclass

FPS = 30
MONO_ADVANCE = 0.6  # width of one character of the mono face (JetBrains Mono), in ems


@dataclass(frozen=True)
class Rect:
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def w(self) -> float:
        return self.x1 - self.x0

    @property
    def h(self) -> float:
        return self.y1 - self.y0

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2

    def contains(self, other: "Rect") -> bool:
        return (self.x0 <= other.x0 and self.y0 <= other.y0
                and other.x1 <= self.x1 and other.y1 <= self.y1)


@dataclass(frozen=True)
class Format:
    name: str
    width: int
    height: int
    content: Rect  # everything drawn stays inside this
    scale: float  # size of shapes relative to portrait
    text_scale: float  # extra enlargement of text so it reads on the target screen


# Portrait leaves the top 260 px and everything below y=1040 to captions (M3) and platform UI.
PORTRAIT = Format("portrait", 1080, 1920, Rect(60, 260, 1020, 1040), 1.0, 1.25)
LANDSCAPE = Format("landscape", 1920, 1080, Rect(160, 110, 1760, 970), 1.2, 1.12)
FORMATS = {fmt.name: fmt for fmt in (PORTRAIT, LANDSCAPE)}


def natural_format(target: str) -> Format:
    """The long video is landscape; Shorts and Reels are portrait."""
    return LANDSCAPE if target == "long" else PORTRAIT


def frame_count(duration: float, fps: int = FPS) -> int:
    return max(1, round(duration * fps))

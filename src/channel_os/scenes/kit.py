"""Drawing kit for scenes: shapes, text, flows and packets, placed in pixels (M2).

Stages draw with a `Canvas`. It converts pixel positions of the final frame into scene
coordinates, takes every colour and font from the theme, and remembers each drawable's own
opacity so parts can be faded as a function of time.
"""

import math
import sys
from pathlib import Path
from typing import Any

import manimpango
import numpy as np
from manim import WHITE, Arc, Circle, Dot, Line, RoundedRectangle, Text, VGroup, VMobject

from channel_os.scenes.formats import MONO_ADVANCE, Format, Rect
from channel_os.scenes.theme import Theme, Themes

UNIT = 1 / 135  # scene units per pixel: the frame is 8 units across its short side
STROKE = 3.0
FONT_UNITS_PER_PX = 1 / 1.92  # Manim font_size that gives a 1 px em at UNIT scale
MIN_TEXT_SHRINK = 0.6
FONT_DIR = Path(__file__).resolve().parents[3] / "assets" / "fonts"
# Every label is rasterised once, white, at this size, then scaled and coloured. Manim caches a
# label by text, font, size and colour, so this makes one cached outline serve every theme and
# both formats.
RASTER_FONT_SIZE = 48.0
# The bundled faces. Text is drawn only in these, so a render never falls back to whatever
# font the machine happens to have.
FONT_FILES = {
    ("JetBrains Mono", "NORMAL"): "JetBrainsMono-Regular.ttf",
    ("JetBrains Mono", "BOLD"): "JetBrainsMono-Bold.ttf",
    ("Inter", "NORMAL"): "Inter-Regular.ttf",
    ("Inter", "MEDIUM"): "Inter-Medium.ttf",
    ("Inter", "SEMIBOLD"): "Inter-SemiBold.ttf",
    ("Inter", "BOLD"): "Inter-Bold.ttf",
    ("Inter Display", "ULTRABOLD"): "InterDisplay-ExtraBold.ttf",
}

_registered: set[Path] = set()


class SceneError(RuntimeError):
    """A scene that cannot be drawn as described. The message says what and where."""


def use_font(family: str, weight: str, font_dir: Path = FONT_DIR) -> None:
    """Make a bundled face visible to Pango. Safe to call again.

    The two platforms want opposite things. On Windows every registered file adds most of a
    second to every label that has to be rasterised, so a face is registered only when first
    used. Elsewhere registering costs nothing, but Pango only sees the fonts that were
    registered before it laid out its first text: a face added later is silently replaced by
    a system font. So there every bundled face is registered at the first call.
    """
    name = FONT_FILES.get((family, weight))
    if name is None:
        known = ", ".join(f"{face} {style}" for face, style in sorted(FONT_FILES))
        raise SceneError(f"no bundled font for {family} {weight}; assets/fonts has: {known}")
    wanted = [name] if sys.platform == "win32" else sorted(set(FONT_FILES.values()))
    for file_name in wanted:
        font_file = font_dir / file_name
        if font_file not in _registered:
            if not manimpango.register_font(str(font_file)):
                raise SceneError(f"could not register font {file_name}")
            _registered.add(font_file)


class Canvas:
    """Pixel-space drawing surface for one scene in one format and theme."""

    def __init__(self, fmt: Format, theme: Theme, fonts: Themes) -> None:
        self.fmt, self.theme = fmt, theme
        self.mono, self.sans, self.display = fonts.mono, fonts.sans, fonts.display
        self.unit = UNIT
        self.mobjects: list[Any] = []
        self._base: dict[int, tuple[float, float]] = {}

    # ---- placement -------------------------------------------------------------------------

    def point(self, x: float, y: float) -> Any:
        """A pixel position (origin top-left, y down) as a scene point."""
        return np.array([(x - self.fmt.width / 2) * UNIT, (self.fmt.height / 2 - y) * UNIT, 0.0])

    def pixel(self, point: Any) -> tuple[float, float]:
        """A scene point as a pixel position: the inverse of `point`."""
        return (float(point[0]) / UNIT + self.fmt.width / 2,
                self.fmt.height / 2 - float(point[1]) / UNIT)

    def bounds(self, mob: Any) -> Rect:
        """The pixel box a drawable occupies."""
        x0, y0 = self.pixel(mob.get_corner(np.array([-1.0, 1.0, 0.0])))
        x1, y1 = self.pixel(mob.get_corner(np.array([1.0, -1.0, 0.0])))
        return Rect(x0, y0, x1, y1)

    def add(self, *mobjects: Any) -> None:
        """Queue mobjects for the scene, bottom-most first."""
        self.mobjects.extend(mobjects)

    # ---- opacity ---------------------------------------------------------------------------

    def reg(self, mob: Any) -> Any:
        """Remember a drawable's own stroke and fill opacity so `show` can scale them."""
        for member in mob.family_members_with_points():
            self._base[id(member)] = (member.get_stroke_opacity(), member.get_fill_opacity())
        return mob

    def show(self, mob: Any, alpha: float) -> None:
        """Set a registered drawable to `alpha` times its own opacity."""
        for member in mob.family_members_with_points():
            stroke, fill = self._base[id(member)]
            member.set_stroke(opacity=stroke * alpha, family=False)
            member.set_fill(opacity=fill * alpha, family=False)

    # ---- shapes ----------------------------------------------------------------------------

    def rrect(self, cx: float, cy: float, w: float, h: float, r: float, stroke: str, fill: str,
              fill_opacity: float = 1.0, sw: float = STROKE) -> Any:
        box = RoundedRectangle(width=w * UNIT, height=h * UNIT,
                               corner_radius=min(r, w / 2, h / 2) * UNIT)
        return box.set_stroke(stroke, sw).set_fill(fill, fill_opacity).move_to(self.point(cx, cy))

    def seg(self, x1: float, y1: float, x2: float, y2: float, colour: str,
            sw: float = STROKE) -> Any:
        return Line(self.point(x1, y1), self.point(x2, y2)).set_stroke(colour, sw)

    def dot(self, radius: float, colour: str) -> Any:
        return Dot(radius=radius * UNIT, color=colour)

    def ring(self, x: float, y: float, radius: float, colour: str, sw: float = STROKE) -> Any:
        return Circle(radius=radius * UNIT).set_stroke(colour, sw).move_to(self.point(x, y))

    def arc(self, x: float, y: float, radius: float, sweep: float, colour: str,
            sw: float = STROKE + 1) -> Any:
        """Clockwise arc from twelve o'clock covering `sweep` of a full turn."""
        angle = -max(0.01, math.tau * sweep)
        curve = Arc(radius=radius * UNIT, start_angle=math.pi / 2, angle=angle)
        return curve.move_arc_center_to(self.point(x, y)).set_stroke(colour, sw)

    def check(self, cx: float, cy: float, size: float, colour: str) -> Any:
        mark = VMobject()
        mark.set_points_as_corners([
            self.point(cx - 0.5 * size, cy),
            self.point(cx - 0.12 * size, cy + 0.36 * size),
            self.point(cx + 0.5 * size, cy - 0.36 * size),
        ])
        return mark.set_stroke(colour, STROKE + 1)

    def cross(self, cx: float, cy: float, size: float, colour: str) -> Any:
        half = size / 2
        return VGroup(
            self.seg(cx - half, cy - half, cx + half, cy + half, colour, STROKE + 1),
            self.seg(cx - half, cy + half, cx + half, cy - half, colour, STROKE + 1),
        )

    def text(self, value: str, x: float, y: float, px: float, colour: str, font: str | None = None,
             weight: str = "NORMAL", anchor: str = "c", max_width: float | None = None) -> Any:
        """Text placed by its line box, so labels in a row share a baseline.

        Centring on the letters themselves makes "server" ride higher than "paid". Rendering
        the value behind "Hg" gives every label the same tall line box; those two glyphs are
        then removed. `max_width` (pixels) shrinks a label that would overflow its slot.
        """
        family = font or self.mono
        use_font(family, weight)
        size = px * self.fmt.text_scale * FONT_UNITS_PER_PX
        label = Text("Hg" + value, font=family, weight=weight, font_size=RASTER_FONT_SIZE,
                     color=WHITE)
        label.scale(size / RASTER_FONT_SIZE).set_color(colour)
        line_y = label.get_center()[1]
        for glyph in list(label.submobjects[:2]):
            label.remove(glyph)
        target = self.point(x, y)
        label.shift(np.array([0.0, target[1] - line_y, 0.0]))
        if max_width is not None and label.width > max_width * UNIT:
            shrink = max_width * UNIT / label.width
            if shrink < MIN_TEXT_SHRINK:
                raise SceneError(f"text {value!r} is too long for its {max_width:.0f} px slot")
            label.scale(shrink, about_point=np.array([label.get_center()[0], target[1], 0.0]))
        if anchor == "l":
            label.set_x(target[0] + label.width / 2)
        elif anchor == "r":
            label.set_x(target[0] - label.width / 2)
        else:
            label.set_x(target[0])
        return label


    def mono_advance(self, px: float) -> float:
        """Pixels from one character of the mono face to the next at size `px`."""
        return MONO_ADVANCE * px * self.fmt.text_scale

    def code_text(self, value: str, x: float, y: float, px: float, colour: str) -> Any:
        """A stretch of code in the mono face whose first column is exactly at pixel `x`.

        `text` places a label by its ink, which is right for labels and wrong for code: columns
        must line up whatever the first letter is. Here the pen position is what is placed, so
        a listing can be built from separately coloured stretches. Leading spaces count.
        """
        use_font(self.mono, "NORMAL")
        body = value.lstrip(" ")
        indent = len(value) - len(body)
        label = Text("Hg" + body, font=self.mono, font_size=RASTER_FONT_SIZE, color=WHITE)
        label.scale(px * self.fmt.text_scale * FONT_UNITS_PER_PX / RASTER_FONT_SIZE)
        label.set_color(colour)
        target = self.point(x, y)
        # "H" sits two columns left of the text; putting it there puts the text at x.
        anchor = label.submobjects[0]
        columns = (indent - 2) * self.mono_advance(px) * UNIT
        label.shift(np.array([target[0] + columns - anchor.get_left()[0],
                              target[1] - label.get_center()[1], 0.0]))
        for glyph in list(label.submobjects[:2]):
            label.remove(glyph)
        return label


class Flow:
    """Dashes marching along a straight rail, like the flow lines in the owner's portfolio."""

    def __init__(self, start: Any, end: Any, colour: str, dashes: int = 7, ratio: float = 0.42,
                 speed: float = 1.4) -> None:
        self.start, self.end = np.array(start), np.array(end)
        self.count, self.ratio, self.speed = dashes, ratio, speed
        self.lines = VGroup(*[Line(self.start, self.end).set_stroke(colour, STROKE)
                              for _ in range(dashes)])

    def update(self, t: float, alpha: float) -> None:
        phase = (t * self.speed) % 1
        span = self.end - self.start
        for index, line in enumerate(self.lines):
            begin = ((index + phase) / self.count) % 1
            finish = min(1.0, begin + self.ratio / self.count)
            if alpha <= 0.001 or finish - begin < 0.004:
                line.set_stroke(opacity=0)
                continue
            line.put_start_and_end_on(self.start + span * begin, self.start + span * finish)
            line.set_stroke(opacity=alpha)


def along(start: Any, end: Any, fraction: float) -> Any:
    """The point `fraction` of the way from `start` to `end`."""
    return np.array(start) + (np.array(end) - np.array(start)) * fraction

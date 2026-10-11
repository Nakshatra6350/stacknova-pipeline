"""What every stage shares (M2): parts that fade as functions of time, groups that dim, pills,
pings, outlines, packets, the header and the check that nothing leaves the content area.

A stage builds its drawables in __init__, turns each step into parts and tracks in `add_step`,
and returns one `update(t)` from `run`. Nothing is animated with Manim's own animations.
"""

from collections.abc import Callable, Mapping, Sequence
from typing import Any, ClassVar

from manim import UP, VGroup

from channel_os.scenes.easing import bump, lin, smooth, window
from channel_os.scenes.formats import Rect
from channel_os.scenes.kit import STROKE, UNIT, Canvas, Flow, SceneError, along
from channel_os.scenes.spec import SceneSpec, Step

FADE = 0.15
DIM_LEVEL = 0.28
EDGE_TOLERANCE = 4.0  # pixels a stroke may reach past the content area
Track = Callable[[float], None]
Update = Callable[[float], None]


class Part:
    """A drawable whose opacity is a product of time functions."""

    def __init__(self, mob: Any, groups: tuple[str, ...], appear: float | None) -> None:
        self.mob, self.groups = mob, groups
        self.appear = appear  # None: there from the start; math.inf: hidden until triggered
        self.vanish: float | None = None
        self.gain: Callable[[float], float] | None = None

    def alpha(self, t: float, level: Callable[[tuple[str, ...], float], float]) -> float:
        value = level(self.groups, t)
        if self.appear is not None:
            value *= smooth(t, self.appear, self.appear + FADE)
        if self.vanish is not None:
            value *= 1 - smooth(t, self.vanish, self.vanish + FADE)
        if self.gain is not None:
            value *= self.gain(t)
        return value


class Stage:
    """Base of every stage. Subclasses list their layers bottom-most first."""

    LAYERS: ClassVar[tuple[str, ...]] = ("rails", "flows", "bodies", "details", "marks",
                                         "packets")
    NAME: ClassVar[str] = "stage"

    def __init__(self, canvas: Canvas) -> None:
        self.c = canvas
        self.th = canvas.theme
        self.layers: dict[str, list[Any]] = {name: [] for name in self.LAYERS}
        self.parts: list[Part] = []
        self.tracks: list[Track] = []
        self.levels: dict[str, list[tuple[float, float]]] = {}
        self.slots: dict[tuple[str, str], Part] = {}  # what currently fills a shared place

    # ---- bookkeeping -----------------------------------------------------------------------

    def part(self, mob: Any, layer: str, groups: tuple[str, ...] = ("main",),
             appear: float | None = None) -> Part:
        made = Part(self.c.reg(mob), groups, appear)
        self.parts.append(made)
        self.layers[layer].append(mob)
        return made

    def level(self, groups: tuple[str, ...], t: float) -> float:
        value = 1.0
        for group in groups:
            current = 1.0
            for when, target in self.levels.get(group, []):
                current += (target - current) * smooth(t, when, when + 0.45)
            value *= current
        return value

    def set_level(self, group: str, when: float, to: float) -> None:
        """From `when`, the group eases to `to` of its full strength."""
        self.levels.setdefault(group, []).append((when, to))

    def replace(self, slot: tuple[str, str], new: Part | None, when: float) -> None:
        """Whatever filled `slot` fades as `new` arrives (or simply fades, for a clear)."""
        old = self.slots.get(slot)
        if old is not None and old.vanish is None:
            old.vanish = when
        if new is not None:
            self.slots[slot] = new

    def status_colour(self, status: str | None) -> str:
        return {"ok": self.th.ok, "bad": self.th.bad, "info": self.th.accent}.get(
            status or "info", self.th.accent)

    def role_colour(self, role: str | None) -> str:
        return {"request": self.th.packet, "reply": self.th.reply, "retry": self.th.retry}[
            role or "request"]

    # ---- shared drawables ------------------------------------------------------------------

    def header(self, texts: Sequence[Any], y: float) -> None:
        """Small muted text top-left and top-right. Never dimmed."""
        area = self.c.fmt.content
        px = 24 * self.c.fmt.scale
        if len(texts) > 0:
            left = self.c.text(str(texts[0]), area.x0 + 10, y, px, self.th.muted, anchor="l")
            self.part(left, "details", ("frame",))
        if len(texts) > 1:
            right = self.c.text(str(texts[1]), area.x1 - 10, y, px, self.th.muted, anchor="r")
            self.part(right, "details", ("frame",))

    def pill(self, text: str, x: float, y: float, px: float, colour: str, height: float,
             groups: tuple[str, ...], when: float | None, weight: str = "NORMAL",
             layer: str = "marks") -> Part:
        c = self.c
        label = c.text(text, x, y, px, colour, weight=weight)
        width = label.width / UNIT + 0.9 * height
        box = c.rrect(x, y, width, height, height / 2, colour, colour, 0.14, 2.5)
        return self.part(VGroup(box, label), layer, groups, when)

    def ping(self, at: tuple[float, float], radius: float, colour: str, when: float,
             groups: tuple[str, ...], grow: float = 1.4) -> None:
        ring = self.c.ring(at[0], at[1], radius, colour)
        self.layers["marks"].append(ring)
        centre = self.c.point(*at)

        def track(t: float) -> None:
            progress = lin(t, when, when + 0.65)
            active = when <= t <= when + 0.65
            ring.scale_to_fit_width(2 * radius * UNIT * (1 + grow * progress)).move_to(centre)
            ring.set_stroke(opacity=(1 - progress) * 0.9 * self.level(groups, t) if active else 0)

        self.tracks.append(track)

    def outline(self, rect: Rect, colour: str, when: float, groups: tuple[str, ...],
                pad: float, radius: float) -> None:
        """A frame around `rect` that pulses once."""
        frame = self.c.rrect(rect.cx, rect.cy, rect.w + pad, rect.h + pad, radius, colour,
                             colour, 0.0, STROKE + 1.5)
        made = self.part(frame, "marks", groups, when)
        made.gain = lambda t: bump(t, when, when + 1.0)

    def packet(self, legs: Sequence[tuple[Any, Any]], spans: Sequence[tuple[float, float]],
               colour: str, radius: float, groups: tuple[str, ...], lost: float | None = None,
               tag: str | None = None, tag_px: float = 17.0,
               gate: Callable[[float], float] | None = None) -> None:
        """A dot that crosses `legs` (scene points) during `spans`, dying early if `lost`."""
        c = self.c
        dot = c.dot(radius, colour)
        self.layers["packets"].append(dot)
        label = None
        if tag:
            label = c.reg(c.text(tag, 0, 0, tag_px, colour))
            self.layers["packets"].append(label)
        start, done = spans[0][0], spans[-1][1]
        linger = 0.25 if lost is not None else 0.0
        rise = UP * (radius * 2.7 * UNIT)

        def track(t: float) -> None:
            position = legs[0][0]
            for index, ((p, q), (begin, finish)) in enumerate(zip(legs, spans, strict=True)):
                last = index == len(legs) - 1
                if t < finish or last:
                    fraction = smooth(t, begin, finish)
                    if last and lost is not None:
                        fraction *= float(lost)
                    position = along(p, q, fraction)
                    break
            shown = window(t, start, done + linger, 0.06) * self.level(groups, t)
            if gate is not None:
                shown *= gate(t)
            dot.move_to(position)
            dot.set_fill(opacity=shown)
            if label is not None:
                label.move_to(position + rise)
                c.show(label, shown)

        self.tracks.append(track)

    def flow(self, start: Any, end: Any, colour: str, groups: tuple[str, ...], dashes: int = 7,
             idle: float = 0.0,
             gate: Callable[[float], float] | None = None) -> list[tuple[float, float]]:
        """Dashes along a rail. Returns the list of busy windows to append to."""
        made = Flow(start, end, colour, dashes=dashes)
        busy: list[tuple[float, float]] = []
        self.layers["flows"].append(made.lines)

        def track(t: float) -> None:
            active = max((window(t, a, b) for a, b in busy), default=0.0)
            shown = self.level(groups, t) * (idle + (0.9 - idle) * active)
            if gate is not None:
                shown *= gate(t)
            made.update(t, shown)

        self.tracks.append(track)
        return busy

    # ---- steps and finish ------------------------------------------------------------------

    def handlers(self) -> Mapping[str, Callable[[Step], None]]:
        """Action name -> the method that draws it."""
        raise NotImplementedError

    def add_step(self, step: Step) -> None:
        handler = self.handlers().get(step.action)
        try:
            if handler is None:
                raise SceneError(f"the {self.NAME} stage has no action {step.action!r}")
            handler(step)
        except (KeyError, IndexError, AssertionError, SceneError) as exc:
            reason = str(exc) if isinstance(exc, SceneError) else repr(exc)
            raise SceneError(
                f"cannot draw step {step.action} on {step.target!r} (at {step.at!r}): {reason}"
            ) from exc

    def finish(self) -> None:
        """Last chance for a stage to add tracks that depend on every step."""

    def check_inside(self) -> None:
        """Captions and platform UI own everything outside the content area."""
        area, slack = self.c.fmt.content, EDGE_TOLERANCE
        allowed = Rect(area.x0 - slack, area.y0 - slack, area.x1 + slack, area.y1 + slack)
        for part in self.parts:
            box = self.c.bounds(part.mob)
            if not allowed.contains(box):
                text = next((member.original_text[2:] for member in part.mob.get_family()
                             if hasattr(member, "original_text")), None)
                what = f"the text {text!r}" if text else "a shape"
                raise SceneError(
                    f"{what} leaves the content area: it spans x {box.x0:.0f}-{box.x1:.0f}, "
                    f"y {box.y0:.0f}-{box.y1:.0f}, and {self.c.fmt.name} content is "
                    f"x {area.x0:.0f}-{area.x1:.0f}, y {area.y0:.0f}-{area.y1:.0f}"
                )

    def run(self) -> Update:
        """Queue everything on the canvas and return the function that sets a moment in time."""
        self.finish()
        self.check_inside()
        for name in self.LAYERS:
            self.c.add(*self.layers[name])
        parts, tracks, canvas, level = self.parts, self.tracks, self.c, self.level

        def update(t: float) -> None:
            for part in parts:
                canvas.show(part.mob, part.alpha(t, level))
            for track in tracks:
                track(t)

        return update


def build(stage_class: Callable[[Canvas, Mapping[str, Any]], Stage], canvas: Canvas,
          spec: SceneSpec) -> Update:
    """Build one scene with a stage class and return its update function."""
    stage = stage_class(canvas, spec.decl)
    for step in spec.steps:
        stage.add_step(step)
    return stage.run()

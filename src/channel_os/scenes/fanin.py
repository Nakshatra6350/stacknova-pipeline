"""The fan-in stage: many senders converge on one receiver, and the arrivals are counted (M2).

Each source appears when it first fires; its packet runs down its own rail into the target and
the counter under the target ticks up. Retry storms, many producers and many clients are drawn
here. Geometry comes from fanin_model.layout.
"""

import math
from collections.abc import Callable, Mapping
from typing import Any

from manim import ManimColor

from channel_os.scenes.fanin_model import layout
from channel_os.scenes.kit import Canvas
from channel_os.scenes.spec import SceneSpec, Step
from channel_os.scenes.stage import Part, Stage, Update, build

TRAVEL_SECONDS = 0.55
GROUP = ("main",)


class _Fanin(Stage):
    NAME = "fanin"

    def __init__(self, canvas: Canvas, decl: Mapping[str, Any]) -> None:
        super().__init__(canvas)
        self.decl = decl
        self.plan = layout(canvas.fmt, decl)
        self.s = canvas.fmt.scale
        self.source_parts: dict[str, list[Part]] = {}
        self.busy: dict[str, list[tuple[float, float]]] = {}
        self.shown: dict[str, float] = {}
        self.arrivals = 0
        self.caption: Part | None = None
        self.header(decl.get("header") or [], self.plan.header_y)
        self._target(decl["target"])
        for source in decl["sources"]:
            self._source(source)

    # ---- construction ----------------------------------------------------------------------

    def _target(self, target: Mapping[str, Any]) -> None:
        c, th, s, rect = self.c, self.th, self.s, self.plan.target
        self.part(c.rrect(rect.cx, rect.cy, rect.w, rect.h, 14 * s, th.strong, th.surface),
                  "bodies")
        rule = rect.y0 + 44 * s
        self.part(c.seg(rect.x0, rule, rect.x1, rule, th.strong), "details")
        self.part(c.text(str(target.get("title", target["id"])), rect.x0 + 18 * s,
                         rect.y0 + 22 * s, 22 * s, th.ink, anchor="l",
                         max_width=rect.w - 90 * s), "details")
        leds = [c.dot(5 * s, th.line).move_to(
            c.point(rect.x1 - 22 * s - index * 18 * s, rect.y0 + 22 * s)) for index in range(3)]
        self.layers["details"].extend(leds)
        lit, off = ManimColor(th.accent), ManimColor(th.line)

        def twinkle(t: float) -> None:
            for index, led in enumerate(leds):
                led.set_fill(lit if ((t * 1.3 + index * 0.33) % 1) < 0.28 else off, opacity=1.0)

        self.tracks.append(twinkle)
        for dx, dy, cut in ((-12, 12, 60), (-34, 38, 104)):
            self.part(c.rrect(rect.cx + dx * s, rect.cy + dy * s, rect.w - cut * s, 10 * s, 5 * s,
                              th.line, th.line, sw=0), "details")
        self.part(c.text(str(target.get("label", target["id"])), rect.cx, self.plan.name_y,
                         22 * s, th.muted), "details")
        if self.decl.get("counter"):
            # Right-aligned under the target, with the room up to the sources to spread into.
            room = rect.x1 - max(box.x1 for box in self.plan.sources.values()) - 40 * s
            self.caption = self.part(
                c.text(str(self.decl["counter"]), rect.x1, self.plan.caption_y, 20 * s, th.muted,
                       anchor="r", max_width=room),
                "details", GROUP, math.inf)

    def _source(self, source: Mapping[str, Any]) -> None:
        c, th, s = self.c, self.th, self.s
        source_id, rect, target = source["id"], self.plan.sources[source["id"]], self.plan.target
        parts = [
            self.part(c.seg(rect.x1, rect.cy, target.x0, target.cy, th.strong), "rails", GROUP,
                      math.inf),
            self.part(c.rrect(rect.cx, rect.cy, rect.w, rect.h, rect.h / 2, th.strong,
                              th.surface), "bodies", GROUP, math.inf),
            self.part(c.text(str(source.get("label", source_id)), rect.cx, rect.cy, 22 * s,
                             th.ink, max_width=rect.w - 34 * s), "details", GROUP, math.inf),
        ]
        self.source_parts[source_id] = parts
        self.busy[source_id] = self.flow(c.point(rect.x1, rect.cy), c.point(target.x0, target.cy),
                                         th.accent, GROUP, dashes=6)

    # ---- actions ---------------------------------------------------------------------------

    def _fire(self, step: Step) -> None:
        c, s, plan = self.c, self.s, self.plan
        source_id, rect, target = step.target, plan.sources[step.target], plan.target
        if source_id not in self.shown:
            self.shown[source_id] = step.time
            for part in self.source_parts[source_id]:
                part.appear = step.time
            self.ping((rect.cx, rect.cy), rect.h * 0.55, self.th.accent, step.time, GROUP,
                      grow=0.9)
        begin = step.time + 0.15
        arrive = begin + TRAVEL_SECONDS
        colour = self.role_colour(step.params.get("role", "retry"))
        legs = [(c.point(rect.x1, rect.cy), c.point(target.x0, target.cy))]
        self.packet(legs, [(begin, arrive)], colour, 9 * s, GROUP)
        self.busy[source_id].append((begin - 0.05, arrive + 0.05))
        self.ping((target.x0, target.cy), 16 * s, colour, arrive, GROUP)
        self.arrivals += 1
        x, y = plan.counter
        count = c.text(f"x{self.arrivals}", x, y, 54 * s, self.th.accent, weight="BOLD")
        self.replace(("target", "count"), self.part(count, "marks", GROUP, arrive), arrive)
        if self.caption is not None and math.isinf(self.caption.appear or 0.0):
            self.caption.appear = arrive

    def _above(self, step: Step, bold: bool) -> None:
        s = self.s
        status = step.params.get("status")
        colour = self.th.reply if status is None and not bold else self.status_colour(status)
        x, y = self.plan.badge()
        made = self.pill(str(step.params.get("text", "")), x, y, (21 if bold else 19) * s, colour,
                         (48 if bold else 36) * s, GROUP, step.time,
                         weight="BOLD" if bold else "NORMAL", keep_inside=True)
        if bold:
            self.ping((x, y), 32 * s, colour, step.time + 0.05, GROUP, grow=1.1)
        self.replace(("target", "above"), made, step.time)

    def _highlight(self, step: Step) -> None:
        rect = self.plan.sources.get(step.target, self.plan.target)
        radius = rect.h / 2 + 7 * self.s if step.target in self.plan.sources else 20 * self.s
        self.outline(rect, self.th.accent, step.time, GROUP, 14 * self.s, radius)

    def handlers(self) -> Mapping[str, Callable[[Step], None]]:
        return {
            "fire": self._fire,
            "badge": lambda step: self._above(step, bold=True),
            "tag": lambda step: self._above(step, bold=False),
            "highlight": self._highlight,
        }


def build_fanin(canvas: Canvas, spec: SceneSpec) -> Update:
    """Queue a fan-in scene on the canvas and return its update function."""
    return build(_Fanin, canvas, spec)

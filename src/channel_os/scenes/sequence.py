"""The sequence stage: who tells whom what, and in which order (M2).

Actors stand side by side, each with a lifeline under it; time runs down. A message grows from
one lifeline to another behind its packet and stays as an arrow. Races, handshakes, retries and
transactions are drawn here. Geometry comes from sequence_model.layout.
"""

from collections.abc import Callable, Mapping
from typing import Any

from manim import DashedLine, ManimColor

from channel_os.scenes.easing import smooth
from channel_os.scenes.flow_model import parse_edge
from channel_os.scenes.formats import Rect
from channel_os.scenes.kit import STROKE, Canvas, SceneError, along
from channel_os.scenes.sequence_model import layout
from channel_os.scenes.spec import SceneSpec, Step
from channel_os.scenes.stage import Stage, Update, build

MESSAGE_SECONDS = 0.5
GROUP = ("main",)


class _Sequence(Stage):
    NAME = "sequence"

    def __init__(self, canvas: Canvas, decl: Mapping[str, Any]) -> None:
        super().__init__(canvas)
        self.plan = layout(canvas.fmt, decl)
        self.s = canvas.fmt.scale
        self.row = -1
        self.header(decl.get("header") or [], self.plan.header_y)
        for actor in decl["actors"]:
            self._actor(actor)

    # ---- construction ----------------------------------------------------------------------

    def _head(self, actor_id: str) -> Rect:
        plan = self.plan
        x = plan.xs[actor_id]
        return Rect(x - plan.head_w / 2, plan.head_y - plan.head_h / 2,
                    x + plan.head_w / 2, plan.head_y + plan.head_h / 2)

    def _actor(self, actor: Mapping[str, Any]) -> None:
        c, th, s, plan = self.c, self.th, self.s, self.plan
        head = self._head(actor["id"])
        kind = actor.get("kind", "service")
        radius = head.h / 2 if kind == "client" else 14 * s
        self.part(c.seg(head.cx, head.y1, head.cx, plan.line_y1, th.line), "rails")
        self.part(c.rrect(head.cx, head.cy, head.w, head.h, radius, th.strong, th.surface),
                  "bodies")
        icon_x = head.x0 + 30 * s
        if kind == "client":
            self.part(c.ring(icon_x, head.cy, 9 * s, th.accent), "details")
        elif kind == "store":
            for offset in (-9, 0, 9):
                self.part(c.seg(icon_x - 11 * s, head.cy + offset * s, icon_x + 11 * s,
                                head.cy + offset * s, th.accent), "details")
        else:
            leds = [c.dot(4.5 * s, th.line).move_to(c.point(icon_x + offset * s, head.cy))
                    for offset in (-11, 0, 11)]
            self.layers["details"].extend(leds)
            self.tracks.append(self._twinkle(leds))
        self.part(c.text(str(actor.get("label", actor["id"])), head.cx + 16 * s, head.cy, 22 * s,
                         th.ink, max_width=head.w - 76 * s), "details")

    def _twinkle(self, leds: list[Any]) -> Callable[[float], None]:
        lit, off = ManimColor(self.th.accent), ManimColor(self.th.line)

        def track(t: float) -> None:
            for index, led in enumerate(leds):
                on = ((t * 1.3 + index * 0.33) % 1) < 0.28
                led.set_fill(lit if on else off, opacity=1.0)

        return track

    def _next_row(self, params: Mapping[str, Any]) -> float:
        if not (params.get("same_row") and self.row >= 0):
            self.row += 1
        if self.row >= len(self.plan.rows):
            raise SceneError(f"a sequence has room for {len(self.plan.rows)} rows")
        return self.plan.rows[self.row]

    # ---- actions ---------------------------------------------------------------------------

    def _message(self, step: Step) -> None:
        edge = parse_edge(step.target)
        assert edge is not None
        _, source, target = edge
        c, th, s, params = self.c, self.th, self.s, step.params
        y = self._next_row(params)
        xa, xb = self.plan.xs[source], self.plan.xs[target]
        way = 1 if xb > xa else -1
        start, end = c.point(xa + way * 8 * s, y), c.point(xb - way * 8 * s, y)
        colour = self.role_colour(params.get("role"))
        lost = params.get("lost")
        reach = float(lost) if lost is not None else 1.0
        begin, arrive = step.time + 0.05, step.time + 0.05 + MESSAGE_SECONDS

        shaft = c.seg(xa + way * 8 * s, y, xb - way * 8 * s, y, colour)
        self.layers["rails"].append(shaft)

        def grow(t: float) -> None:
            fraction = max(smooth(t, begin, arrive) * reach, 0.002)
            shaft.put_start_and_end_on(start, along(start, end, fraction))
            shaft.set_stroke(opacity=0.9 * self.level(GROUP, t) if t >= begin else 0.0)

        self.tracks.append(grow)
        self.packet([(start, end)], [(begin, arrive)], colour, 8 * s, GROUP, lost)
        if lost is None:
            tip_x = xb - way * 8 * s
            for lift in (-9, 9):
                barb = c.seg(tip_x - way * 14 * s, y + lift * s, tip_x, y, colour)
                self.part(barb, "rails", GROUP, arrive - 0.08)
            self.ping((xb, y), 9 * s, colour, arrive, GROUP, grow=1.6)
        else:
            x, _ = c.pixel(along(start, end, reach))
            self.part(c.cross(x, y, 18 * s, th.bad), "marks", GROUP, arrive - 0.05)
        if params.get("text"):
            ink = self.status_colour(params["status"]) if params.get("status") else th.ink
            label = c.text(str(params["text"]), (xa + xb) / 2, y - 22 * s, 21 * s, ink,
                           max_width=abs(xb - xa) - 36 * s)
            self.part(label, "details", GROUP, step.time)

    def _note(self, step: Step) -> None:
        s, params = self.s, step.params
        y = self._next_row(params)
        x = self.plan.xs[step.target]
        colour = self.status_colour(params.get("status"))
        self.pill(str(params.get("text", "")), x, y, 21 * s, colour, 42 * s, GROUP, step.time,
                  solid=True, keep_inside=True)
        self.ping((x, y), 24 * s, colour, step.time, GROUP, grow=1.0)

    def _divider(self, step: Step) -> None:
        c, th, s, area = self.c, self.th, self.s, self.c.fmt.content
        y = self._next_row(step.params)
        rule = DashedLine(c.point(area.x0 + 10, y), c.point(area.x1 - 10, y),
                          dash_length=0.09).set_stroke(th.strong, STROKE - 1)
        self.part(rule, "rails", GROUP, step.time)
        if step.params.get("text"):
            self.pill(str(step.params["text"]), area.cx, y, 20 * s, th.muted, 38 * s, GROUP,
                      step.time, solid=True)

    def _badge(self, step: Step) -> None:
        s = self.s
        colour = self.status_colour(step.params.get("status"))
        x, y = self.plan.badge(step.target)
        made = self.pill(str(step.params.get("text", "")), x, y, 21 * s, colour, 46 * s, GROUP,
                         step.time, weight="BOLD", keep_inside=True)
        self.ping((x, y), 32 * s, colour, step.time + 0.05, GROUP, grow=1.1)
        self.replace((step.target, "above"), made, step.time)

    def _highlight(self, step: Step) -> None:
        self.outline(self._head(step.target), self.th.accent, step.time, GROUP, 12 * self.s,
                     20 * self.s)

    def handlers(self) -> Mapping[str, Callable[[Step], None]]:
        return {"message": self._message, "note": self._note, "divider": self._divider,
                "badge": self._badge, "highlight": self._highlight}


def build_sequence(canvas: Canvas, spec: SceneSpec) -> Update:
    """Queue a sequence scene on the canvas and return its update function."""
    return build(_Sequence, canvas, spec)

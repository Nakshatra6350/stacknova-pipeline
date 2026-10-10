"""The flow stage: a row of nodes joined by rails, with lanes or a table below (M2).

The look follows the owner's portfolio illustrations: thin rails, dashes that march while
something travels, packets that die on a failure path, shapes drawn for the concept, mono
labels and a green/red status language. Each step from episode.yaml becomes one or more
tracks, small functions of time; `build_flow` returns the function that runs them all.

Geometry comes from flow_model.layout, colours and fonts from the canvas. Nothing here knows
about episodes or audio.
"""

import math
from collections.abc import Callable, Mapping
from itertools import pairwise
from typing import Any

from manim import UP, ManimColor, VGroup, interpolate_color

from channel_os.scenes.easing import bump, lin, smooth, window
from channel_os.scenes.flow_model import layout, parse_edge
from channel_os.scenes.formats import Rect
from channel_os.scenes.kit import STROKE, UNIT, Canvas, Flow, SceneError, along
from channel_os.scenes.spec import SceneSpec, Step

LEG_SECONDS = 0.40  # a packet crossing one rail of the main row
LANE_LEG_SECONDS = 0.45
FADE = 0.15
DIM_LEVEL = 0.28
BLOCK_SECONDS = 2.5
LEDGER_ROWS = 3  # what fits inside a ledger node
TABLE_ROWS = 3
EDGE_TOLERANCE = 4.0  # pixels a stroke may reach past the content area
LAYERS = ("rails", "flows", "bodies", "details", "marks", "packets")
Track = Callable[[float], None]


class _Part:
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


class _Stage:
    def __init__(self, canvas: Canvas, decl: Mapping[str, Any]) -> None:
        self.c, self.decl = canvas, decl
        self.th = canvas.theme
        self.plan = layout(canvas.fmt, decl)
        self.g = self.plan.glyph_scale
        self.kinds = {node["id"]: node["kind"] for node in decl["nodes"]}
        self.layers: dict[str, list[Any]] = {name: [] for name in LAYERS}
        self.parts: list[_Part] = []
        self.tracks: list[Track] = []
        self.levels: dict[str, list[tuple[float, float]]] = {}
        self.flows: dict[tuple[str | None, str, str, bool], tuple[Flow, list[tuple[float, float]]]]
        self.flows = {}
        self.presses: dict[str, list[float]] = {}
        self.buttons: dict[str, tuple[Any, tuple[float, float]]] = {}
        self.slots: dict[tuple[str, str], _Part] = {}  # what currently fills a chip/badge/tag slot
        self.ledger_rows: dict[str, int] = {}
        self.table_pulses: dict[str, list[float]] = {}  # row id -> when its glow pulses
        self.bad_rows: dict[str, list[float]] = {}
        self.lower_parts: list[_Part] = []
        self.lower_appear = math.inf
        self.lane_labels: dict[str, _Part] = {}
        self.flashes: dict[tuple[str, str], list[float]] = {}
        self.ring_start: float | None = None
        self._header()
        for node in decl["nodes"]:
            self._node(node)
        self._main_rails()
        if self.plan.lanes:
            self._lanes()
        if self.plan.table:
            self._table()

    # ---- bookkeeping -----------------------------------------------------------------------

    def part(self, mob: Any, layer: str, groups: tuple[str, ...] = ("main",),
             appear: float | None = None) -> _Part:
        made = _Part(self.c.reg(mob), groups, appear)
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

    def replace(self, slot: tuple[str, str], new: _Part | None, when: float) -> None:
        """Whatever filled `slot` fades as `new` arrives (or simply fades, for a clear)."""
        old = self.slots.get(slot)
        if old is not None and old.vanish is None:
            old.vanish = when
        if new is not None:
            self.slots[slot] = new

    def status_colour(self, status: str | None) -> str:
        return {"ok": self.th.ok, "bad": self.th.bad, "info": self.th.accent}.get(
            status or "info", self.th.accent)

    # ---- construction ----------------------------------------------------------------------

    def _header(self) -> None:
        header = self.decl.get("header") or []
        area = self.c.fmt.content
        px = 24 * self.c.fmt.scale
        if len(header) > 0:
            left = self.c.text(str(header[0]), area.x0 + 10, self.plan.header_y, px, self.th.muted,
                               anchor="l")
            self.part(left, "details", ("frame",))
        if len(header) > 1:
            right = self.c.text(str(header[1]), area.x1 - 10, self.plan.header_y, px,
                                self.th.muted, anchor="r")
            self.part(right, "details", ("frame",))

    def _node(self, node: Mapping[str, Any]) -> None:
        c, th, g = self.c, self.th, self.g
        rect = self.plan.nodes[node["id"]]
        kind, cx, cy = node["kind"], rect.cx, rect.cy
        radius = 24 * g if kind == "phone" else 14 * g
        self.part(c.rrect(cx, cy, rect.w, rect.h, radius, th.strong, th.surface), "bodies")
        if kind == "phone":
            top = rect.y0 + 20 * g
            self.part(c.seg(cx - 18 * g, top, cx + 18 * g, top, th.strong), "details")
            if node.get("amount"):
                self.part(c.text("total", cx, cy - 82 * g, 18 * g, th.muted), "details")
                self.part(c.text(str(node["amount"]), cx, cy - 44 * g, 28 * g, th.ink,
                                 max_width=rect.w - 20 * g), "details")
            button = c.rrect(cx, cy + 48 * g, rect.w - 44 * g, 52 * g, 14 * g, th.accent, th.soft)
            self.layers["bodies"].append(button)
            self.buttons[node["id"]] = (button, (cx, cy + 48 * g))
            self.presses[node["id"]] = []
            self.part(c.text(str(node.get("button", "Pay")), cx, cy + 48 * g, 26 * g, th.ink,
                             font=c.sans, weight="SEMIBOLD"), "details")
        else:
            rule = rect.y0 + 44 * g
            self.part(c.seg(rect.x0, rule, rect.x1, rule, th.strong), "details")
            title = str(node.get("title", node["id"]))
            self.part(c.text(title, rect.x0 + 18 * g, rect.y0 + 22 * g, 22 * g, th.ink, anchor="l",
                             max_width=rect.w - 90 * g), "details")
        if kind == "service":
            leds = [c.dot(5 * g, th.line).move_to(
                c.point(rect.x1 - 22 * g - index * 18 * g, rect.y0 + 22 * g)) for index in range(3)]
            self.layers["details"].extend(leds)
            self.tracks.append(self._twinkle(leds))
            for dx, dy, cut in ((-12, 12, 60), (-34, 38, 104)):
                bar = c.rrect(cx + dx * g, cy + dy * g, rect.w - cut * g, 10 * g, 5 * g, th.line,
                              th.line, sw=0)
                self.part(bar, "details")
        if kind == "ledger":
            self.ledger_rows[node["id"]] = 0
            self.bad_rows[node["id"]] = []
        self.part(c.text(str(node.get("label", node["id"])), cx, self.plan.names_y, 22 * g,
                         th.muted), "details")

    def _twinkle(self, leds: list[Any]) -> Track:
        lit, off = ManimColor(self.th.accent), ManimColor(self.th.line)

        def track(t: float) -> None:
            level = self.level(("main",), t)
            for index, led in enumerate(leds):
                on = ((t * 1.3 + index * 0.33) % 1) < 0.28
                led.set_fill(lit if on else off, opacity=level)

        return track

    def _main_rails(self) -> None:
        order = self.plan.order
        for left, right in pairwise(order):
            a, b = self.plan.nodes[left], self.plan.nodes[right]
            self.part(self.c.seg(a.x1, self.plan.row_y, b.x0, self.plan.row_y, self.th.strong),
                      "rails")
            self._flow(None, left, right, reply=False)  # idles faintly even when nothing moves

    def _mini(self, kind: str, x: float, y: float) -> tuple[list[Any], Any]:
        """A lane's small stand-in for a main node: its drawables and the one that flashes."""
        c, th, g = self.c, self.th, self.g
        if kind == "phone":
            body = c.ring(x, y, 15 * g, th.strong).set_fill(th.surface, 1)
            return [body], body
        if kind == "service":
            body = c.rrect(x, y, 38 * g, 38 * g, 9 * g, th.strong, th.surface)
            return [body], body
        body = c.rrect(x, y, 42 * g, 34 * g, 8 * g, th.strong, th.surface)
        return [body, c.seg(x - 21 * g, y - 5 * g, x + 21 * g, y - 5 * g, th.strong, 2)], body

    def _lanes(self) -> None:
        c, th, g, lanes = self.c, self.th, self.g, self.plan.lanes
        assert lanes is not None
        spec = self.decl["lanes"]
        tx, ty = lanes.title
        rx, ry = lanes.ring
        title = c.text(str(spec.get("title", "")), tx, ty, 30 * c.fmt.scale, th.ink, font=c.sans,
                       weight="MEDIUM", anchor="l", max_width=rx - 40 * g - tx)
        self.title_part = self.part(title, "details", ("lanes",), math.inf)
        self.lower_parts.append(self.part(c.ring(rx, ry, 17 * g, th.line), "details", ("lanes",),
                                          math.inf))
        self.ring_at = (rx, ry)
        self.ring_arc = c.arc(rx, ry, 17 * g, 0.0, th.bad)
        self.layers["marks"].append(self.ring_arc)
        labels = {node["id"]: str(node.get("label", node["id"])) for node in self.decl["nodes"]}
        first = next(iter(lanes.rows.values()))
        for node_id, x in first.xs.items():
            legend = c.text(labels[node_id], x, lanes.legend_y, 19 * g, th.muted)
            self.lower_parts.append(self.part(legend, "details", ("lanes",), math.inf))
        self.lane_bodies: dict[tuple[str, str], Any] = {}
        for row_spec in spec["rows"]:
            lane_id = row_spec["id"]
            row = lanes.rows[lane_id]
            groups = ("lanes", f"lane:{lane_id}")
            xs = list(row.xs.items())
            for (_, xa), (_, xb) in pairwise(xs):
                rail = c.seg(xa, row.y, xb, row.y, th.strong)
                self.lower_parts.append(self.part(rail, "rails", groups, math.inf))
            for node_id, x in xs:
                drawables, body = self._mini(self.kinds[node_id], x, row.y)
                self.lane_bodies[(lane_id, node_id)] = body
                for drawable in drawables:
                    self.lower_parts.append(self.part(drawable, "bodies", groups, math.inf))
            label = c.text(str(row_spec["label"]), row.label_x, row.y, 25 * c.fmt.scale, th.ink,
                           anchor="l")
            self.lane_labels[lane_id] = self.part(label, "details", groups, math.inf)

    def _table(self) -> None:
        c, th, g, table = self.c, self.th, self.g, self.plan.table
        assert table is not None
        rect, spec = table.rect, self.decl["table"]
        groups = ("table",)
        add = self.lower_parts.append
        add(self.part(c.seg(table.connector_x, table.connector_y0, table.connector_x, rect.y0,
                            th.strong), "rails", groups, math.inf))
        add(self.part(c.rrect(rect.cx, rect.cy, rect.w, rect.h, 14 * g, th.strong, th.surface),
                      "bodies", groups, math.inf))
        rule = rect.y0 + 44 * g
        add(self.part(c.seg(rect.x0, rule, rect.x1, rule, th.strong), "details", groups, math.inf))
        title = c.text(str(spec.get("title", "table")), rect.x0 + 18 * g, rect.y0 + 22 * g, 22 * g,
                       th.ink, anchor="l", max_width=rect.w * 0.6)
        add(self.part(title, "details", groups, math.inf))

    # ---- rails, flows and packets ----------------------------------------------------------

    def _ends(self, lane: str | None, source: str, target: str) -> tuple[Any, Any]:
        """Scene points where a packet leaves `source` and reaches the adjacent `target`."""
        if lane is not None:
            assert self.plan.lanes is not None
            row = self.plan.lanes.rows[lane]
            return self.c.point(row.xs[source], row.y), self.c.point(row.xs[target], row.y)
        a, b = self.plan.nodes[source], self.plan.nodes[target]
        y = self.plan.row_y
        if a.x0 < b.x0:
            return self.c.point(a.x1, y), self.c.point(b.x0, y)
        return self.c.point(a.x0, y), self.c.point(b.x1, y)

    def _flow(self, lane: str | None, source: str, target: str,
              reply: bool) -> list[tuple[float, float]]:
        """The busy windows of the flow on one rail in one direction, creating it if needed."""
        key = (lane, source, target, reply)
        if key not in self.flows:
            start, end = self._ends(lane, source, target)
            colour = self.th.reply if reply else self.th.accent
            flow = Flow(start, end, colour, dashes=6 if lane else 7)
            busy: list[tuple[float, float]] = []
            self.flows[key] = (flow, busy)
            self.layers["flows"].append(flow.lines)
            groups: tuple[str, ...] = ("lanes", f"lane:{lane}") if lane else ("main",)
            idle = 0.0 if reply or lane else 0.18

            def track(t: float) -> None:
                active = max((window(t, a, b) for a, b in busy), default=0.0)
                shown = self.level(groups, t) * (idle + (0.9 - idle) * active)
                if lane is not None:
                    shown *= smooth(t, self.lower_appear, self.lower_appear + FADE)
                flow.update(t, shown)

            self.tracks.append(track)
        return self.flows[key][1]

    def _send(self, step: Step) -> None:
        edge = parse_edge(step.target)
        assert edge is not None
        lane, source, target = edge
        c, th, g, params = self.c, self.th, self.g, step.params
        role = params.get("role", "request")
        colour = {"request": th.packet, "reply": th.reply, "retry": th.retry}[role]
        order = list(self.plan.order)
        i, j = order.index(source), order.index(target)
        way = 1 if j > i else -1
        hops = [(order[k], order[k + way]) for k in range(i, j, way)]
        leg = LANE_LEG_SECONDS if lane else LEG_SECONDS
        start = step.time + 0.05
        spans = [(start + n * leg, start + (n + 1) * leg) for n in range(len(hops))]
        ends = [self._ends(lane, a, b) for a, b in hops]
        for (a, b), (begin, finish) in zip(hops, spans, strict=True):
            self._flow(lane, a, b, reply=role == "reply").append((begin - 0.05, finish + 0.05))
        lost = params.get("lost")
        done = spans[-1][1]
        groups: tuple[str, ...] = ("lanes", f"lane:{lane}") if lane else ("main",)
        dot = c.dot(9 * g, colour)
        self.layers["packets"].append(dot)
        label = None
        if params.get("tag"):
            label = c.reg(c.text(str(params["tag"]), 0, 0, 17 * g, colour))
            self.layers["packets"].append(label)
        linger = 0.25 if lost is not None else 0.0

        def track(t: float) -> None:
            position = ends[0][0]
            for index, ((p, q), (begin, finish)) in enumerate(zip(ends, spans, strict=True)):
                last = index == len(ends) - 1
                if t < finish or last:
                    fraction = smooth(t, begin, finish)
                    if last and lost is not None:
                        fraction *= float(lost)
                    position = along(p, q, fraction)
                    break
            shown = window(t, start, done + linger, 0.06) * self.level(groups, t)
            dot.move_to(position)
            dot.set_fill(opacity=shown)
            if label is not None:
                label.move_to(position + UP * (24 * g * UNIT))
                c.show(label, shown)

        self.tracks.append(track)
        if lane is not None:
            self._use_lane(lane, step.time)
            for (_, via), (_, arrive) in zip(hops[:-1], spans[:-1], strict=True):
                self.flashes.setdefault((lane, via), []).append(arrive)
        if lost is not None:
            where = along(ends[-1][0], ends[-1][1], float(lost))
            mark = c.cross(0, 0, 18 * g, th.bad).move_to(where)
            died = self.part(mark, "marks", groups, done - 0.05)
            if lane is None:
                died.vanish = done + 0.9
            if params.get("chip"):  # what the receiver shows when nothing arrives
                self._chip(target, params["chip"], done)
            return
        if params.get("row"):
            self._row(target, params["row"], done)
        if params.get("chip"):
            self._chip(target, params["chip"], done)
        if params.get("mark") and lane is not None:
            self._mark(lane, target, str(params["mark"]), done)

    def _use_lane(self, lane: str, when: float) -> None:
        label = self.lane_labels[lane]
        if label.appear is None or label.appear > when:
            label.appear = when

    def _mark(self, lane: str, node_id: str, value: str, when: float) -> None:
        assert self.plan.lanes is not None
        row = self.plan.lanes.rows[lane]
        x, y = row.xs[node_id], row.y - 46 * self.g
        groups = ("lanes", f"lane:{lane}")
        if value == "ok":
            mob = self.c.check(x, y, 20 * self.g, self.th.ok)
        else:
            mob = self.c.text(value, x, y, 26 * self.g, self.th.bad, weight="BOLD")
            self._ping((x, row.y), 26 * self.g, self.th.bad, when, groups)
        made = self.part(mob, "marks", groups, when)
        self.replace((f"{lane}:{node_id}", "mark"), made, when)

    def _ping(self, at: tuple[float, float], radius: float, colour: str, when: float,
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

    # ---- actions ---------------------------------------------------------------------------

    def _press(self, step: Step) -> None:
        self.presses[step.target].append(step.time)
        _, (x, y) = self.buttons[step.target]
        self._ping((x, y), 30 * self.g, self.th.accent, step.time, ("main",))

    def _button_track(self, node_id: str) -> Track:
        button, _ = self.buttons[node_id]
        soft, accent = ManimColor(self.th.soft), ManimColor(self.th.accent)
        presses = self.presses[node_id]

        def track(t: float) -> None:
            level = self.level(("main",), t)
            pressed = max((bump(t, p, p + 0.35) for p in presses), default=0.0)
            button.set_fill(interpolate_color(soft, accent, pressed), opacity=level)
            button.set_stroke(opacity=level)

        return track

    def _row(self, target: str, params: Mapping[str, Any], when: float) -> None:
        if target == "table":
            self._table_row(params, when)
            return
        c, th, g = self.c, self.th, self.g
        rect = self.plan.nodes[target]
        index = self.ledger_rows[target]
        if index >= LEDGER_ROWS:
            raise SceneError(f"a ledger has room for {LEDGER_ROWS} rows")
        self.ledger_rows[target] = index + 1
        y = rect.y0 + 84 * g + index * 58 * g
        bad = params.get("status") == "bad"
        colour = th.bad if bad else th.ink
        if bad:
            glow = self.part(c.rrect(rect.cx, y, rect.w - 20 * g, 44 * g, 9 * g, th.bad, th.bad,
                                     1.0, 0), "details", ("main",), when)
            pulses = self.bad_rows[target]
            pulses.append(when)
            glow.gain = lambda t: 0.3 * max((bump(t, p, p + 1.1) for p in pulses), default=0.0)
            self.part(c.rrect(rect.cx, y, rect.w - 20 * g, 44 * g, 9 * g, th.bad, th.bad, 0.12,
                              2.5), "details", ("main",), when)
        number = c.text(f"#{index + 1}", rect.x0 + 20 * g, y, 20 * g, th.bad if bad else th.muted,
                        anchor="l")
        self.part(number, "details", ("main",), when)
        self.part(c.text(str(params.get("text", "")), rect.cx + 6 * g, y, 24 * g, colour,
                         max_width=rect.w * 0.45), "details", ("main",), when)
        sign = (c.cross(rect.x1 - 30 * g, y, 15 * g, th.bad) if bad
                else c.check(rect.x1 - 30 * g, y, 20 * g, th.ok))
        self.part(sign, "marks", ("main",), when)

    def _table_row(self, params: Mapping[str, Any], when: float) -> None:
        c, th, g, table = self.c, self.th, self.g, self.plan.table
        assert table is not None
        rect, index = table.rect, len(self.table_pulses)
        if index >= TABLE_ROWS:
            raise SceneError(f"the table has room for {TABLE_ROWS} rows")
        y = rect.y0 + 78 * g + index * 46 * g
        cells = [str(cell) for cell in params.get("cells", [])]
        glow = self.part(c.rrect(rect.cx, y, rect.w - 20 * g, 40 * g, 9 * g, th.accent, th.accent,
                                 0.16, 2.5), "details", ("table",), when)
        pulses = [when]
        glow.gain = lambda t: max((bump(t, p, p + 1.2) for p in pulses), default=0.0)
        self.table_pulses[str(params.get("id", index + 1))] = pulses
        if cells:
            self.part(c.text(cells[0], rect.x0 + 22 * g, y, 24 * g, th.ink, anchor="l"),
                      "details", ("table",), when)
        if len(cells) > 1:
            colour = self.status_colour(params.get("status", "ok"))
            self.part(c.text(cells[1], rect.x1 - 22 * g, y, 24 * g, colour, anchor="r"),
                      "details", ("table",), when)

    def _pill(self, text: str, x: float, y: float, px: float, colour: str, height: float,
              layer_groups: tuple[str, ...], when: float, weight: str = "NORMAL") -> _Part:
        c = self.c
        label = c.text(text, x, y, px, colour, weight=weight)
        width = label.width / UNIT + 0.9 * height
        box = c.rrect(x, y, width, height, height / 2, colour, colour, 0.14, 2.5)
        return self.part(VGroup(box, label), "marks", layer_groups, when)

    def _chip(self, node_id: str, params: Mapping[str, Any], when: float) -> None:
        slot = (node_id, "chip")
        if params.get("clear"):
            self.replace(slot, None, when)
            return
        rect, g = self.plan.nodes[node_id], self.g
        # On a phone the chip is on its screen; other nodes carry it under their name.
        on_screen = self.kinds[node_id] == "phone"
        y = rect.cy + 104 * g if on_screen else self.plan.names_y + 44 * g
        colour = self.status_colour(params.get("status"))
        made = self._pill(str(params.get("text", "")), rect.cx, y, 20 * g, colour, 34 * g,
                          ("main",), when)
        self.replace(slot, made, when)

    def _badge(self, step: Step) -> None:
        g, params = self.g, step.params
        colour = self.status_colour(params.get("status"))
        text = str(params.get("text", ""))
        if step.target == "table":
            assert self.plan.table is not None
            rect = self.plan.table.rect
            probe = self.c.text(text, 0, 0, 18 * g, colour, weight="BOLD")
            x = rect.x1 - 18 * g - (probe.width / UNIT + 27 * g) / 2
            made = self._pill(text, x, rect.y0 + 22 * g, 18 * g, colour, 30 * g, ("table",),
                              step.time, weight="BOLD")
        else:
            x, y = self.plan.badge(step.target)
            area = self.c.fmt.content
            probe = self.c.text(text, 0, 0, 21 * g, colour, weight="BOLD")
            half = (probe.width / UNIT + 45 * g) / 2
            x = min(max(x, area.x0 + half), area.x1 - half)
            made = self._pill(text, x, y, 21 * g, colour, 50 * g, ("main",), step.time,
                              weight="BOLD")
            self._ping((x, y), 34 * g, colour, step.time + 0.05, ("main",), grow=1.1)
        self.replace((step.target, "above"), made, step.time)

    def _tag(self, step: Step) -> None:
        rect, g = self.plan.nodes[step.target], self.g
        status = step.params.get("status")
        colour = self.th.reply if status is None else self.status_colour(status)
        made = self._pill(str(step.params.get("text", "")), rect.cx, rect.y0 - 28 * g, 19 * g,
                          colour, 34 * g, ("main",), step.time)
        self.replace((step.target, "above"), made, step.time)  # a tag and a badge share the spot

    def _block(self, step: Step) -> None:
        edge = parse_edge(step.target)
        assert edge is not None
        lane, source, target = edge
        order = self.plan.order
        if abs(order.index(source) - order.index(target)) != 1:
            raise SceneError("a block sits on one rail, so it needs two neighbouring nodes")
        start, end = self._ends(lane, source, target)
        middle = along(start, end, 0.5)
        g, th = self.g, self.th
        groups: tuple[str, ...] = ("lanes", f"lane:{lane}") if lane else ("main",)
        # A block is about one attempt, so it fades; a later request may use the rail again.
        x, y = self.c.pixel(middle)
        bar = self.c.seg(x, y - 17 * g, x, y + 17 * g, th.bad, STROKE + 2)
        self.part(bar, "marks", groups, step.time).vanish = step.time + BLOCK_SECONDS
        self._ping((x, y), 16 * g, th.bad, step.time, groups)
        if step.params.get("text"):
            note = self.c.text(str(step.params["text"]), x, y - 34 * g, 17 * g, th.bad,
                               max_width=abs(end[0] - start[0]) / UNIT + 40 * g)
            self.part(note, "marks", groups, step.time).vanish = step.time + BLOCK_SECONDS

    def _dim(self, step: Step, to: float) -> None:
        group = step.target if step.target in ("main", "lanes", "table") else f"lane:{step.target}"
        self.levels.setdefault(group, []).append((step.time, to))

    def _title(self, step: Step) -> None:
        self.lower_appear = min(self.lower_appear, step.time)
        if step.target == "lanes":
            self.title_part.appear = step.time

    def _timeout(self, step: Step) -> None:
        self.lower_appear = min(self.lower_appear, step.time)
        self.ring_start = step.time

    def _outline(self, rect: Rect, colour: str, when: float, groups: tuple[str, ...]) -> None:
        g = self.g
        frame = self.c.rrect(rect.cx, rect.cy, rect.w + 14 * g, rect.h + 14 * g, 20 * g, colour,
                             colour, 0.0, STROKE + 1.5)
        made = self.part(frame, "marks", groups, when)
        made.gain = lambda t: bump(t, when, when + 1.0)

    def _highlight(self, step: Step) -> None:
        target = step.target
        if target.startswith("table:"):
            row_id = target.split(":", 1)[1]
            if row_id not in self.table_pulses:
                raise SceneError(f"the table has no row {row_id!r} yet")
            self.table_pulses[row_id].append(step.time)
        elif target == "table":
            assert self.plan.table is not None
            self._outline(self.plan.table.rect, self.th.accent, step.time, ("table",))
        elif target in self.plan.nodes:
            bad = self.bad_rows.get(target)
            if bad:
                bad.append(step.time)
            colour = self.th.bad if bad else self.th.accent
            self._outline(self.plan.nodes[target], colour, step.time, ("main",))
        else:
            self._use_lane(target, step.time)

    def add_step(self, step: Step) -> None:
        action = step.action
        try:
            if action == "press":
                self._press(step)
            elif action == "send":
                self._send(step)
            elif action == "row":
                self._row(step.target, step.params, step.time)
            elif action == "chip":
                self._chip(step.target, step.params, step.time)
            elif action == "badge":
                self._badge(step)
            elif action == "tag":
                self._tag(step)
            elif action == "block":
                self._block(step)
            elif action == "dim":
                self._dim(step, DIM_LEVEL)
            elif action == "focus":
                self._dim(step, 1.0)
            elif action == "title":
                self._title(step)
            elif action == "timeout":
                self._timeout(step)
            elif action == "highlight":
                self._highlight(step)
            else:
                raise SceneError(f"the flow stage has no action {action!r}")
        except (KeyError, AssertionError, SceneError) as exc:
            reason = str(exc) if isinstance(exc, SceneError) else repr(exc)
            raise SceneError(
                f"cannot draw step {action} on {step.target!r} (at {step.at!r}): {reason}"
            ) from exc

    # ---- finish ----------------------------------------------------------------------------

    def finish(self) -> Callable[[float], None]:
        if math.isinf(self.lower_appear):
            self.lower_appear = 0.0  # declared but never introduced: simply there
        for part in self.lower_parts:
            part.appear = self.lower_appear
        if self.plan.lanes and math.isinf(self.title_part.appear or 0.0):
            self.title_part.appear = self.lower_appear
        for node_id in self.buttons:
            self.tracks.append(self._button_track(node_id))
        if self.plan.lanes:
            self.tracks.append(self._ring_track())
            self.tracks.append(self._flash_track())
        self._check_inside()
        for name in LAYERS:
            self.c.add(*self.layers[name])
        parts, tracks, canvas, level = self.parts, self.tracks, self.c, self.level

        def update(t: float) -> None:
            for part in parts:
                canvas.show(part.mob, part.alpha(t, level))
            for track in tracks:
                track(t)

        return update

    def _check_inside(self) -> None:
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

    def _ring_track(self) -> Track:
        x, y = self.ring_at
        g, c, bad = self.g, self.c, self.th.bad

        def track(t: float) -> None:
            if self.ring_start is None:
                self.ring_arc.set_stroke(opacity=0)
                return
            sweep = lin(t, self.ring_start, self.ring_start + 1.15)
            shown = smooth(t, self.ring_start, self.ring_start + FADE) * self.level(("lanes",), t)
            self.ring_arc.become(c.arc(x, y, 17 * g, sweep, bad).set_stroke(opacity=shown))

        return track

    def _flash_track(self) -> Track:
        surface, accent = ManimColor(self.th.surface), ManimColor(self.th.accent)

        def track(t: float) -> None:
            for (lane, node_id), body in self.lane_bodies.items():
                hits = self.flashes.get((lane, node_id), [])
                hit = max((bump(t, h - 0.1, h + 0.3) for h in hits), default=0.0)
                shown = (self.level(("lanes", f"lane:{lane}"), t)
                         * smooth(t, self.lower_appear, self.lower_appear + FADE))
                body.set_fill(interpolate_color(surface, accent, 0.7 * hit), opacity=shown)

        return track


def build_flow(canvas: Canvas, spec: SceneSpec) -> Callable[[float], None]:
    """Queue a flow scene on the canvas and return its update function."""
    stage = _Stage(canvas, spec.decl)
    for step in spec.steps:
        stage.add_step(step)
    return stage.finish()

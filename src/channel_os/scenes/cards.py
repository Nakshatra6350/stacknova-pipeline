"""The cards stage: panels compared side by side, whose values change as they are used (M2).

An operation is applied to a card as a packet dropping into it; a counter keeps score and a
line's value jumps (or stays put, which is the point of an idempotent one). Comparisons,
checklists, quizzes and a + b = c statements are drawn here. Geometry comes from
cards_model.layout.
"""

import math
from collections.abc import Callable, Mapping
from typing import Any

from channel_os.scenes.cards_model import layout
from channel_os.scenes.easing import bump
from channel_os.scenes.kit import Canvas, SceneError
from channel_os.scenes.spec import SceneSpec, Step
from channel_os.scenes.stage import DIM_LEVEL, Part, Stage, Update, build

DROP_SECONDS = 0.35


class _Cards(Stage):
    NAME = "cards"

    def __init__(self, canvas: Canvas, decl: Mapping[str, Any]) -> None:
        super().__init__(canvas)
        self.decl = decl
        self.plan = layout(canvas.fmt, decl)
        self.s = canvas.fmt.scale
        self.card_parts: dict[str, list[Part]] = {}
        self.line_at: dict[tuple[str, str], float] = {}  # (card, line) -> y of the line
        self.glows: dict[tuple[str, str], list[float]] = {}  # when each line's band pulses
        self.applied: dict[str, int] = {}
        self.hidden = {card["id"] for card in decl["cards"] if card.get("hidden")}
        self.header(decl.get("header") or [], self.plan.header_y)
        if self.plan.title:
            x, y = self.plan.title
            title = canvas.text(str(decl["title"]), x, y, 30 * self.s, self.th.ink,
                                font=canvas.sans, weight="MEDIUM", anchor="l",
                                max_width=canvas.fmt.content.w - 20)
            self.part(title, "details", ("frame",))
        for index, card in enumerate(decl["cards"]):
            self._card(index, card)

    # ---- construction ----------------------------------------------------------------------

    def _groups(self, card_id: str) -> tuple[str, ...]:
        return ("cards", f"card:{card_id}")

    def _own(self, card_id: str, mob: Any, layer: str) -> Part:
        """A part that belongs to a card: it appears with the card and dims with it."""
        appear = math.inf if card_id in self.hidden else None
        made = self.part(mob, layer, self._groups(card_id), appear)
        self.card_parts.setdefault(card_id, []).append(made)
        return made

    def _card(self, index: int, card: Mapping[str, Any]) -> None:
        c, th, s, plan = self.c, self.th, self.s, self.plan
        card_id, rect = card["id"], plan.cards[card["id"]]
        self._own(card_id, c.rrect(rect.cx, rect.cy, rect.w, rect.h, 16 * s, th.strong,
                                   th.surface), "bodies")
        y = rect.y0 + plan.pad + plan.title_h / 2 - 4 * s
        self._own(card_id, c.text(str(card.get("title", card_id)), rect.x0 + 22 * s, y, 24 * s,
                                  th.ink, anchor="l", max_width=rect.w - 84 * s), "details")
        y = rect.y0 + plan.pad + plan.title_h
        lines = card.get("lines", [])
        if lines or card.get("text"):
            self._own(card_id, c.seg(rect.x0, y, rect.x1, y, th.strong), "details")
        if card.get("text"):
            # Medium, like the title above the cards: one face fewer to load for every label.
            self._own(card_id, c.text(str(card["text"]), rect.x0 + 22 * s, y + plan.text_h / 2,
                                      22 * s, th.muted, font=c.sans, weight="MEDIUM",
                                      anchor="l", max_width=rect.w - 44 * s), "details")
        y += plan.text_h
        for line in lines:
            centre = y + plan.line_h / 2
            self.line_at[(card_id, line["id"])] = centre
            self.glows[(card_id, line["id"])] = []
            glow = self._own(card_id, c.rrect(rect.cx, centre, rect.w - 20 * s,
                                              plan.line_h - 8 * s, 9 * s, th.accent, th.accent,
                                              0.16, 2.5), "details")
            glow.gain = self._glow(card_id, line["id"])
            self._own(card_id, c.text(str(line.get("key", line["id"])), rect.x0 + 22 * s, centre,
                                      20 * s, th.muted, anchor="l", max_width=rect.w * 0.45),
                      "details")
            self._value(card_id, line["id"], str(line.get("value", "")), None, None)
            y += plan.line_h
        if index > 0 and self.plan.joins:
            x, jy = self.plan.joins[index - 1]
            glyph = c.text(str(self.decl["joins"][index - 1]), x, jy, 40 * s, th.accent,
                           weight="BOLD")
            self._own(card_id, glyph, "details")

    def _glow(self, card_id: str, line_id: str) -> Callable[[float], float]:
        pulses = self.glows[(card_id, line_id)]
        return lambda t: max((bump(t, when, when + 1.1) for when in pulses), default=0.0)

    def _value(self, card_id: str, line_id: str, value: str, status: str | None,
               when: float | None) -> None:
        c, s, rect = self.c, self.s, self.plan.cards[card_id]
        colour = self.status_colour(status) if status else self.th.ink
        text = c.text(value, rect.x1 - 22 * s, self.line_at[(card_id, line_id)], 22 * s, colour,
                      anchor="r", max_width=rect.w * 0.5)
        if when is None:
            made = self._own(card_id, text, "details")
        else:
            made = self.part(text, "details", self._groups(card_id), when)
        self.replace((f"{card_id}.{line_id}", "value"), made, when or 0.0)

    def _split(self, target: str) -> tuple[str, str | None]:
        card_id, _, line_id = target.partition(".")
        if card_id not in self.plan.cards:
            raise SceneError(f"there is no card {card_id!r}")
        return card_id, line_id or None

    # ---- actions ---------------------------------------------------------------------------

    def _show(self, step: Step) -> None:
        for part in self.card_parts[step.target]:
            if part.appear is not None and part.appear > step.time:
                part.appear = step.time

    def _set(self, step: Step) -> None:
        card_id, line_id = self._split(step.target)
        assert line_id is not None
        self._change(card_id, line_id, step.params, step.time)

    def _change(self, card_id: str, line_id: str, params: Mapping[str, Any], when: float) -> None:
        self._value(card_id, line_id, str(params["value"]), params.get("status"), when)
        self.glows[(card_id, line_id)].append(when)

    def _apply(self, step: Step) -> None:
        c, s, params = self.c, self.s, step.params
        rect = self.plan.cards[step.target]
        groups = self._groups(step.target)
        begin, land = step.time + 0.05, step.time + 0.05 + DROP_SECONDS
        colour = self.role_colour(params.get("role"))
        legs = [(c.point(rect.cx, rect.y0 - 58 * s), c.point(rect.cx, rect.y0))]
        self.packet(legs, [(begin, land)], colour, 9 * s, groups)
        self.ping((rect.cx, rect.y0), 16 * s, colour, land, groups)
        count = self.applied.get(step.target, 0) + 1
        self.applied[step.target] = count
        # On the bottom edge towards the right, clear of a join glyph under the card.
        tally = self.pill(f"x{count}", rect.x1 - 58 * s, rect.y1, 20 * s, self.th.accent, 36 * s,
                          groups, land, weight="BOLD", solid=True)
        self.replace((step.target, "tally"), tally, land)
        if "value" in params:
            self._change(step.target, str(params["line"]), params, land)

    def _mark(self, step: Step) -> None:
        c, s, rect = self.c, self.s, self.plan.cards[step.target]
        status = step.params.get("status", "ok")
        colour = self.status_colour(status)
        x, y = rect.x1 - 30 * s, rect.y0 + self.plan.pad + self.plan.title_h / 2 - 4 * s
        sign = c.cross(x, y, 16 * s, colour) if status == "bad" else c.check(x, y, 22 * s, colour)
        groups = self._groups(step.target)
        self.replace((step.target, "mark"), self.part(sign, "marks", groups, step.time),
                     step.time)
        frame = c.rrect(rect.cx, rect.cy, rect.w, rect.h, 16 * s, colour, colour, 0.05, 3.5)
        self.replace((step.target, "frame"), self.part(frame, "marks", groups, step.time),
                     step.time)
        self.ping((x, y), 18 * s, colour, step.time, groups)

    def _badge(self, step: Step) -> None:
        s, rect = self.s, self.plan.cards[step.target]
        colour = self.status_colour(step.params.get("status"))
        made = self.pill(str(step.params.get("text", "")), rect.cx, rect.y0 - 34 * s, 20 * s,
                         colour, 44 * s, self._groups(step.target), step.time, weight="BOLD",
                         keep_inside=True)
        self.replace((step.target, "above"), made, step.time)

    def _highlight(self, step: Step) -> None:
        card_id, line_id = self._split(step.target)
        if line_id is not None:
            self.glows[(card_id, line_id)].append(step.time)
            return
        self.outline(self.plan.cards[card_id], self.th.accent, step.time, self._groups(card_id),
                     14 * self.s, 22 * self.s)

    def _level(self, step: Step, to: float) -> None:
        group = "cards" if step.target == "all" else f"card:{self._split(step.target)[0]}"
        self.set_level(group, step.time, to)

    def handlers(self) -> Mapping[str, Callable[[Step], None]]:
        return {
            "show": self._show,
            "set": self._set,
            "apply": self._apply,
            "mark": self._mark,
            "badge": self._badge,
            "highlight": self._highlight,
            "dim": lambda step: self._level(step, DIM_LEVEL),
            "focus": lambda step: self._level(step, 1.0),
        }


def build_cards(canvas: Canvas, spec: SceneSpec) -> Update:
    """Queue a cards scene on the canvas and return its update function."""
    return build(_Cards, canvas, spec)

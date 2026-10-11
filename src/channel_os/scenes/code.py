"""The code stage: a short listing in an editor panel, read line by line (M2).

Lines can arrive one after another; a highlight puts a band behind the lines being spoken about
and fades the rest; a note under the panel says what the highlighted line means. Geometry and
the tokeniser come from code_model.
"""

import math
from collections.abc import Callable, Mapping
from typing import Any

from channel_os.scenes.code_model import CODE_PX, layout, line_range, tokens
from channel_os.scenes.kit import MIN_TEXT_SHRINK, Canvas, SceneError
from channel_os.scenes.spec import SceneSpec, Step
from channel_os.scenes.stage import Part, Stage, Update, build

STAGGER = 0.12  # seconds between lines arriving in one `show`
FADED = 0.4


class _Code(Stage):
    NAME = "code"
    LAYERS = ("rails", "flows", "bodies", "bands", "details", "marks", "packets")

    def __init__(self, canvas: Canvas, decl: Mapping[str, Any]) -> None:
        super().__init__(canvas)
        self.plan = layout(canvas.fmt, decl)
        self.s = canvas.fmt.scale
        self.lines = [str(line) for line in decl["lines"]]
        self.line_parts: list[list[Part]] = []
        longest = max(len(line) for line in self.lines)
        fit = min(1.0, self.plan.code_w / (canvas.mono_advance(CODE_PX * self.s) * longest))
        if fit < MIN_TEXT_SHRINK:
            raise SceneError(
                f"the longest line has {longest} characters, which is too long for the panel"
            )
        self.px = CODE_PX * self.s * fit
        self.header(decl.get("header") or [], self.plan.header_y)
        self._panel(str(decl.get("title", "")))
        language = decl.get("language", "text")
        hidden = bool(decl.get("reveal"))
        for index, line in enumerate(self.lines):
            self._line(index, line, language, hidden)

    # ---- construction ----------------------------------------------------------------------

    def _panel(self, title: str) -> None:
        c, th, s, panel = self.c, self.th, self.s, self.plan.panel
        frame = ("frame",)
        self.part(c.rrect(panel.cx, panel.cy, panel.w, panel.h, 16 * s, th.strong, th.surface),
                  "bodies", frame)
        bar = panel.y0 + self.plan.bar_h
        self.part(c.seg(panel.x0, bar, panel.x1, bar, th.strong), "details", frame)
        for index, colour in enumerate((th.bad, th.reply, th.ok)):
            light = c.dot(6 * s, colour).move_to(
                c.point(panel.x0 + (26 + index * 22) * s, panel.y0 + self.plan.bar_h / 2))
            self.part(light, "details", frame)
        if title:
            self.part(c.text(title, panel.x0 + 104 * s, panel.y0 + self.plan.bar_h / 2, 20 * s,
                             th.muted, anchor="l", max_width=panel.w - 130 * s), "details", frame)

    def _line(self, index: int, line: str, language: str, hidden: bool) -> None:
        c, th, s, plan = self.c, self.th, self.s, self.plan
        y = plan.first_y + index * plan.line_h
        tint = {"keyword": th.accent, "string": th.ok, "comment": th.muted, "number": th.reply}
        groups = ("code", f"line:{index}")
        appear = math.inf if hidden else None
        number = c.text(str(index + 1), plan.number_x, y, 18 * s, th.muted, anchor="r")
        parts = [self.part(number, "details", groups, appear)]
        # One size for the whole listing, so every line keeps the same columns.
        advance = c.mono_advance(self.px)
        cursor = 0
        runs = [*tokens(line, language), (len(line), len(line), "")]
        for start, end, kind in runs:
            for begin, finish, colour in ((cursor, start, th.ink), (start, end, tint.get(kind))):
                if colour is not None and line[begin:finish].strip():
                    text = c.code_text(line[begin:finish], plan.code_x + begin * advance, y,
                                       self.px, colour)
                    parts.append(self.part(text, "details", groups, appear))
            cursor = end
        self.line_parts.append(parts)

    # ---- actions ---------------------------------------------------------------------------

    def _show(self, step: Step) -> None:
        for position, index in enumerate(line_range(step.target, len(self.lines))):
            for part in self.line_parts[index]:
                if part.appear is not None and part.appear > step.time:
                    part.appear = step.time + position * STAGGER

    def _highlight(self, step: Step) -> None:
        c, th, s, plan = self.c, self.th, self.s, self.plan
        chosen = line_range(step.target, len(self.lines))
        for index in range(len(self.lines)):
            self.set_level(f"line:{index}", step.time, 1.0 if index in chosen else FADED)
        top = plan.first_y + chosen[0] * plan.line_h - plan.line_h / 2
        height = len(chosen) * plan.line_h
        band = c.rrect(plan.panel.cx, top + height / 2, plan.panel.w - 16 * s, height - 4 * s,
                       9 * s, th.accent, th.accent, 0.14, 2.5)
        self.replace(("code", "band"), self.part(band, "bands", ("frame",), step.time),
                     step.time)

    def _focus(self, step: Step) -> None:
        for index in range(len(self.lines)):
            self.set_level(f"line:{index}", step.time, 1.0)
        self.replace(("code", "band"), None, step.time)

    def _note(self, step: Step) -> None:
        s = self.s
        x, y = self.plan.note
        colour = self.status_colour(step.params.get("status"))
        made = self.pill(str(step.params["text"]), x, y, 22 * s, colour, 46 * s, ("frame",),
                         step.time, keep_inside=True)
        self.replace(("code", "note"), made, step.time)

    def handlers(self) -> Mapping[str, Callable[[Step], None]]:
        return {"show": self._show, "highlight": self._highlight, "focus": self._focus,
                "note": self._note}


def build_code(canvas: Canvas, spec: SceneSpec) -> Update:
    """Queue a code scene on the canvas and return its update function."""
    return build(_Code, canvas, spec)

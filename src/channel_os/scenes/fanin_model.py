"""The fan-in stage without drawing: many senders, one receiver, and a count of arrivals (M2).

Sources stack on the left; each has a rail to one target on the right. Pure Python, pixels of
the final frame, origin top-left.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from channel_os.scenes.flow_model import ROLES, STATUSES
from channel_os.scenes.formats import MONO_ADVANCE, Format, Rect

ACTIONS = frozenset({"fire", "badge", "tag", "highlight"})
MAX_SOURCES = 6
LABEL_PX = 22.0


@dataclass(frozen=True)
class FaninLayout:
    fmt: Format
    header_y: float
    sources: Mapping[str, Rect]
    target: Rect
    name_y: float
    counter: tuple[float, float]
    caption_y: float

    def badge(self) -> tuple[float, float]:
        return self.target.cx, self.target.y0 - 37 * self.fmt.scale


def _step_problem(decl: Mapping[str, Any], step: Mapping[str, Any]) -> str | None:
    action, target = step["action"], step["target"]
    params = step.get("params") or {}
    sources = [source["id"] for source in decl.get("sources", [])]
    target_id = (decl.get("target") or {}).get("id")
    if action not in ACTIONS:
        return f"action {action!r} is not one the fanin stage knows"
    if "role" in params and params["role"] not in ROLES:
        return f"role {params['role']!r} is not one of {', '.join(ROLES)}"
    if "status" in params and params["status"] not in STATUSES:
        return f"status {params['status']!r} is not one of {', '.join(STATUSES)}"
    if action == "fire":
        return None if target in sources else f"fire needs a source, and {target!r} is not one"
    if action == "highlight":
        return None if target == target_id or target in sources else f"unknown target {target!r}"
    return None if target == target_id else f"{action} goes on the target {target_id!r}"


def problems(decl: Mapping[str, Any], steps: Sequence[Mapping[str, Any]]) -> list[str]:
    """Everything wrong with a fan-in declaration and its steps. Empty means drawable."""
    found: list[str] = []
    sources = decl.get("sources", [])
    if not 2 <= len(sources) <= MAX_SOURCES:
        found.append(f"a fan-in needs 2 to {MAX_SOURCES} sources, not {len(sources)}")
    ids = [source["id"] for source in sources]
    if len(set(ids)) != len(ids):
        found.append("a source id is used twice")
    target = decl.get("target")
    if not target or "id" not in target:
        found.append("a fan-in needs a target with an id")
    elif target["id"] in ids:
        found.append(f"the target id {target['id']!r} is also a source id")
    if found:
        return found
    for index, step in enumerate(steps):
        issue = _step_problem(decl, step)
        if issue:
            found.append(f"step {index + 1} ({step['action']} at {step['at']!r}): {issue}")
    return found


def layout(fmt: Format, decl: Mapping[str, Any]) -> FaninLayout:
    """Where the sources, the target and the counter sit in the given format."""
    area, s = fmt.content, fmt.scale
    sources = decl["sources"]
    top, bottom = area.y0 + 150 * s, area.y1 - 60 * s
    centre = (top + bottom) / 2
    spacing = min(96 * s, (bottom - top) / (len(sources) - 1))
    first = centre - spacing * (len(sources) - 1) / 2
    widest = max(len(str(source.get("label", source["id"]))) for source in sources)
    pill_w = min(widest * MONO_ADVANCE * LABEL_PX * s * fmt.text_scale + 56 * s, area.w * 0.46)
    pill_h = 54 * s
    rects = {
        source["id"]: Rect(area.x0 + 20, first + index * spacing - pill_h / 2,
                           area.x0 + 20 + pill_w, first + index * spacing + pill_h / 2)
        for index, source in enumerate(sources)
    }
    width, height = 210 * s, 150 * s
    right = area.x1 - 30
    target = Rect(right - width, centre - height / 2, right, centre + height / 2)
    return FaninLayout(fmt, area.y0 + 22, rects, target, target.y1 + 40 * s,
                       (target.cx, target.y1 + 112 * s), target.y1 + 160 * s)

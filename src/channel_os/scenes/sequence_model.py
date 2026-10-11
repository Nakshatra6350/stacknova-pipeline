"""The sequence stage without drawing: actors side by side, time running down (M2).

Each actor has a head and a lifeline under it. A message is an arrow between two lifelines on
the next free row; a note is a pill on one lifeline; a divider is a labelled rule across all of
them. Pure Python, pixels of the final frame, origin top-left.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from channel_os.scenes.flow_model import ROLES, STATUSES, parse_edge
from channel_os.scenes.formats import LANDSCAPE, PORTRAIT, Format

ACTIONS = frozenset({"message", "note", "divider", "badge", "highlight"})
KINDS = ("client", "service", "store")
ROW_TAKERS = frozenset({"message", "note", "divider"})


@dataclass(frozen=True)
class SequenceLayout:
    fmt: Format
    header_y: float
    head_y: float
    head_w: float
    head_h: float
    line_y1: float  # where the lifelines end
    xs: Mapping[str, float]  # actor id -> x of its lifeline
    rows: tuple[float, ...]  # y of each row, top first

    def badge(self, actor: str) -> tuple[float, float]:
        return self.xs[actor], self.head_y - self.head_h / 2 - 34 * self.fmt.scale


def _geometry(fmt: Format) -> tuple[float, float, float, list[float]]:
    """Head centre, head height, lifeline end, and the row positions, for a format."""
    area, s = fmt.content, fmt.scale
    head_y, head_h = area.y0 + 130 * s, 64 * s
    first, step = area.y0 + 215 * s, 78 * s
    last = area.y1 - 24 * s
    rows = [first + index * step for index in range(int((last - first) // step) + 1)]
    return head_y, head_h, area.y1 - 8, rows


def row_count(fmt: Format) -> int:
    return len(_geometry(fmt)[3])


def rows_used(steps: Sequence[Mapping[str, Any]]) -> int:
    """How many rows the steps take: one each, unless a step asks to share the row above."""
    return sum(
        1 for step in steps
        if step["action"] in ROW_TAKERS and not (step.get("params") or {}).get("same_row")
    )


def _step_problem(decl: Mapping[str, Any], step: Mapping[str, Any]) -> str | None:
    action, target = step["action"], step["target"]
    params = step.get("params") or {}
    actors = [actor["id"] for actor in decl.get("actors", [])]
    if action not in ACTIONS:
        return f"action {action!r} is not one the sequence stage knows"
    if "role" in params and params["role"] not in ROLES:
        return f"role {params['role']!r} is not one of {', '.join(ROLES)}"
    if "status" in params and params["status"] not in STATUSES:
        return f"status {params['status']!r} is not one of {', '.join(STATUSES)}"
    if action == "message":
        edge = parse_edge(target)
        if edge is None or edge[0] is not None:
            return f"message needs a target like 'app->db', not {target!r}"
        _, source, destination = edge
        for actor in (source, destination):
            if actor not in actors:
                return f"unknown actor {actor!r} in {target!r}"
        if source == destination:
            return f"a message needs two different actors ({target!r})"
        return None
    if action == "divider":
        return None if target == "all" else f"divider targets 'all', not {target!r}"
    return None if target in actors else f"unknown actor {target!r}"


def problems(decl: Mapping[str, Any], steps: Sequence[Mapping[str, Any]]) -> list[str]:
    """Everything wrong with a sequence declaration and its steps. Empty means drawable."""
    found: list[str] = []
    actors = decl.get("actors", [])
    if not 2 <= len(actors) <= 4:
        found.append(f"a sequence needs 2 to 4 actors, not {len(actors)}")
    seen: set[str] = set()
    for actor in actors:
        if actor["id"] in seen:
            found.append(f"actor id {actor['id']!r} is used twice")
        seen.add(actor["id"])
        if actor.get("kind", "service") not in KINDS:
            found.append(f"unknown actor kind {actor['kind']!r}; use {', '.join(KINDS)}")
    if found:
        return found
    for index, step in enumerate(steps):
        issue = _step_problem(decl, step)
        if issue:
            found.append(f"step {index + 1} ({step['action']} at {step['at']!r}): {issue}")
    room = min(row_count(PORTRAIT), row_count(LANDSCAPE))
    if rows_used(steps) > room:
        found.append(
            f"the steps need {rows_used(steps)} rows and a sequence has {room}; "
            "split it into two scenes or share rows with same_row"
        )
    return found


def layout(fmt: Format, decl: Mapping[str, Any]) -> SequenceLayout:
    """Where every part of a sequence sits in the given format."""
    area = fmt.content
    actors = decl["actors"]
    head_y, head_h, line_y1, rows = _geometry(fmt)
    column = (area.w - 20) / len(actors)
    xs = {actor["id"]: area.x0 + 10 + column * (index + 0.5)
          for index, actor in enumerate(actors)}
    return SequenceLayout(fmt, area.y0 + 22, head_y, column - 26 * fmt.scale, head_h, line_y1,
                          xs, tuple(rows))

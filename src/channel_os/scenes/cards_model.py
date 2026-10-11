"""The cards stage without drawing: one to four panels compared side by side (M2).

A card has a title, an optional line of text and optional `key value` lines whose values can
change. Cards sit in a row, a column or a two-by-two grid, optionally with a glyph between
neighbours ("+", "=", "vs"). Pure Python, pixels of the final frame, origin top-left.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from itertools import pairwise
from typing import Any

from channel_os.scenes.flow_model import ROLES, STATUSES
from channel_os.scenes.formats import Format, Rect

ACTIONS = frozenset({"show", "set", "apply", "mark", "badge", "highlight", "dim", "focus"})
ARRANGEMENTS = ("row", "column", "grid")
MAX_CARDS = 4
MAX_LINES = 4


@dataclass(frozen=True)
class CardsLayout:
    fmt: Format
    header_y: float
    title: tuple[float, float] | None
    cards: Mapping[str, Rect]
    joins: tuple[tuple[float, float], ...]  # centre of the glyph after card i
    pad: float
    title_h: float
    text_h: float
    line_h: float


def arrangement(fmt: Format, decl: Mapping[str, Any]) -> str:
    """Row in landscape. In portrait: a column for an equation or three cards, a grid for four."""
    if decl.get("arrange"):
        return str(decl["arrange"])
    count = len(decl["cards"])
    if fmt.name == "landscape" or (count <= 2 and not decl.get("joins")):
        return "row"
    return "grid" if count == 4 and not decl.get("joins") else "column"


def _split(target: str) -> tuple[str, str | None]:
    card, _, line = target.partition(".")
    return card, line or None


def _step_problem(decl: Mapping[str, Any], step: Mapping[str, Any]) -> str | None:
    action, target = step["action"], step["target"]
    params = step.get("params") or {}
    lines = {card["id"]: {line["id"] for line in card.get("lines", [])}
             for card in decl.get("cards", [])}
    if action not in ACTIONS:
        return f"action {action!r} is not one the cards stage knows"
    if "status" in params and params["status"] not in STATUSES:
        return f"status {params['status']!r} is not one of {', '.join(STATUSES)}"
    if "role" in params and params["role"] not in ROLES:
        return f"role {params['role']!r} is not one of {', '.join(ROLES)}"
    card, line = _split(target)
    if action in ("dim", "focus") and target == "all":
        return None
    if card not in lines:
        return f"unknown card {card!r}"
    if action == "set":
        if line is None:
            return f"set needs a target like 'card.line', not {target!r}"
        if "value" not in params:
            return "set needs params.value"
    if action == "apply" and "line" in params and params["line"] not in lines[card]:
        return f"card {card!r} has no line {params['line']!r}"
    if line is not None:
        if action not in ("set", "highlight"):
            return f"{action} targets a card, not a line ({target!r})"
        if line not in lines[card]:
            return f"card {card!r} has no line {line!r}"
    return None


def problems(decl: Mapping[str, Any], steps: Sequence[Mapping[str, Any]]) -> list[str]:
    """Everything wrong with a cards declaration and its steps. Empty means drawable."""
    found: list[str] = []
    cards = decl.get("cards", [])
    if not 1 <= len(cards) <= MAX_CARDS:
        found.append(f"the cards stage draws 1 to {MAX_CARDS} cards, not {len(cards)}")
    seen: set[str] = set()
    for card in cards:
        if card["id"] in seen:
            found.append(f"card id {card['id']!r} is used twice")
        seen.add(card["id"])
        card_lines = [line["id"] for line in card.get("lines", [])]
        if len(card_lines) > MAX_LINES:
            found.append(f"card {card['id']!r} has {len(card_lines)} lines; {MAX_LINES} fit")
        if len(set(card_lines)) != len(card_lines):
            found.append(f"card {card['id']!r} uses a line id twice")
    if decl.get("arrange") and decl["arrange"] not in ARRANGEMENTS:
        found.append(f"arrange {decl['arrange']!r} is not one of {', '.join(ARRANGEMENTS)}")
    if decl.get("joins") and len(decl["joins"]) != len(cards) - 1:
        found.append(f"{len(cards)} cards need {len(cards) - 1} joins, not {len(decl['joins'])}")
    if decl.get("joins") and decl.get("arrange") == "grid":
        found.append("joins read along a row or a column, not across a grid")
    if found:
        return found
    for index, step in enumerate(steps):
        issue = _step_problem(decl, step)
        if issue:
            found.append(f"step {index + 1} ({step['action']} at {step['at']!r}): {issue}")
    return found


def layout(fmt: Format, decl: Mapping[str, Any]) -> CardsLayout:
    """Where every card and join sits in the given format."""
    area, s = fmt.content, fmt.scale
    cards = decl["cards"]
    joined = bool(decl.get("joins"))
    pad, title_h, text_h, line_h = 20 * s, 44 * s, 40 * s, 44 * s
    most_lines = max(len(card.get("lines", [])) for card in cards)
    has_text = any(card.get("text") for card in cards)
    height = pad + title_h + (text_h if has_text else 0) + most_lines * line_h + 18 * s
    arrange = arrangement(fmt, decl)
    columns = {"row": len(cards), "column": 1, "grid": 2}[arrange]
    rows = -(-len(cards) // columns)
    across_gap = (84 if joined else 30) * s
    down_gap = 78 * s
    limit = (640 if arrange == "column" else 520) * s
    width = min(limit, (area.w - 20 - across_gap * (columns - 1)) / columns)
    block_w = width * columns + across_gap * (columns - 1)
    block_h = height * rows + down_gap * (rows - 1)
    title = (area.x0 + 10, area.y0 + 62 + 34 * s) if decl.get("title") else None
    top = area.y0 + 62 + (70 * s if title else 0) + 62 * s
    room = area.y1 - 34 * s - top
    top += max(0.0, (room - block_h) / 2)
    left = area.cx - block_w / 2
    rects: dict[str, Rect] = {}
    for index, card in enumerate(cards):
        column, row = index % columns, index // columns
        x0 = left + column * (width + across_gap)
        y0 = top + row * (height + down_gap)
        rects[card["id"]] = Rect(x0, y0, x0 + width, y0 + height)
    boxes = list(rects.values())
    joins = []
    for before, after in pairwise(boxes):
        if arrange == "column":
            joins.append((before.cx, (before.y1 + after.y0) / 2))
        else:
            joins.append(((before.x1 + after.x0) / 2, before.cy))
    return CardsLayout(fmt, area.y0 + 22, title, rects, tuple(joins) if joined else (), pad,
                       title_h, text_h if has_text else 0.0, line_h)

"""The cards stage without drawing: what a declaration and its steps may say (M2).

One to four things compared side by side. A card has a title, an optional line of text and
optional `key value` lines whose values can change. Cards sit in a row, a column or a
two-by-two grid, optionally with a glyph between neighbours ("+", "=", "vs"). The page draws
them (`scenes/web/cards.js`) and lays them out with CSS, so there is no geometry here.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from channel_os.scenes.vocabulary import ROLES, STATUSES

ACTIONS = frozenset({"show", "set", "apply", "mark", "badge", "highlight", "dim", "focus"})
ARRANGEMENTS = ("row", "column", "grid")
MAX_CARDS = 4
MAX_LINES = 4


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
    if action == "badge" and not params.get("text"):
        return "badge needs params.text"
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

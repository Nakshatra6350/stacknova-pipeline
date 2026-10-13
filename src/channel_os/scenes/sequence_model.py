"""The sequence stage without drawing: what a declaration and its steps may say (M2).

Actors side by side, time running down. A message is an arrow between two lifelines on the
next free row; a note is a pill on one lifeline; a divider is a labelled rule across all of
them. The page draws it (`scenes/web/sequence.js`) and lays it out with CSS, so there is no
geometry here.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from channel_os.scenes.vocabulary import ROLES, STATUSES, edge

ACTIONS = frozenset({"message", "note", "divider", "badge", "highlight"})
KINDS = ("client", "service", "store")
ROW_TAKERS = frozenset({"message", "note", "divider"})
MAX_ROWS = 7  # what stays readable under the actors on a phone screen


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
        pair = edge(target)
        if pair is None:
            return f"message needs a target like 'app->db', not {target!r}"
        for actor in pair:
            if actor not in actors:
                return f"unknown actor {actor!r} in {target!r}"
        if pair[0] == pair[1]:
            return f"a message needs two different actors ({target!r})"
        return None
    if action == "divider":
        return None if target == "all" else f"divider targets 'all', not {target!r}"
    if target not in actors:
        return f"unknown actor {target!r}"
    if action == "badge" and not params.get("text"):
        return "badge needs params.text"
    return None


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
    if rows_used(steps) > MAX_ROWS:
        found.append(
            f"the steps need {rows_used(steps)} rows and a sequence has {MAX_ROWS}; "
            "split it into two scenes or share rows with same_row"
        )
    return found

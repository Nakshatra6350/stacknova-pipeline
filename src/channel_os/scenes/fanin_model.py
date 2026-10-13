"""The fan-in stage without drawing: what a declaration and its steps may say (M2).

Many senders, one receiver, and a count of arrivals. Each source has a wire to the target. The
page draws it (`scenes/web/fanin.js`) and lays it out with CSS, so there is no geometry here.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from channel_os.scenes.vocabulary import ROLES, STATUSES

ACTIONS = frozenset({"fire", "badge", "tag", "highlight"})
MAX_SOURCES = 6


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
    if target != target_id:
        return f"{action} goes on the target {target_id!r}"
    return None if params.get("text") else f"{action} needs params.text"


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

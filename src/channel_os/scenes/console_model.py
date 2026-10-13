"""The console stage without drawing: what a declaration and its steps may say (look v2).

A console is a control room for one request's journey: a row of systems, an optional phone with
an app screen, the request and response on the wire, and panels of state. This module is pure
Python so the validator can check a visual without a browser. The page draws it
(`scenes/web/console.js`) and lays it out with CSS, so there is no geometry here.
"""

from collections.abc import Mapping, Sequence
from typing import Any

ACTIONS = frozenset({"tap", "send", "log", "row", "item", "stamp", "screen", "note", "highlight"})
ROLES = ("request", "reply", "retry", "error")
STATUSES = ("ok", "bad", "info")
SCREEN_STATES = ("idle", "error", "success")
PANEL_KINDS = ("table", "list")
MAX_SYSTEMS = 4
MAX_PANELS = 2
PHONE = "phone"


def _edge(target: str) -> tuple[str, str] | None:
    source, arrow, destination = target.partition("->")
    return (source.strip(), destination.strip()) if arrow else None


def _step_problem(decl: Mapping[str, Any], step: Mapping[str, Any]) -> str | None:
    action, target = step["action"], step["target"]
    params = step.get("params") or {}
    systems = [system["id"] for system in decl.get("systems", [])]
    ends = [*systems, *([PHONE] if decl.get("phone") else [])]
    panels = {panel["id"]: panel for panel in decl.get("panels") or []}
    if action not in ACTIONS:
        return f"action {action!r} is not one the console stage knows"
    if "role" in params and params["role"] not in ROLES:
        return f"role {params['role']!r} is not one of {', '.join(ROLES)}"
    if "status" in params and params["status"] not in STATUSES:
        return f"status {params['status']!r} is not one of {', '.join(STATUSES)}"
    if action == "send":
        edge = _edge(target)
        if edge is None:
            return f"send needs a target like 'phone->api', not {target!r}"
        for end in edge:
            if end not in ends:
                return f"unknown system {end!r} in {target!r}"
        if edge[0] == edge[1]:
            return f"cannot send from a system to itself ({target!r})"
        if not params.get("label"):
            return "send needs params.label: the words the packet carries"
        if "lost" in params and not 0 < float(params["lost"]) < 1:
            return "lost is how far the packet gets, between 0 and 1"
        return None
    if action in ("tap", "screen"):
        if target != PHONE or not decl.get("phone"):
            return f"{action} needs the phone, and this scene declares none"
        if action == "screen" and params.get("state", "idle") not in SCREEN_STATES:
            return f"state {params['state']!r} is not one of {', '.join(SCREEN_STATES)}"
        return None
    if action == "log":
        if target not in ends:
            return f"unknown system {target!r}"
        return None if params.get("text") else "log needs params.text"
    if action == "note":
        if target != "wire":
            return f"note goes on the wire panel, not {target!r}"
        return None if params.get("text") else "note needs params.text"
    if action == "highlight":
        base = target.split(".", 1)[0]
        return None if base in ends or base in panels else f"unknown target {target!r}"
    panel = panels.get(target)
    if panel is None:
        return f"unknown panel {target!r}"
    wanted = "table" if action == "row" else "list" if action == "item" else panel["kind"]
    if panel["kind"] != wanted:
        return f"{action} needs a {wanted} panel, and {target!r} is a {panel['kind']}"
    if action == "row":
        if "key" not in params:
            return "row needs params.key: the value of the first column"
        if len(params.get("cells", [])) != len(panel["columns"]) - 1:
            return f"row needs {len(panel['columns']) - 1} cells after the key"
    if action in ("item", "stamp") and not params.get("text"):
        return f"{action} needs params.text"
    return None


def problems(decl: Mapping[str, Any], steps: Sequence[Mapping[str, Any]]) -> list[str]:
    """Everything wrong with a console declaration and its steps. Empty means drawable."""
    found: list[str] = []
    systems = decl.get("systems", [])
    if not 1 <= len(systems) <= MAX_SYSTEMS:
        found.append(f"a console shows 1 to {MAX_SYSTEMS} systems, not {len(systems)}")
    if len(systems) == 1 and not decl.get("phone"):
        found.append("one system needs a phone to talk to")
    ids = [system["id"] for system in systems]
    panels = decl.get("panels") or []
    all_ids = [*ids, *(panel["id"] for panel in panels)]
    if len(set(all_ids)) != len(all_ids) or PHONE in all_ids or "wire" in all_ids:
        found.append("system and panel ids must differ, and 'phone' and 'wire' are taken")
    if len(panels) > MAX_PANELS:
        found.append(f"a console has room for {MAX_PANELS} panels beside the wire")
    for panel in panels:
        if panel.get("kind") not in PANEL_KINDS:
            found.append(f"panel {panel['id']!r}: kind is one of {', '.join(PANEL_KINDS)}")
        elif panel["kind"] == "table" and len(panel.get("columns", [])) < 2:
            found.append(f"panel {panel['id']!r}: a table needs at least two columns")
    if found:
        return found
    for index, step in enumerate(steps):
        issue = _step_problem(decl, step)
        if issue:
            found.append(f"step {index + 1} ({step['action']} at {step['at']!r}): {issue}")
    return found

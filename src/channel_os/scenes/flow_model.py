"""The flow stage without drawing: what a declaration may say, and where everything sits (M2).

A flow is a row of nodes joined by rails, with an optional lower area that holds either lanes
(the same journey replayed as alternative stories) or a table owned by one node. This module is
pure Python so the validator can check a visual, and tests can check the geometry, without Manim.
All geometry is in pixels of the final frame, origin top-left.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

ACTIONS = frozenset(
    {"press", "send", "row", "chip", "badge", "tag", "block", "dim", "focus", "title",
     "timeout", "highlight"}
)
ROLES = ("request", "reply", "retry")
STATUSES = ("ok", "bad", "info")
NODE_SIZES = {"phone": (170.0, 260.0), "service": (210.0, 150.0), "ledger": (230.0, 230.0)}
MIN_RAIL = 90.0  # a packet needs room to be seen travelling
LANE_LABEL_PX = 25.0
MONO_ADVANCE = 0.6  # width of a JetBrains Mono character, in ems


@dataclass(frozen=True)
class Rect:
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def w(self) -> float:
        return self.x1 - self.x0

    @property
    def h(self) -> float:
        return self.y1 - self.y0

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2

    def contains(self, other: "Rect") -> bool:
        return (self.x0 <= other.x0 and self.y0 <= other.y0
                and other.x1 <= self.x1 and other.y1 <= self.y1)


@dataclass(frozen=True)
class Format:
    name: str
    width: int
    height: int
    content: Rect  # everything drawn stays inside this
    scale: float  # size of shapes relative to portrait
    text_scale: float  # extra enlargement of text so it reads on the target screen


# Portrait leaves the top 260 px and everything below y=1040 to captions (M3) and platform UI.
PORTRAIT = Format("portrait", 1080, 1920, Rect(60, 260, 1020, 1040), 1.0, 1.25)
LANDSCAPE = Format("landscape", 1920, 1080, Rect(160, 110, 1760, 970), 1.2, 1.12)
FORMATS = {fmt.name: fmt for fmt in (PORTRAIT, LANDSCAPE)}


@dataclass(frozen=True)
class LaneRow:
    y: float
    label_x: float
    label_end: float
    xs: Mapping[str, float]  # node id -> x of its mini node on this lane


@dataclass(frozen=True)
class LanesLayout:
    title: tuple[float, float]
    ring: tuple[float, float]
    legend_y: float
    rows: Mapping[str, LaneRow]


@dataclass(frozen=True)
class TableLayout:
    rect: Rect
    connector_x: float
    connector_y0: float


@dataclass(frozen=True)
class FlowLayout:
    fmt: Format
    glyph_scale: float
    header_y: float
    row_y: float
    names_y: float
    order: tuple[str, ...]
    nodes: Mapping[str, Rect]
    lanes: LanesLayout | None
    table: TableLayout | None

    def badge(self, node_id: str) -> tuple[float, float]:
        rect = self.nodes[node_id]
        return rect.cx, rect.y0 - 37 * self.glyph_scale


def parse_edge(target: str) -> tuple[str | None, str, str] | None:
    """`[lane:]from->to` as (lane, from, to), or None when the target is not an edge."""
    lane, _, body = target.rpartition(":")
    if "->" not in body:
        return None
    source, destination = body.split("->", 1)
    return lane or None, source.strip(), destination.strip()


def _lane_ids(decl: Mapping[str, Any]) -> list[str]:
    return [row["id"] for row in (decl.get("lanes") or {}).get("rows", [])]


def _step_problem(decl: Mapping[str, Any], step: Mapping[str, Any]) -> str | None:
    action, target = step["action"], step["target"]
    params = step.get("params") or {}
    kinds = {node["id"]: node["kind"] for node in decl.get("nodes", [])}
    lanes = _lane_ids(decl)
    has_table = "table" in decl
    if action not in ACTIONS:
        return f"action {action!r} is not one the flow stage knows"
    if "role" in params and params["role"] not in ROLES:
        return f"role {params['role']!r} is not one of {', '.join(ROLES)}"
    status = params.get("status") or (params.get("row") or {}).get("status")
    if status is not None and status not in STATUSES:
        return f"status {status!r} is not one of {', '.join(STATUSES)}"
    if action in ("send", "block"):
        edge = parse_edge(target)
        if edge is None:
            return f"{action} needs a target like 'you->bank', not {target!r}"
        lane, source, destination = edge
        if lane is not None and lane not in lanes:
            return f"unknown lane {lane!r} in {target!r}"
        for node_id in (source, destination):
            if node_id not in kinds:
                return f"unknown node {node_id!r} in {target!r}"
        if source == destination:
            return f"cannot {action} from a node to itself ({target!r})"
        return None
    if action == "press":
        if kinds.get(target) != "phone":
            return f"press needs a phone node, and {target!r} is not one"
        return None
    if action == "row":
        if (target == "table" and has_table) or kinds.get(target) == "ledger":
            return None
        return f"row needs a ledger node or the table, not {target!r}"
    if action in ("chip", "tag"):
        return None if target in kinds else f"unknown node {target!r}"
    if action == "badge":
        if target in kinds or (target == "table" and has_table):
            return None
        return f"unknown node {target!r}"
    if action in ("title", "timeout"):
        wanted = "lanes" if action == "timeout" else target
        if wanted not in ("lanes", "table"):
            return f"{action} targets 'lanes' or 'table', not {target!r}"
        declared = bool(lanes) if wanted == "lanes" else has_table
        return None if declared else f"this scene declares no {wanted}"
    if action in ("dim", "focus"):
        if target in ("main", "lanes", "table") or target in lanes:
            return None
        return f"unknown group or lane {target!r}"
    if target in kinds or target in lanes or target == "table" or target.startswith("table:"):
        return None  # highlight
    return f"unknown target {target!r}"


def problems(decl: Mapping[str, Any], steps: Sequence[Mapping[str, Any]]) -> list[str]:
    """Everything wrong with a flow declaration and its steps. Empty means it can be drawn."""
    found: list[str] = []
    nodes = decl.get("nodes", [])
    if not 2 <= len(nodes) <= 4:
        found.append(f"a flow needs 2 to 4 nodes, not {len(nodes)}")
    seen: set[str] = set()
    for node in nodes:
        if node["id"] in seen:
            found.append(f"node id {node['id']!r} is used twice")
        seen.add(node["id"])
        if node["kind"] not in NODE_SIZES:
            known = ", ".join(sorted(NODE_SIZES))
            found.append(f"unknown node kind {node['kind']!r}; the flow stage draws {known}")
    if decl.get("lanes") and decl.get("table"):
        found.append("a scene can have lanes or a table, not both (they share the lower area)")
    table = decl.get("table")
    if table and table.get("owner") not in seen:
        found.append(f"the table's owner {table.get('owner')!r} is not a node")
    if found:
        return found
    for index, step in enumerate(steps):
        issue = _step_problem(decl, step)
        if issue:
            found.append(f"step {index + 1} ({step['action']} at {step['at']!r}): {issue}")
    return found


def layout(fmt: Format, decl: Mapping[str, Any]) -> FlowLayout:
    """Where every part of a flow sits in the given format."""
    area, s = fmt.content, fmt.scale
    nodes = decl["nodes"]
    widths = [NODE_SIZES[node["kind"]][0] * s for node in nodes]
    span = area.w - 40
    gaps = len(nodes) - 1
    shrink = min(1.0, (span - gaps * MIN_RAIL) / sum(widths))
    glyph = s * shrink
    rail = (span - sum(widths) * shrink) / gaps
    header_y = area.y0 + 40
    row_y = header_y + 200 * s
    rects: dict[str, Rect] = {}
    x = area.x0 + 20
    for node in nodes:
        w, h = (side * glyph for side in NODE_SIZES[node["kind"]])
        rects[node["id"]] = Rect(x, row_y - h / 2, x + w, row_y + h / 2)
        x += w + rail
    tallest = max(rect.h for rect in rects.values())
    names_y = row_y + tallest / 2 + 42 * s

    lanes: LanesLayout | None = None
    rows = (decl.get("lanes") or {}).get("rows", [])
    if rows:
        title_y = names_y + 103 * s
        first = title_y + 93 * s
        room = area.y1 - 30 * s - first
        spacing = min(117 * s, room / max(1, len(rows) - 1))
        widest = max(len(row["label"]) for row in rows)
        label_x = area.x0 + 10
        label_end = label_x + widest * MONO_ADVANCE * LANE_LABEL_PX * s * fmt.text_scale
        left, right = label_end + 48 * s, area.x1 - 40 * s
        step = (right - left) / gaps
        xs = {node["id"]: left + index * step for index, node in enumerate(nodes)}
        lanes = LanesLayout(
            title=(label_x, title_y),
            ring=(area.x1 - 45 * s, title_y),
            legend_y=title_y + 45 * s,
            rows={
                row["id"]: LaneRow(first + index * spacing, label_x, label_end, xs)
                for index, row in enumerate(rows)
            },
        )

    table: TableLayout | None = None
    if decl.get("table"):
        owner = rects[decl["table"]["owner"]]
        width, height = 520 * s, 200 * s
        centre = min(max(owner.cx, area.x0 + width / 2), area.x1 - width / 2)
        top = names_y + 75 * s
        table = TableLayout(
            rect=Rect(centre - width / 2, top, centre + width / 2, top + height),
            connector_x=owner.x1 - 30 * glyph,
            connector_y0=owner.y1,
        )

    return FlowLayout(fmt, glyph, header_y, row_y, names_y, tuple(rects), rects, lanes, table)

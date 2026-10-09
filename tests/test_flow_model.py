"""The flow stage's declaration checks and its geometry in both formats."""

from itertools import pairwise
from typing import Any

import pytest

from channel_os.scenes.flow_model import LANDSCAPE, PORTRAIT, Format, layout, problems

PHONE = {"id": "you", "kind": "phone", "label": "you"}
SERVER = {"id": "server", "kind": "service", "label": "server"}
BANK = {"id": "bank", "kind": "ledger", "label": "bank"}
GATEWAY = {"id": "gateway", "kind": "service", "label": "gateway"}
LANES = {
    "title": "no reply. two possible stories:",
    "rows": [
        {"id": "a", "label": "1  never arrived"},
        {"id": "b", "label": "2  charged, reply lost"},
    ],
}
TABLE = {"title": "idempotency_keys", "owner": "server"}


def decl(*nodes: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return {"nodes": list(nodes), **extra}


def step(action: str, target: str, **params: Any) -> dict[str, Any]:
    return {"at": "start", "action": action, "target": target, "params": params}


def test_a_complete_declaration_has_no_problems() -> None:
    steps = [
        step("press", "you"),
        step("send", "you->bank", row={"text": "$100", "status": "ok"}),
        step("send", "server->you", role="reply", lost=0.55),
        step("chip", "you", text="error", status="bad"),
        step("badge", "bank", text="CHARGED TWICE", status="bad"),
        step("dim", "main"),
        step("title", "lanes"),
        step("timeout", "lanes"),
        step("send", "a:you->server", lost=0.6),
        step("send", "b:you->bank", mark="ok"),
        step("dim", "a"),
        step("focus", "main"),
        step("highlight", "bank"),
    ]
    assert problems(decl(PHONE, SERVER, BANK, lanes=LANES), steps) == []


def test_table_steps_are_checked() -> None:
    steps = [
        step("title", "table"),
        step("row", "table", id="k", cells=["7f3c", "done"]),
        step("highlight", "table:k"),
        step("badge", "table", text="UNIQUE", status="info"),
        step("tag", "you", text="key 7f3c"),
        step("block", "server->bank"),
    ]
    assert problems(decl(PHONE, SERVER, BANK, table=TABLE), steps) == []


@pytest.mark.parametrize(
    ("bad_step", "word"),
    [
        (step("arrow", "you"), "arrow"),
        (step("press", "server"), "phone"),
        (step("send", "you->nobody"), "nobody"),
        (step("send", "z:you->bank"), "lane"),
        (step("send", "you->you"), "itself"),
        (step("send", "you->bank", role="shout"), "role"),
        (step("row", "you", text="x"), "ledger"),
        (step("badge", "bank", text="x", status="purple"), "status"),
        (step("title", "table"), "table"),
        (step("dim", "elsewhere"), "elsewhere"),
    ],
)
def test_each_mistake_is_named(bad_step: dict[str, Any], word: str) -> None:
    issues = problems(decl(PHONE, SERVER, BANK, lanes=LANES), [bad_step])
    assert len(issues) == 1
    assert word in issues[0]


def test_declaration_mistakes_are_named() -> None:
    assert any("2 to 4" in i for i in problems(decl(PHONE), []))
    assert any("twice" in i for i in problems(decl(PHONE, PHONE), []))
    odd = {"id": "x", "kind": "blimp", "label": "x"}
    assert any("blimp" in i for i in problems(decl(PHONE, odd), []))
    both = decl(PHONE, BANK, lanes=LANES, table={"title": "t", "owner": "you"})
    assert any("lanes or a table" in i for i in problems(both, []))


ROWS = [(PHONE, BANK), (PHONE, SERVER, BANK), (PHONE, SERVER, GATEWAY, BANK)]


@pytest.mark.parametrize("fmt", [PORTRAIT, LANDSCAPE])
@pytest.mark.parametrize("nodes", ROWS)
def test_everything_sits_inside_the_content_area(
    fmt: Format, nodes: tuple[dict[str, Any], ...]
) -> None:
    plan = layout(fmt, decl(*nodes, lanes=LANES))
    rects = [plan.nodes[node["id"]] for node in nodes]
    for rect in rects:
        assert fmt.content.contains(rect), rect
    for left, right in pairwise(rects):
        assert right.x0 - left.x1 >= 90, "rails must be long enough to see a packet travel"
    assert plan.lanes is not None
    for row in plan.lanes.rows.values():
        xs = list(row.xs.values())
        assert xs == sorted(xs)
        assert row.label_end < xs[0] - 20, "the lane label must end before its first node"
        assert fmt.content.y0 < row.y < fmt.content.y1
        assert xs[-1] + 30 <= fmt.content.x1
    assert plan.names_y < plan.lanes.title[1] < min(row.y for row in plan.lanes.rows.values())


@pytest.mark.parametrize("fmt", [PORTRAIT, LANDSCAPE])
def test_the_table_sits_below_the_names_and_inside_the_content(fmt: Format) -> None:
    plan = layout(fmt, decl(PHONE, SERVER, BANK, table=TABLE))
    assert plan.table is not None
    assert fmt.content.contains(plan.table.rect)
    assert plan.table.rect.y0 > plan.names_y + 20
    owner = plan.nodes["server"]
    assert owner.x0 < plan.table.connector_x < owner.x1


def test_portrait_keeps_clear_of_captions_and_platform_ui() -> None:
    assert (PORTRAIT.content.x0, PORTRAIT.content.x1) == (60, 1020)
    assert (PORTRAIT.content.y0, PORTRAIT.content.y1) == (260, 1040)

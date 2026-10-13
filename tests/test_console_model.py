"""The console stage's rules, checked without a browser: what a scene may declare and do."""

import copy
from typing import Any

import pytest

from channel_os.scenes.console_model import problems

DECL: dict[str, Any] = {
    "phone": {"title": "Checkout", "total": "$100.00"},
    "systems": [
        {"id": "api", "name": "API server"},
        {"id": "store", "name": "Key store"},
        {"id": "gateway", "name": "Payment gateway"},
    ],
    "panels": [
        {"id": "keys", "kind": "table", "title": "idempotency_keys",
         "columns": ["key", "status", "response"], "unique": "key"},
        {"id": "charges", "kind": "list", "title": "charges"},
    ],
}
GOOD: list[dict[str, Any]] = [
    {"at": "start", "action": "tap", "target": "phone"},
    {"at": "start", "action": "send", "target": "phone->api", "params": {"label": "POST"}},
    {"at": "start", "action": "send", "target": "gateway->phone",
     "params": {"label": "201", "role": "reply", "lost": 0.8}},
    {"at": "start", "action": "log", "target": "api", "params": {"text": "POST /payments"}},
    {"at": "start", "action": "row", "target": "keys",
     "params": {"key": "7f3c", "cells": ["completed", "201"], "status": "ok"}},
    {"at": "start", "action": "item", "target": "charges", "params": {"text": "#1"}},
    {"at": "start", "action": "stamp", "target": "charges", "params": {"text": "ONCE"}},
    {"at": "start", "action": "screen", "target": "phone", "params": {"state": "success"}},
    {"at": "start", "action": "note", "target": "wire", "params": {"text": "No second charge."}},
    {"at": "start", "action": "highlight", "target": "keys.unique"},
    {"at": "start", "action": "highlight", "target": "store"},
]


def step(action: str, target: str, **params: Any) -> dict[str, Any]:
    return {"at": "start", "action": action, "target": target, "params": params}


def test_a_full_scene_is_drawable() -> None:
    assert problems(DECL, GOOD) == []


@pytest.mark.parametrize(
    ("bad", "words"),
    [
        (step("arrow", "api"), "action 'arrow' is not one the console stage knows"),
        (step("send", "phone->bank", label="POST"), "unknown system 'bank' in 'phone->bank'"),
        (step("send", "api", label="POST"), "send needs a target like 'phone->api'"),
        (step("send", "api->api", label="POST"), "cannot send from a system to itself"),
        (step("send", "phone->api"), "send needs params.label"),
        (step("send", "phone->api", label="POST", lost=1.0), "lost is how far the packet gets"),
        (step("send", "phone->api", label="POST", role="ping"), "role 'ping' is not one of"),
        (step("log", "bank", text="hello"), "unknown system 'bank'"),
        (step("log", "api"), "log needs params.text"),
        (step("row", "keys", key="7f3c", cells=["completed"]), "row needs 2 cells after the key"),
        (step("row", "keys", cells=["completed", "201"]), "row needs params.key"),
        (step("row", "charges", key="7f3c", cells=[]), "row needs a table panel"),
        (step("item", "keys", text="#1"), "item needs a list panel"),
        (step("item", "ledger", text="#1"), "unknown panel 'ledger'"),
        (step("item", "charges", text="#1", status="maybe"), "status 'maybe' is not one of"),
        (step("stamp", "charges"), "stamp needs params.text"),
        (step("screen", "phone", state="loading"), "state 'loading' is not one of"),
        (step("note", "keys", text="hello"), "note goes on the wire panel"),
        (step("highlight", "nowhere"), "unknown target 'nowhere'"),
    ],
)
def test_a_step_the_stage_cannot_draw_says_why(bad: dict[str, Any], words: str) -> None:
    (issue,) = problems(DECL, [bad])
    assert issue.startswith(f"step 1 ({bad['action']} at 'start'): ")
    assert words in issue


def test_the_phone_is_needed_for_taps_and_screens() -> None:
    decl = {key: value for key, value in DECL.items() if key != "phone"}
    assert "needs the phone" in problems(decl, [step("tap", "phone")])[0]
    assert "unknown system 'phone'" in problems(decl, [step("send", "phone->api", label="x")])[0]


@pytest.mark.parametrize(
    ("change", "words"),
    [
        (lambda decl: decl["systems"].extend([{"id": "d", "name": "D"}, {"id": "e", "name": "E"}]),
         "a console shows 1 to 4 systems, not 5"),
        (lambda decl: decl["systems"].clear(), "a console shows 1 to 4 systems, not 0"),
        (lambda decl: decl["panels"].append({"id": "more", "kind": "list", "title": "more"}),
         "room for 2 panels"),
        (lambda decl: decl["panels"][1].update(id="api"), "system and panel ids must differ"),
        (lambda decl: decl["panels"][1].update(id="wire"), "'phone' and 'wire' are taken"),
        (lambda decl: decl["panels"][1].update(kind="chart"), "kind is one of table, list"),
        (lambda decl: decl["panels"][0].update(columns=["key"]), "a table needs at least two"),
    ],
    ids=["five-systems", "no-systems", "three-panels", "shared-id", "reserved-id", "kind",
         "one-column"],
)
def test_a_declaration_the_stage_cannot_lay_out_says_why(change: Any, words: str) -> None:
    decl = copy.deepcopy(DECL)
    change(decl)
    issues = problems(decl, GOOD)
    assert any(words in issue for issue in issues), issues


def test_one_system_alone_needs_the_phone() -> None:
    alone = {"systems": [{"id": "api", "name": "API server"}]}
    assert problems(alone, []) == ["one system needs a phone to talk to"]
    assert problems({**alone, "phone": {"title": "Checkout"}}, []) == []

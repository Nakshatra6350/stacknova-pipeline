"""What the sequence, cards, fan-in and code stages accept.

Where they put things was pinned here while Manim drew them. The page lays scenes out now, so
each stage's placement is checked by page probes (tests/test_page.py) as it is rebuilt.
"""

import json
from pathlib import Path
from typing import Any

import pytest

from channel_os.scenes import cards_model, code_model, fanin_model, sequence_model
from channel_os.scenes.spec import STAGES

ACTORS = [{"id": "a", "label": "request #1", "kind": "client"},
          {"id": "db", "label": "keys", "kind": "store"},
          {"id": "b", "label": "request #2"}]
CARDS = [{"id": "set", "title": "SET email = x",
          "lines": [{"id": "state", "key": "email", "value": "x"}]},
         {"id": "add", "title": "balance += 100",
          "lines": [{"id": "state", "key": "balance", "value": "$0"}]}]
SOURCES = [{"id": "http", "label": "HTTP client"}, {"id": "user", "label": "the user"}]
TARGET = {"id": "api", "label": "your service"}
LINES = ["INSERT INTO keys (key) VALUES ($1)", "ON CONFLICT DO NOTHING;  -- taken"]


def step(action: str, target: str, **params: Any) -> dict[str, Any]:
    return {"at": "start", "action": action, "target": target, "params": params}


# ---- the schema lists exactly the actions the stages draw ---------------------------------


def test_the_schema_lists_every_action_of_every_stage(repo_root: Path) -> None:
    schema = json.loads((repo_root / "schemas" / "episode.schema.json").read_text("utf-8"))
    listed = schema["$defs"]["scene"]["properties"]["steps"]["items"]["properties"]["action"]
    drawn = set().union(*(stage.ACTIONS for stage in STAGES.values()))
    assert set(listed["enum"]) == drawn


# ---- sequence ------------------------------------------------------------------------------


def test_a_sequence_is_accepted_and_its_mistakes_are_named() -> None:
    decl = {"actors": ACTORS}
    good = [step("message", "a->db", text="SELECT", role="request"),
            step("note", "a", text="charge", status="bad"),
            step("divider", "all", text="later"), step("badge", "db", text="X"),
            step("highlight", "b")]
    assert sequence_model.problems(decl, good) == []
    for bad, word in [
        (step("message", "a->zz"), "unknown actor 'zz'"),
        (step("message", "a->a"), "two different actors"),
        (step("message", "a"), "target like 'app->db'"),
        (step("note", "zz"), "unknown actor 'zz'"),
        (step("divider", "a"), "divider targets 'all'"),
        (step("message", "a->b", role="shout"), "role 'shout'"),
        (step("send", "a->b"), "not one the sequence stage knows"),
    ]:
        (found,) = sequence_model.problems(decl, [bad])
        assert word in found
    assert "2 to 4 actors" in sequence_model.problems({"actors": ACTORS[:1]}, [])[0]


def test_a_sequence_counts_its_rows_before_rendering() -> None:
    decl = {"actors": ACTORS}
    eight = [step("note", "a", text=str(n)) for n in range(8)]
    assert "need 8 rows and a sequence has 7" in sequence_model.problems(decl, eight)[0]
    shared = [*eight[:7], step("note", "b", text="same", same_row=True)]
    assert sequence_model.problems(decl, shared) == []


# ---- cards ---------------------------------------------------------------------------------


def test_cards_are_accepted_and_their_mistakes_are_named() -> None:
    decl = {"cards": CARDS}
    good = [step("show", "add"), step("set", "add.state", value="$200", status="bad"),
            step("apply", "add", line="state", value="$100"), step("mark", "set", status="ok"),
            step("badge", "add", text="X"), step("highlight", "add.state"),
            step("dim", "all"), step("focus", "set")]
    assert cards_model.problems(decl, good) == []
    for bad, word in [
        (step("show", "zz"), "unknown card 'zz'"),
        (step("set", "add", value="x"), "target like 'card.line'"),
        (step("set", "add.state"), "needs params.value"),
        (step("set", "add.zz", value="x"), "no line 'zz'"),
        (step("apply", "add", line="zz", value="x"), "no line 'zz'"),
        (step("mark", "add.state"), "targets a card, not a line"),
        (step("mark", "add", status="great"), "status 'great'"),
    ]:
        (found,) = cards_model.problems(decl, [bad])
        assert word in found
    assert "1 to 4 cards" in cards_model.problems({"cards": []}, [])[0]
    assert "need 1 joins" in cards_model.problems({"cards": CARDS, "joins": ["+", "="]}, [])[0]


# ---- fan-in --------------------------------------------------------------------------------


def test_a_fanin_is_accepted_and_its_mistakes_are_named() -> None:
    decl = {"sources": SOURCES, "target": TARGET}
    good = [step("fire", "http", role="retry"), step("badge", "api", text="X"),
            step("tag", "api", text="x"), step("highlight", "user"), step("highlight", "api")]
    assert fanin_model.problems(decl, good) == []
    for bad, word in [
        (step("fire", "api"), "fire needs a source"),
        (step("badge", "http"), "goes on the target 'api'"),
        (step("highlight", "zz"), "unknown target 'zz'"),
    ]:
        (found,) = fanin_model.problems(decl, [bad])
        assert word in found
    assert "2 to 6 sources" in fanin_model.problems({"sources": SOURCES[:1], "target": TARGET},
                                                    [])[0]
    assert "needs a target" in fanin_model.problems({"sources": SOURCES}, [])[0]


# ---- code ----------------------------------------------------------------------------------


def test_code_is_tokenised_per_language() -> None:
    kinds = [(LINES[1][start:end], kind) for start, end, kind in code_model.tokens(LINES[1],
                                                                                  "sql")]
    assert kinds == [("ON", "keyword"), ("CONFLICT", "keyword"), ("DO", "keyword"),
                     ("NOTHING", "keyword"), ("-- taken", "comment")]
    go = "if err != nil { return 0, err } // i-- is not a comment here"
    found = [(go[start:end], kind) for start, end, kind in code_model.tokens(go, "go")]
    assert ("// i-- is not a comment here", "comment") in found
    assert ("0", "number") in found and ("nil", "keyword") in found
    assert [kind for _, _, kind in code_model.tokens("VALUES ($1, 'in_progress')", "sql")] == [
        "keyword", "number", "string"]
    assert code_model.tokens("select nothing here", "text") == []
    # Lua, for scripts that run inside Redis (episode 005).
    lua = "if ok then tok = tok - 1 end -- one token"
    found = [(lua[start:end], kind) for start, end, kind in code_model.tokens(lua, "lua")]
    assert ("if", "keyword") in found and ("end", "keyword") in found
    assert ("1", "number") in found and ("-- one token", "comment") in found


def test_line_ranges() -> None:
    assert list(code_model.line_range("2", 3)) == [1]
    assert list(code_model.line_range("2-3", 3)) == [1, 2]
    assert list(code_model.line_range("all", 3)) == [0, 1, 2]
    with pytest.raises(ValueError, match="within 1-3"):
        code_model.line_range("3-4", 3)


def test_a_listing_is_accepted_and_its_mistakes_are_named() -> None:
    decl = {"lines": LINES, "language": "sql"}
    good = [step("show", "1"), step("highlight", "1-2"), step("note", "2", text="taken"),
            step("focus", "all")]
    assert code_model.problems(decl, good) == []
    for bad, word in [
        (step("highlight", "5"), "within 1-2"),
        (step("highlight", "two"), "is not a line range"),
        (step("note", "1"), "needs params.text"),
        (step("focus", "1"), "focus targets 'all'"),
    ]:
        (found,) = code_model.problems(decl, [bad])
        assert word in found
    assert "61 characters" in code_model.problems({"lines": ["x" * 61]}, [])[0]
    assert "1 to 10 lines" in code_model.problems({"lines": []}, [])[0]
    assert "unknown language" in code_model.problems({"lines": LINES, "language": "cobol"}, [])[0]

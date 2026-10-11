"""What the sequence, cards, fan-in and code stages accept, and where they put things."""

import json
from itertools import pairwise
from pathlib import Path
from typing import Any

import pytest

from channel_os.scenes import cards_model, code_model, fanin_model, sequence_model
from channel_os.scenes.formats import LANDSCAPE, PORTRAIT, Format, Rect
from channel_os.scenes.spec import STAGES

FORMATS = pytest.mark.parametrize("fmt", [PORTRAIT, LANDSCAPE], ids=lambda fmt: fmt.name)
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


def inside(fmt: Format, *rects: Rect) -> bool:
    return all(fmt.content.contains(rect) for rect in rects)


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


@FORMATS
def test_a_sequence_fits_its_format(fmt: Format) -> None:
    plan = sequence_model.layout(fmt, {"actors": ACTORS})
    assert len(plan.rows) == 7
    xs = list(plan.xs.values())
    assert xs == sorted(xs)
    heads = [Rect(x - plan.head_w / 2, plan.head_y - plan.head_h / 2, x + plan.head_w / 2,
                  plan.head_y + plan.head_h / 2) for x in xs]
    assert inside(fmt, *heads)
    assert all(left.x1 < right.x0 for left, right in pairwise(heads))
    assert plan.rows[0] > heads[0].y1 + 20
    assert plan.rows[-1] + 24 * fmt.scale <= fmt.content.y1
    assert plan.badge("a")[1] - 25 * fmt.scale > plan.header_y + 16


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


@FORMATS
@pytest.mark.parametrize("count", [1, 2, 3, 4])
def test_cards_fit_their_format_without_touching(fmt: Format, count: int) -> None:
    cards = [{"id": f"c{n}", "title": "t", "lines": CARDS[0]["lines"]} for n in range(count)]
    plan = cards_model.layout(fmt, {"cards": cards, "title": "a title"})
    rects = list(plan.cards.values())
    assert inside(fmt, *rects)
    for index, one in enumerate(rects):
        for other in rects[index + 1:]:
            apart = one.x1 <= other.x0 or other.x1 <= one.x0
            assert apart or one.y1 <= other.y0 or other.y1 <= one.y0
    assert plan.title is not None
    assert plan.title[1] + 40 * fmt.scale < min(rect.y0 for rect in rects) - 44 * fmt.scale


def test_cards_grow_as_far_as_their_content_allows() -> None:
    # Two short cards in a wide frame were drawn at their plain size, small and lost in it.
    short = cards_model.layout(LANDSCAPE, {"cards": CARDS})
    assert short.unit == pytest.approx(LANDSCAPE.scale * cards_model.ZOOM_LIMIT)
    widths = sum(rect.w for rect in short.cards.values())
    assert widths > LANDSCAPE.content.w * 0.9, "they take the width"
    wordy = [{"id": f"c{n}", "title": "saved responses", "text": "you replay what you kept",
              "lines": [{"id": "v", "key": "per request", "value": "+1 write"}]}
             for n in range(4)]
    # Four wordy cards cannot grow side by side, so in a wide frame they go two by two.
    assert cards_model.arrangement(LANDSCAPE, {"cards": wordy}) == "grid"
    assert cards_model.layout(LANDSCAPE, {"cards": wordy}).unit > LANDSCAPE.scale * 1.1
    tight = cards_model.layout(LANDSCAPE, {"cards": wordy, "arrange": "row"})
    assert tight.unit == LANDSCAPE.scale, "in one row they have no room to grow"
    tall = [{"id": f"c{n}", "title": "t",
             "lines": [{"id": str(k), "key": "k", "value": "v"} for k in range(4)]}
            for n in range(4)]
    grid = cards_model.layout(PORTRAIT, {"cards": tall})
    assert PORTRAIT.scale <= grid.unit < PORTRAIT.scale * cards_model.ZOOM_LIMIT
    assert all(PORTRAIT.content.contains(rect) for rect in grid.cards.values())


def test_how_cards_arrange_themselves() -> None:
    def cards(count: int, **extra: Any) -> dict[str, Any]:
        return {"cards": [{"id": f"c{n}", "title": "t"} for n in range(count)], **extra}

    assert cards_model.arrangement(LANDSCAPE, cards(4)) == "row"
    assert cards_model.arrangement(PORTRAIT, cards(2)) == "row"
    assert cards_model.arrangement(PORTRAIT, cards(3)) == "column"
    assert cards_model.arrangement(PORTRAIT, cards(4)) == "grid"
    assert cards_model.arrangement(PORTRAIT, cards(3, joins=["+", "="])) == "column"
    assert cards_model.arrangement(PORTRAIT, cards(4, arrange="column")) == "column"
    plan = cards_model.layout(PORTRAIT, cards(3, joins=["+", "="]))
    boxes = list(plan.cards.values())
    assert [round(y) for _, y in plan.joins] == [
        round((boxes[0].y1 + boxes[1].y0) / 2), round((boxes[1].y1 + boxes[2].y0) / 2)]


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


@FORMATS
@pytest.mark.parametrize("count", [2, 6])
def test_a_fanin_fits_its_format(fmt: Format, count: int) -> None:
    sources = [{"id": f"s{n}", "label": "queue redelivery"} for n in range(count)]
    plan = fanin_model.layout(fmt, {"sources": sources, "target": TARGET})
    pills = list(plan.sources.values())
    assert inside(fmt, plan.target, *pills)
    assert all(upper.y1 < lower.y0 for upper, lower in pairwise(pills))
    assert max(pill.x1 for pill in pills) + 90 < plan.target.x0, "a packet needs room to travel"
    assert plan.caption_y + 20 * fmt.scale < fmt.content.y1
    assert plan.badge()[1] - 30 * fmt.scale > plan.header_y + 16


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


@FORMATS
@pytest.mark.parametrize("count", [1, 10])
def test_a_listing_fits_its_format(fmt: Format, count: int) -> None:
    plan = code_model.layout(fmt, {"lines": ["x"] * count})
    assert inside(fmt, plan.panel)
    last = plan.first_y + (count - 1) * plan.line_h
    assert last + plan.line_h / 2 <= plan.panel.y1
    assert plan.note[1] + 23 * fmt.scale <= fmt.content.y1
    assert plan.code_x + plan.code_w < plan.panel.x1

"""The sequence, cards, fan-in and code stages: every action draws, and steps do what they say."""

from pathlib import Path
from typing import Any

import pytest

pytest.importorskip("manim", reason="needs the scenes dependency group")

from channel_os.scenes import cards_model, code_model, fanin_model, sequence_model
from channel_os.scenes.formats import LANDSCAPE, PORTRAIT, Format, Rect
from channel_os.scenes.kit import SceneError
from channel_os.scenes.preview import BUILDERS
from channel_os.scenes.render import count_frames, read_frame, render_scene
from channel_os.scenes.spec import STAGES, SceneSpec, Step
from channel_os.scenes.theme import load_themes

QUALITY = 0.25
SEQUENCE = {
    "header": ["RACE", "NO CONSTRAINT"],
    "actors": [
        {"id": "r1", "label": "request #1", "kind": "client"},
        {"id": "db", "label": "keys", "kind": "store"},
        {"id": "api", "label": "api"},
    ],
}
CARDS = {
    "header": ["IDEMPOTENT?", "TWO OPERATIONS"],
    "title": "do it twice",
    "cards": [
        {"id": "set", "title": "SET email = x", "text": "same state every time",
         "lines": [{"id": "state", "key": "email", "value": "a@x.io"}]},
        {"id": "add", "title": "balance += 100", "hidden": True,
         "lines": [{"id": "state", "key": "balance", "value": "$0"}]},
    ],
}
EQUATION = {
    "joins": ["+", "="],
    "cards": [
        {"id": "a", "title": "at-least-once delivery"},
        {"id": "b", "title": "idempotent processing"},
        {"id": "c", "title": "exactly-once effect", "hidden": True},
    ],
}
FANIN = {
    "header": ["WHO RETRIES", "EVERYONE"],
    "sources": [
        {"id": "http", "label": "HTTP client"},
        {"id": "mesh", "label": "service mesh"},
        {"id": "user", "label": "the user"},
    ],
    "target": {"id": "api", "label": "your service", "title": "api"},
    "counter": "copies of one request",
}
CODE = {
    "title": "keys.sql",
    "language": "sql",
    "reveal": True,
    "lines": [
        "INSERT INTO idempotency_keys (key, status)",
        "    VALUES ($1, 'in_progress')",
        "ON CONFLICT (key) DO NOTHING;  -- 0 rows: taken",
    ],
}


def step(time: float, action: str, target: str, **params: Any) -> Step:
    return Step(time, action, target, params, f"t={time}")


STEPS = {
    "sequence": [
        step(0.0, "message", "r1->db", text="SELECT 7f3c"),
        step(0.1, "message", "db->r1", text="not found", role="reply"),
        step(0.2, "note", "r1", text="charge $100", status="bad"),
        step(0.2, "note", "api", text="charge $100", status="bad", same_row=True),
        step(0.3, "divider", "all", text="later"),
        step(0.4, "message", "api->db", text="INSERT 7f3c", role="retry", lost=0.6),
        step(0.5, "badge", "db", text="TWO CHARGES", status="bad"),
        step(0.6, "highlight", "db"),
    ],
    "cards": [
        step(0.0, "apply", "set"),
        step(0.1, "apply", "set", line="state", value="a@x.io", status="ok"),
        step(0.2, "mark", "set", status="ok"),
        step(0.3, "show", "add"),
        step(0.4, "apply", "add", line="state", value="$100"),
        step(0.5, "set", "add.state", value="$200", status="bad"),
        step(0.6, "mark", "add", status="bad"),
        step(0.7, "badge", "add", text="NOT IDEMPOTENT", status="bad"),
        step(0.8, "highlight", "add.state"),
        step(0.9, "dim", "set"),
        step(1.0, "highlight", "add"),
        step(1.1, "focus", "all"),
    ],
    "fanin": [
        step(0.0, "fire", "http"),
        step(0.2, "fire", "mesh", role="request"),
        step(0.4, "fire", "user"),
        step(0.5, "fire", "http"),
        step(0.7, "tag", "api", text="same request"),
        step(0.9, "badge", "api", text="AT-LEAST-ONCE", status="info"),
        step(1.0, "highlight", "user"),
        step(1.1, "highlight", "api"),
    ],
    "code": [
        step(0.0, "show", "1-2"),
        step(0.4, "show", "3"),
        step(0.6, "highlight", "3"),
        step(0.7, "note", "3", text="the database picks one winner", status="ok"),
        step(1.2, "focus", "all"),
    ],
}
DECLS = {"sequence": SEQUENCE, "cards": CARDS, "fanin": FANIN, "code": CODE}


@pytest.fixture(scope="module")
def themes() -> Any:
    return load_themes(Path(__file__).resolve().parents[1] / "config" / "themes.yaml")


def scene(layout: str, decl: dict[str, Any], steps: list[Step], seconds: float = 1.5) -> SceneSpec:
    raw = [{"at": s.at, "action": s.action, "target": s.target, "params": dict(s.params)}
           for s in steps]
    assert STAGES[layout].problems(decl, raw) == [], "the test scene must pass the validator"
    return SceneSpec(layout, 0.0, seconds, decl, tuple(steps))


def render(spec: SceneSpec, fmt: Format, themes: Any, out: Path, cache: Path,
           theme: str = "brand", frames: int = 45) -> Path:
    builder = BUILDERS[spec.layout]
    return render_scene(lambda canvas: builder(canvas, spec), fmt, themes.themes[theme], themes,
                        frames, out, quality=QUALITY, cache_dir=cache)


def brightness(path: Path, index: int, area: Rect) -> float:
    frame = read_frame(path, index)
    rows = slice(round(area.y0 * QUALITY), round(area.y1 * QUALITY))
    columns = slice(round(area.x0 * QUALITY), round(area.x1 * QUALITY))
    return float(frame[rows, columns].mean())


@pytest.mark.parametrize("fmt", [PORTRAIT, LANDSCAPE], ids=lambda fmt: fmt.name)
@pytest.mark.parametrize("layout", sorted(DECLS))
def test_every_action_of_a_stage_draws_in_both_formats(
    tmp_path: Path, themes: Any, cache: Path, fmt: Format, layout: str
) -> None:
    assert {s.action for s in STEPS[layout]} == set(STAGES[layout].ACTIONS)
    out = render(scene(layout, DECLS[layout], STEPS[layout]), fmt, themes,
                 tmp_path / "clip.mp4", cache)
    assert count_frames(out) == 45


@pytest.mark.parametrize("fmt", [PORTRAIT, LANDSCAPE], ids=lambda fmt: fmt.name)
def test_an_equation_reads_down_in_portrait_and_across_in_landscape(
    tmp_path: Path, themes: Any, cache: Path, fmt: Format
) -> None:
    spec = scene("cards", EQUATION, [step(0.5, "show", "c"), step(0.8, "mark", "c", status="ok")])
    plan = cards_model.layout(fmt, EQUATION)
    first, last = plan.cards["a"], plan.cards["c"]
    assert (last.y0 > first.y1) == (fmt is PORTRAIT)
    out = render(spec, fmt, themes, tmp_path / "clip.mp4", cache)
    assert brightness(out, 40, last) > brightness(out, 5, last) + 2, "the result arrives late"


def test_a_message_is_drawn_when_its_step_fires(tmp_path: Path, themes: Any, cache: Path) -> None:
    spec = scene("sequence", SEQUENCE, [step(0.7, "message", "r1->api", text="hello")])
    out = render(spec, PORTRAIT, themes, tmp_path / "clip.mp4", cache)
    plan = sequence_model.layout(PORTRAIT, SEQUENCE)
    row = Rect(plan.xs["r1"], plan.rows[0] - 40, plan.xs["api"], plan.rows[0] + 12)
    assert brightness(out, 44, row) > brightness(out, 15, row) + 2


def test_a_sequence_that_runs_out_of_rows_says_so(
    tmp_path: Path, themes: Any, cache: Path
) -> None:
    steps = [step(0.1 * n, "note", "db", text="row") for n in range(9)]
    with pytest.raises(SceneError, match=r"note on 'db'.*room for 7 rows"):
        render(SceneSpec("sequence", 0.0, 1.0, SEQUENCE, tuple(steps)), PORTRAIT, themes,
               tmp_path / "clip.mp4", cache, frames=2)


def test_a_value_changes_where_it_stands(tmp_path: Path, themes: Any, cache: Path) -> None:
    quiet = scene("cards", CARDS, [step(0.0, "show", "add")])
    loud = scene("cards", CARDS, [step(0.0, "show", "add"),
                                  step(0.3, "set", "add.state", value="$999,999,999")])
    plan = cards_model.layout(PORTRAIT, CARDS)
    card = plan.cards["add"]
    value = Rect(card.cx, card.y1 - 18 - plan.line_h, card.x1 - 10, card.y1 - 18)
    seen = [brightness(render(spec, PORTRAIT, themes, tmp_path / name, cache), 44, value)
            for spec, name in ((quiet, "quiet.mp4"), (loud, "loud.mp4"))]
    assert seen[1] > seen[0] + 2, "a longer value puts more ink where the value is"


def test_a_source_and_the_count_appear_with_the_first_arrival(
    tmp_path: Path, themes: Any, cache: Path
) -> None:
    spec = scene("fanin", FANIN, [step(0.6, "fire", "user")])
    out = render(spec, PORTRAIT, themes, tmp_path / "clip.mp4", cache)
    plan = fanin_model.layout(PORTRAIT, FANIN)
    x, y = plan.counter
    count = Rect(x - 60, y - 40, x + 60, y + 40)
    assert brightness(out, 10, plan.sources["user"]) < 4, "a source is hidden until it fires"
    assert brightness(out, 44, plan.sources["user"]) > 12
    assert brightness(out, 44, count) > brightness(out, 10, count) + 3


def test_code_columns_line_up_and_a_highlight_fades_the_rest(
    tmp_path: Path, themes: Any, cache: Path
) -> None:
    decl = {**CODE, "reveal": False}
    spec = scene("code", decl, [step(0.3, "highlight", "3")])
    out = render(spec, PORTRAIT, themes, tmp_path / "clip.mp4", cache)
    plan = code_model.layout(PORTRAIT, decl)
    first = Rect(plan.code_x, plan.first_y - 18, plan.panel.x1 - 20, plan.first_y + 18)
    # Line 2 is indented four columns: nothing is drawn in those columns of its row.
    advance = 0.6 * code_model.CODE_PX * PORTRAIT.text_scale
    indent = Rect(plan.code_x, plan.first_y + plan.line_h - 16,
                  plan.code_x + 4 * advance - 4, plan.first_y + plan.line_h + 16)
    background = brightness(out, 2, Rect(plan.panel.x0 + 200, plan.panel.y1 - 12,
                                         plan.panel.x1 - 20, plan.panel.y1 - 4))
    text = Rect(indent.x1 + 8, indent.y0, indent.x1 + 8 + 6 * advance, indent.y1)
    assert brightness(out, 2, indent) == pytest.approx(background, abs=2.0)
    assert brightness(out, 2, text) > background + 6, "VALUES starts in the fifth column"
    assert brightness(out, 44, first) < brightness(out, 2, first) - 1, "line 1 fades"


def test_a_code_line_too_long_for_the_panel_fails_the_render(
    tmp_path: Path, themes: Any, cache: Path
) -> None:
    decl = {"lines": ["x" * 120]}
    with pytest.raises(SceneError, match="is too long"):
        render(SceneSpec("code", 0.0, 1.0, decl, ()), PORTRAIT, themes, tmp_path / "clip.mp4",
               cache, frames=2)

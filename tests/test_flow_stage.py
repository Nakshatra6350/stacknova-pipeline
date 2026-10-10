"""The flow stage: every action draws in both formats, and what a step says is what appears."""

from pathlib import Path
from typing import Any

import pytest

pytest.importorskip("manim", reason="needs the scenes dependency group")

from channel_os.scenes.flow import build_flow
from channel_os.scenes.flow_model import layout, problems
from channel_os.scenes.formats import LANDSCAPE, PORTRAIT, Format, Rect
from channel_os.scenes.kit import SceneError
from channel_os.scenes.render import count_frames, read_frame, render_scene
from channel_os.scenes.spec import SceneSpec, Step
from channel_os.scenes.theme import load_themes

QUALITY = 0.25
NODES = [
    {"id": "you", "kind": "phone", "label": "you", "amount": "$100.00", "button": "Pay"},
    {"id": "server", "kind": "service", "label": "server", "title": "api"},
    {"id": "bank", "kind": "ledger", "label": "bank", "title": "ledger"},
]
LANES = {
    "header": ["PAYMENT / RETRY", "REQ #4171"],
    "nodes": NODES,
    "lanes": {
        "title": "no reply. two possible stories:",
        "rows": [
            {"id": "a", "label": "1  never arrived"},
            {"id": "b", "label": "2  charged, reply lost"},
        ],
    },
}
TABLE = {"nodes": NODES, "table": {"title": "idempotency_keys", "owner": "server"}}


def step(time: float, action: str, target: str, **params: Any) -> Step:
    return Step(time, action, target, params, f"t={time}")


def scene(decl: dict[str, Any], steps: list[Step], duration: float = 2.0) -> SceneSpec:
    raw = [{"at": s.at, "action": s.action, "target": s.target, "params": dict(s.params)}
           for s in steps]
    assert problems(decl, raw) == [], "the test scene must be one the validator accepts"
    return SceneSpec("flow", 0.0, duration, decl, tuple(steps))


LANE_STEPS = [
    step(0.0, "press", "you"),
    step(0.1, "send", "you->bank", row={"text": "$100", "status": "ok"}),
    step(0.2, "send", "server->you", role="reply", lost=0.55),
    step(0.3, "chip", "you", text="error", status="bad"),
    step(0.4, "send", "you->bank", role="retry", row={"text": "$100", "status": "bad"}),
    step(0.5, "badge", "bank", text="CHARGED TWICE", status="bad"),
    step(0.6, "dim", "main"),
    step(0.6, "title", "lanes"),
    step(0.7, "timeout", "lanes"),
    step(0.8, "send", "a:you->server", lost=0.62),
    step(0.9, "send", "b:you->bank", mark="ok"),
    step(1.0, "send", "b:server->you", role="reply", lost=0.5),
    step(1.1, "dim", "a"),
    step(1.1, "send", "b:you->bank", role="retry", mark="x2"),
    step(1.3, "highlight", "b"),
    step(1.4, "focus", "main"),
    step(1.5, "highlight", "bank"),
]
TABLE_STEPS = [
    step(0.0, "tag", "you", text="key 7f3c"),
    step(0.1, "press", "you"),
    step(0.1, "send", "you->bank", tag="7f3c", row={"text": "$100", "status": "ok"}),
    step(0.3, "title", "table"),
    step(0.4, "row", "table", id="k", cells=["7f3c", "paid"]),
    step(0.5, "badge", "table", text="UNIQUE", status="info"),
    step(0.6, "chip", "you", clear=True),
    step(0.7, "send", "you->server", role="retry", tag="7f3c"),
    step(0.9, "highlight", "table:k"),
    step(0.9, "block", "server->bank", text="already paid"),
    step(1.0, "send", "server->you", role="reply", chip={"text": "paid", "status": "ok"}),
    step(1.2, "badge", "bank", text="CHARGED ONCE", status="ok"),
    step(1.3, "highlight", "you"),
    step(1.4, "highlight", "table"),
    step(1.5, "tag", "you", text="no key", status="bad"),
    step(1.6, "row", "bank", text="$100", status="bad"),
    step(1.7, "chip", "server", text="200", status="ok"),
]


@pytest.fixture(scope="module")
def themes() -> Any:
    return load_themes(Path(__file__).resolve().parents[1] / "config" / "themes.yaml")


def render(spec: SceneSpec, fmt: Format, themes: Any, out: Path, cache: Path,
           theme: str = "navy", frames: int = 60) -> Path:
    return render_scene(lambda canvas: build_flow(canvas, spec), fmt, themes.themes[theme],
                        themes, frames, out, quality=QUALITY, cache_dir=cache)


def brightness(path: Path, index: int, fmt: Format, area: Rect) -> float:
    """Mean grey level of a pixel area (given at full size) in one frame."""
    frame = read_frame(path, index)
    rows = slice(round(area.y0 * QUALITY), round(area.y1 * QUALITY))
    columns = slice(round(area.x0 * QUALITY), round(area.x1 * QUALITY))
    return float(frame[rows, columns].mean())


@pytest.mark.parametrize("fmt", [PORTRAIT, LANDSCAPE], ids=lambda fmt: fmt.name)
@pytest.mark.parametrize(
    ("decl", "steps"), [(LANES, LANE_STEPS), (TABLE, TABLE_STEPS)], ids=["lanes", "table"]
)
def test_every_action_draws_for_exactly_the_frames_asked(
    tmp_path: Path, themes: Any, cache: Path, fmt: Format, decl: dict[str, Any],
    steps: list[Step],
) -> None:
    used = {s.action for s in LANE_STEPS} | {s.action for s in TABLE_STEPS}
    assert used == {"press", "send", "row", "chip", "badge", "tag", "block", "dim", "focus",
                    "title", "timeout", "highlight"}
    out = render(scene(decl, steps), fmt, themes, tmp_path / "clip.mp4", cache)
    assert count_frames(out) == 60


def test_a_badge_is_absent_until_its_step_fires(tmp_path: Path, themes: Any, cache: Path) -> None:
    spec = scene(LANES, [step(1.0, "badge", "bank", text="CHARGED TWICE", status="bad")])
    out = render(spec, PORTRAIT, themes, tmp_path / "clip.mp4", cache, theme="brand")
    x, y = layout(PORTRAIT, LANES).badge("bank")
    spot = Rect(x - 110, y - 22, x + 110, y + 22)
    before, after = (brightness(out, index, PORTRAIT, spot) for index in (20, 59))
    assert after > before + 8, "the badge must light up its spot once its step has fired"


def test_dimming_the_main_row_darkens_it_and_reveals_the_lanes(
    tmp_path: Path, themes: Any, cache: Path
) -> None:
    spec = scene(LANES, [step(0.5, "dim", "main"), step(0.5, "title", "lanes")])
    out = render(spec, PORTRAIT, themes, tmp_path / "clip.mp4", cache, theme="brand")
    plan = layout(PORTRAIT, LANES)
    assert plan.lanes is not None
    phone = plan.nodes["you"]
    rows = plan.lanes.rows
    lanes = Rect(PORTRAIT.content.x0, rows["a"].y - 30, PORTRAIT.content.x1, rows["b"].y + 30)
    assert brightness(out, 59, PORTRAIT, phone) < brightness(out, 5, PORTRAIT, phone) - 3
    assert brightness(out, 59, PORTRAIT, lanes) > brightness(out, 5, PORTRAIT, lanes) + 1


def test_a_lost_packet_writes_no_row(tmp_path: Path, themes: Any, cache: Path) -> None:
    row = {"text": "$100", "status": "ok"}
    arrives = scene(TABLE, [step(0.2, "send", "you->bank", row=row)])
    dies = scene(TABLE, [step(0.2, "send", "you->bank", row=row, lost=0.5)])
    plan = layout(PORTRAIT, TABLE)
    ledger, g = plan.nodes["bank"], plan.glyph_scale
    first_row = Rect(ledger.x0 + 10, ledger.y0 + 62 * g, ledger.x1 - 10, ledger.y0 + 106 * g)
    seen = [
        brightness(render(spec, PORTRAIT, themes, tmp_path / name, cache), 59, PORTRAIT,
                   first_row)
        for spec, name in ((arrives, "arrives.mp4"), (dies, "dies.mp4"))
    ]
    assert seen[0] > seen[1] + 3, "only the packet that arrives may write to the ledger"


@pytest.mark.parametrize(
    ("steps", "words"),
    [
        ([step(0.5, "highlight", "table:zz")], r"highlight on 'table:zz' \(at 't=0\.5'\).*no row"),
        ([step(0.1 * n, "row", "bank", text="$1") for n in range(4)], r"room for 3 rows"),
    ],
    ids=["unknown-row", "full-ledger"],
)
def test_a_step_that_cannot_be_drawn_says_which(
    tmp_path: Path, themes: Any, cache: Path, steps: list[Step], words: str
) -> None:
    spec = SceneSpec("flow", 0.0, 1.0, TABLE, tuple(steps))
    with pytest.raises(SceneError, match=words):
        render(spec, PORTRAIT, themes, tmp_path / "clip.mp4", cache, frames=2)

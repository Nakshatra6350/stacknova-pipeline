"""A visual block becomes scenes that cover the narration, with steps at scene-local times."""

from typing import Any

import pytest

from channel_os.scenes.spec import SpecError, build_scenes, problems

TEXT = "You tapped Pay, got an error. Here's why. The fix: send a key. Same key, same result."
DURATION = 10.0
NODES = [
    {"id": "you", "kind": "phone", "label": "you"},
    {"id": "server", "kind": "service", "label": "server"},
    {"id": "bank", "kind": "ledger", "label": "bank"},
]
PRESS = {"action": "press", "target": "you"}


def scene(steps: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    return {"layout": "flow", "nodes": NODES, "steps": steps, **extra}


def proportion(phrase: str) -> float:
    return TEXT.index(phrase) / len(TEXT) * DURATION


def test_one_scene_spans_the_whole_narration() -> None:
    scenes = build_scenes(scene([{"at": "tapped Pay", **PRESS}]), TEXT, DURATION, [])
    assert [(s.start, s.end, s.layout) for s in scenes] == [(0.0, 10.0, "flow")]
    assert scenes[0].steps[0].time == pytest.approx(proportion("tapped Pay"))
    assert "nodes" in scenes[0].decl
    assert "steps" not in scenes[0].decl


def test_a_list_cuts_at_each_from_phrase_with_no_gap() -> None:
    visual = [
        scene([{"at": "start", **PRESS}]),
        scene([{"at": "send a key", **PRESS}], **{"from": "The fix"}),
    ]
    first, second = build_scenes(visual, TEXT, DURATION, [])
    assert first.end == second.start == pytest.approx(proportion("The fix"))
    assert second.end == 10.0
    assert first.steps[0].time == 0.0
    assert second.steps[0].time == pytest.approx(proportion("send a key") - proportion("The fix"))
    assert first.duration + second.duration == pytest.approx(DURATION)


def test_a_repeated_phrase_means_its_next_occurrence() -> None:
    steps = [{"at": "key", **PRESS}, {"at": "Same key", **PRESS}, {"at": "key", **PRESS}]
    times = [step.time for step in build_scenes(scene(steps), TEXT, DURATION, [])[0].steps]
    assert times[0] == pytest.approx(proportion("key"))
    assert times[1] == pytest.approx(proportion("Same key"))
    assert times[2] == pytest.approx((TEXT.index("Same key") + 5) / len(TEXT) * DURATION)


def test_steps_out_of_spoken_order_are_reported() -> None:
    steps = [{"at": "Here's why", **PRESS}, {"at": "tapped Pay", **PRESS}]
    assert any("spoken order" in issue for issue in problems(scene(steps), TEXT))


def test_a_later_scene_needs_a_from_phrase() -> None:
    visual = [scene([]), scene([])]
    assert any("`from` phrase" in issue for issue in problems(visual, TEXT))


def test_a_layout_without_a_stage_is_reported() -> None:
    visual = {"layout": "phone-and-bank", "steps": []}
    assert problems(visual, TEXT) == ["scene 1: layout 'phone-and-bank' has no stage yet"]


def test_the_stage_checks_actions_and_targets() -> None:
    steps = [
        {"at": "start", "action": "arrow", "target": "you"},
        {"at": "start", "action": "press", "target": "nobody"},
    ]
    issues = problems(scene(steps), TEXT)
    assert any("arrow" in issue for issue in issues)
    assert any("nobody" in issue for issue in issues)


def test_building_a_broken_visual_raises_with_every_problem() -> None:
    steps = [{"at": "blockchain", **PRESS}]
    with pytest.raises(SpecError, match="blockchain"):
        build_scenes(scene(steps), TEXT, DURATION, [])


def test_pauses_move_the_cut() -> None:
    visual = [scene([]), scene([], **{"from": "The fix"})]
    pause_end = 5.3  # a pause right after "Here's why.", which plain proportion puts at 4.9 s
    cut = build_scenes(visual, TEXT, DURATION, [(4.7, pause_end)])[1].start
    assert cut == pytest.approx(pause_end, abs=0.05)

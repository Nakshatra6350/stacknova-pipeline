"""Planning a target's clips: every frame of the narration belongs to exactly one scene."""

import copy
from typing import Any

import pytest

from channel_os.scenes.plan import Clip, PlanError, declared_theme, plan_clips

SCRIPT = "You tapped Pay and got an error. So you tapped again. The fix is one key per payment."
NODES = [
    {"id": "you", "kind": "phone", "label": "you"},
    {"id": "bank", "kind": "ledger", "label": "bank"},
]


def scene(steps: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    return {"layout": "flow", "nodes": NODES, "steps": steps, **extra}


def press(at: str) -> dict[str, Any]:
    return {"at": at, "action": "press", "target": "you"}


def short_episode(visual: Any) -> dict[str, Any]:
    return {
        "id": "001-test",
        "segments": [],
        "shorts": [{"id": "short-1", "source": "standalone", "script": SCRIPT, "visual": visual}],
    }


def entry(*segments: tuple[str, float, float], duration: float) -> dict[str, Any]:
    return {
        "duration": duration,
        "segments": [
            {"id": unit, "start": start, "duration": length, "pauses": [[2.0, 2.3], [3.6, 3.9]]}
            for unit, start, length in segments
        ],
    }


def test_one_scene_covers_the_whole_narration() -> None:
    clips = plan_clips(short_episode(scene([press("tapped Pay")])), "short-1",
                       entry(("short-1", 0.0, 6.0), duration=6.0))
    assert [(clip.unit, clip.frames) for clip in clips] == [("short-1", 180)]
    assert clips[0].spec.steps[0].action == "press"


def test_a_later_scene_takes_over_at_its_phrase() -> None:
    visual = [scene([press("tapped Pay")]), scene([press("one key")], **{"from": "The fix"})]
    clips = plan_clips(short_episode(visual), "short-1", entry(("short-1", 0.0, 6.0), duration=6.0))
    first, second = clips
    # "The fix" follows the second measured pause, which ends at 3.9 s.
    assert first.frames == round(3.9 * 30)
    assert first.frames + second.frames == 180
    assert second.spec.start == pytest.approx(3.9)
    assert 0.0 <= second.spec.steps[0].time <= second.spec.duration


def test_the_pause_after_a_segment_stays_with_its_scene(episode: dict[str, Any]) -> None:
    # Segments of 4.0 s with the 0.25 s gap the voice stage leaves between them.
    record = entry(("s01", 0.0, 4.0), ("s02", 4.25, 4.0), ("s03", 8.5, 4.0), duration=12.5)
    clips = plan_clips(episode, "long", record)
    assert [clip.unit for clip in clips] == ["s01", "s02", "s03"]
    assert clips[0].frames == round(4.25 * 30)
    assert clips[2].frames == 120
    assert sum(clip.frames for clip in clips) == round(12.5 * 30)


def test_a_short_cut_from_segments_draws_those_segments(episode: dict[str, Any]) -> None:
    clips = plan_clips(episode, "short-1", entry(("s02", 0.0, 4.0), duration=4.0))
    assert [(clip.unit, clip.frames) for clip in clips] == [("s02", 120)]


def test_frames_never_drift_over_many_scenes() -> None:
    # Starts that fall between frames (4.333 s, 8.667 s, ...) are each rounded to a frame edge,
    # so the clips still add up to the narration exactly.
    segments = [
        {"id": f"s{n:02d}", "narration": SCRIPT, "visual": scene([press("tapped Pay")])}
        for n in range(1, 11)
    ]
    record = entry(*((f"s{n:02d}", round((n - 1) * 4.3333, 3), 4.0) for n in range(1, 11)),
                   duration=43.0)
    clips = plan_clips({"id": "001-test", "segments": segments, "shorts": []}, "long", record)
    assert sum(clip.frames for clip in clips) == 43 * 30
    assert all(isinstance(clip, Clip) and clip.frames in (130, 120) for clip in clips)


@pytest.mark.parametrize(
    ("change", "words"),
    [
        (lambda episode, record: episode["shorts"][0].pop("visual"), "short-1: it has no visual"),
        (lambda episode, record: record["segments"].clear(), "short-1: timing.json has no narr"),
        (
            lambda episode, record: episode["shorts"][0]["visual"]["steps"].append(
                press("never spoken")
            ),
            "short-1: scene 1: `at` phrase 'never spoken'",
        ),
    ],
    ids=["no-visual", "no-timing", "unspoken-phrase"],
)
def test_what_cannot_be_planned_names_the_unit(change: Any, words: str) -> None:
    episode = copy.deepcopy(short_episode(scene([press("tapped Pay")])))
    record = entry(("short-1", 0.0, 6.0), duration=6.0)
    change(episode, record)
    with pytest.raises(PlanError, match=words):
        plan_clips(episode, "short-1", record)


def test_the_theme_an_episode_names_is_found_per_target() -> None:
    episode = short_episode(scene([press("tapped Pay")]))
    assert declared_theme(episode, "long") is None
    assert declared_theme(episode, "short-1") is None
    episode["theme"] = "navy"
    episode["shorts"][0]["theme"] = "brand"
    assert declared_theme(episode, "long") == "navy"
    assert declared_theme(episode, "short-1") == "brand"
    assert declared_theme(episode, "short-9") is None

"""Planning a target: every frame of the narration belongs to exactly one scene, and the
planner adds what an episode never writes (captions, the logo intro, the outro, the prompts)."""

import copy
from itertools import pairwise
from typing import Any

import pytest

from channel_os.scenes.plan import (
    AudioPart,
    Clip,
    PlanError,
    captions,
    declared_theme,
    plan_clips,
    plan_video,
)

SCRIPT = "You tapped Pay and got an error. So you tapped again. The fix is one key per payment."
SYSTEMS = [{"id": "api", "name": "API server"}, {"id": "gateway", "name": "Payment gateway"}]
BRAND: dict[str, Any] = {
    "tagline": "Light up your whole stack.",
    "handles": {"confirmed": {"youtube": "@StackNovaDev", "instagram": "@stacknova.dev"}},
    "video": {
        "intro": {"seconds": 4.0, "sound": None},
        "outro": {"seconds": 10, "music": "lofi-nod", "cadence": "two deep dives a week"},
        "handle": {"at": [0.35, 0.7], "seconds": 5},
        "shorts_prompt": {"seconds": 3},
    },
}


def scene(steps: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    return {"layout": "console", "phone": {"title": "Checkout"}, "systems": SYSTEMS,
            "steps": steps, **extra}


def press(at: str) -> dict[str, Any]:
    return {"at": at, "action": "tap", "target": "phone"}


def short_episode(visual: Any) -> dict[str, Any]:
    return {
        "id": "001-test",
        "segments": [],
        "shorts": [{"id": "short-1", "source": "standalone", "script": SCRIPT, "visual": visual,
                    "hook_on_screen": "This retry charged you twice"}],
    }


def long_episode(count: int, seconds: float = 20.0) -> tuple[dict[str, Any], dict[str, Any]]:
    """An episode of `count` segments, each `seconds` long with no gap, and its timing record."""
    segments = [
        {"id": f"s{n:02d}", "title": f"Part {n}", "narration": SCRIPT, "emphasis": ["one key"],
         "visual": scene([press("tapped Pay")])}
        for n in range(1, count + 1)
    ]
    episode = {"id": "007-test", "segments": segments, "shorts": [],
               "packaging": {"titles": ["Why Your Payment Got Charged Twice"]},
               "next": {"title": "The Outbox Pattern"}}
    record = entry(*((f"s{n:02d}", (n - 1) * seconds, seconds) for n in range(1, count + 1)),
                   duration=count * seconds)
    return episode, record


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
    assert clips[0].spec.steps[0].action == "tap"


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
    episode["theme"] = "nova"
    episode["shorts"][0]["theme"] = "control"
    assert declared_theme(episode, "long") == "nova"
    assert declared_theme(episode, "short-1") == "control"
    assert declared_theme(episode, "short-9") is None


# ---- what the planner adds around the scenes ---------------------------------------------------


def test_a_long_video_gets_the_logo_after_the_hook_and_an_outro() -> None:
    episode, record = long_episode(3)
    plan = plan_video(episode, "long", record, BRAND)
    # The owner's rule: the hook always comes first, then the logo.
    assert [clip.unit for clip in plan.clips] == ["s01", "intro", "s02", "s03", "outro"]
    intro, outro = plan.clips[1], plan.clips[-1]
    assert (intro.spec.layout, intro.frames, intro.spec.decl["scene"]) == ("brand", 120, "intro")
    assert intro.spec.decl["tagline"] == "LIGHT UP YOUR WHOLE STACK."
    assert (outro.frames, outro.spec.decl["scene"]) == (300, "outro")
    assert outro.spec.decl["instagram"] == "@stacknova.dev"
    assert outro.spec.decl["youtube"] == "@StackNovaDev"
    assert outro.spec.decl["next"] == {"title": "The Outbox Pattern"}
    assert plan.frames == 3 * 600 + 120 + 300


def test_the_audio_is_cut_where_the_logo_goes() -> None:
    episode, record = long_episode(3)
    plan = plan_video(episode, "long", record, BRAND)
    assert plan.audio == (
        AudioPart("narration", 0.0, 20.0),
        AudioPart("intro", 0.0, 4.0),
        AudioPart("narration", 20.0, 60.0),
        AudioPart("outro", 0.0, 10),
    )
    # Picture and sound are the same length, to the frame.
    assert sum(part.end - part.start for part in plan.audio) * 30 == pytest.approx(plan.frames)


def test_the_progress_bar_runs_through_the_whole_video() -> None:
    episode, record = long_episode(3)
    plan = plan_video(episode, "long", record, BRAND)
    scenes = [clip for clip in plan.clips if clip.spec.layout != "brand"]
    assert scenes[0].chrome["progress"][0] == 0.0
    # The second segment starts after the hook and the logo, not straight after the hook.
    assert scenes[1].chrome["progress"][0] == pytest.approx((600 + 120) / plan.frames)
    for earlier, later in pairwise(scenes[1:]):
        assert earlier.chrome["progress"][1] == pytest.approx(later.chrome["progress"][0])
    assert [clip.chrome["part"] for clip in scenes] == [1, 2, 3]
    assert scenes[0].chrome["title"] == "Part 1"
    assert scenes[0].chrome["pill"] == "EP 007 · Why Your Payment Got Charged Twice"


def test_a_one_segment_video_has_no_logo_to_cut_to() -> None:
    episode, record = long_episode(1)
    plan = plan_video(episode, "long", record, BRAND)
    assert [clip.unit for clip in plan.clips] == ["s01", "outro"]
    assert [part.source for part in plan.audio] == ["narration", "outro"]


def test_the_instagram_handle_keeps_out_of_the_hook_and_fits_its_scene() -> None:
    # Ten 20 s segments: 35% is at 70 s (10 s into s04), 70% is at 140 s (the start of s08).
    episode, record = long_episode(10)
    plan = plan_video(episode, "long", record, BRAND)
    shown = {clip.unit: clip.chrome["handle"] for clip in plan.clips
             if clip.chrome.get("handle")}
    assert shown == {"s04": [[10.0, 15.0]], "s08": [[0.5, 5.5]]}

    # Two segments: 35% falls in the hook, so the handle waits for the next scene.
    episode, record = long_episode(2)
    plan = plan_video(episode, "long", record, BRAND)
    assert plan.clips[0].chrome["handle"] == []
    assert plan.clips[2].chrome["handle"] == [[0.5, 5.5], [10.5, 15.5]]


def test_a_handle_no_scene_has_room_for_is_left_out() -> None:
    # A 5 s handle never fits a 5 s scene, and a handle cut off by a scene change looks broken.
    episode, record = long_episode(6, seconds=5.0)
    plan = plan_video(episode, "long", record, BRAND)
    assert all(not clip.chrome.get("handle") for clip in plan.clips)


def test_a_short_gets_the_follow_prompt_and_no_brand_scenes() -> None:
    visual = [scene([press("tapped Pay")]), scene([press("one key")], **{"from": "The fix"})]
    plan = plan_video(short_episode(visual), "short-1", entry(("short-1", 0.0, 6.0), duration=6.0),
                      BRAND)
    assert [clip.spec.layout for clip in plan.clips] == ["console", "console"]
    assert plan.audio == (AudioPart("narration", 0.0, 6.0),)
    first, last = plan.clips
    assert "cta" not in first.chrome and "handle" not in first.chrome
    # The prompt covers the last three seconds of the last scene, however long that scene is.
    assert last.chrome["cta"] == [pytest.approx(0.0, abs=0.01), pytest.approx(2.1, abs=0.01)]
    assert last.chrome["cta_ask"] == "Subscribe"
    reel = {**BRAND, "video": {**BRAND["video"], "shorts_prompt": {"seconds": 3, "ask": "Follow"}}}
    record = entry(("short-1", 0.0, 6.0), duration=6.0)
    assert plan_video(short_episode(visual), "short-1", record, reel).clips[-1].chrome[
        "cta_ask"] == "Follow"
    assert last.chrome["title"] == "This retry charged you twice"
    assert last.chrome["pill_short"] == "EP 001"


def test_every_scene_carries_the_captions_spoken_during_it() -> None:
    visual = [scene([press("tapped Pay")]), scene([press("one key")], **{"from": "The fix"})]
    plan = plan_video(short_episode(visual), "short-1", entry(("short-1", 0.0, 6.0), duration=6.0),
                      BRAND)
    first, last = (clip.chrome["captions"] for clip in plan.clips)
    assert [text for _, text in first] == ["You tapped Pay and got an error.",
                                            "So you tapped again."]
    assert [text for _, text in last] == ["The fix is one key per payment."]
    # Times are seconds into the scene, and a scene opens with a caption already on screen.
    assert first[0][0] == 0.0 and last[0][0] == 0.0
    assert first[1][0] == pytest.approx(2.3, abs=0.05)


def test_a_caption_carried_into_a_scene_keeps_its_real_start() -> None:
    # The second scene begins in the middle of the last sentence. Its caption started before
    # the scene did, and the page must not bring it in again as if it were new.
    visual = [scene([press("tapped Pay")]), scene([press("per payment")], **{"from": "one key"})]
    plan = plan_video(short_episode(visual), "short-1", entry(("short-1", 0.0, 6.0), duration=6.0),
                      BRAND)
    (carried,) = plan.clips[1].chrome["captions"]
    assert carried[1] == "The fix is one key per payment."
    assert carried[0] < 0


# ---- transitions ---------------------------------------------------------------------------

MOVING: dict[str, Any] = {**BRAND, "video": {**BRAND["video"], "transition": "slide"}}


def moves(plan: Any) -> list[tuple[Any, ...]]:
    return [(clip.unit, clip.chrome["enter"], clip.chrome["exit"], clip.chrome["from_black"],
             clip.chrome["to_black"]) for clip in plan.clips if clip.spec.layout != "brand"]


def test_a_long_video_changes_scene_visibly_and_goes_through_black_at_brand_scenes() -> None:
    episode, record = long_episode(3)
    episode["segments"][1]["visual"] = [scene([press("tapped Pay")]),
                                        scene([press("one key")], **{"from": "The fix"})]
    plan = plan_video(episode, "long", record, MOVING)
    assert [clip.unit for clip in plan.clips] == ["s01", "intro", "s02", "s02", "s03", "outro"]
    assert moves(plan) == [
        # The first scene just starts, so frame 1 is a whole picture; then the logo.
        ("s01", None, "part", False, True),
        ("s02", "part", "scene", True, False),
        ("s02", "scene", "part", False, False),
        ("s03", "part", "part", False, True),
    ]
    assert {clip.chrome["move"] for clip in plan.clips if clip.spec.layout != "brand"} == {"slide"}


def test_a_short_starts_and_ends_on_a_whole_picture_so_it_loops() -> None:
    visual = [scene([press("tapped Pay")]), scene([press("one key")], **{"from": "The fix"})]
    plan = plan_video(short_episode(visual), "short-1", entry(("short-1", 0.0, 6.0), duration=6.0),
                      MOVING)
    assert moves(plan) == [("short-1", None, "scene", False, False),
                           ("short-1", "scene", None, False, False)]


def test_transitions_can_be_turned_off_and_an_unknown_style_is_refused() -> None:
    episode, record = long_episode(2)
    for off in (BRAND, {**BRAND, "video": {**BRAND["video"], "transition": "none"}}):
        plan = plan_video(episode, "long", record, off)
        assert all("move" not in clip.chrome for clip in plan.clips)
    spin = {**BRAND, "video": {**BRAND["video"], "transition": "spin"}}
    with pytest.raises(PlanError, match=r"video\.transition 'spin' is not one of slide, wipe"):
        plan_video(episode, "long", record, spin)


def test_captions_mark_the_emphasis_and_split_long_sentences() -> None:
    text = "The fix: send an idempotency key, one random ID per payment, reused on every retry."
    whole = captions(text, 8.0, [], emphasis=["idempotency key"])
    assert [line for _, line in whole] == [
        "The fix: send an <b>idempotency key</b>, one random ID per payment, reused on every retry."
    ]
    pieces = captions(text, 8.0, [], limit=44)
    assert [line for _, line in pieces] == [
        "The fix: send an idempotency key,",
        "one random ID per payment,",
        "reused on every retry.",
    ]
    times = [when for when, _ in pieces]
    assert times == sorted(times) and times[0] == 0.0 and times[-1] < 8.0
    # Text is escaped for the page; only the emphasis is markup.
    assert captions("Is a < b & c?", 2.0, [])[0][1] == "Is a &lt; b &amp; c?"

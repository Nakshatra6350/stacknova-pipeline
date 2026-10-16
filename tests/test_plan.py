"""Planning a target: every frame of the narration belongs to exactly one scene, and the
planner adds what an episode never writes (captions, the logo intro, the outro, the prompts)."""

import copy
from itertools import pairwise
from pathlib import Path
from typing import Any

import pytest
import yaml

from channel_os.scenes.plan import (
    STYLES,
    AudioPart,
    Clip,
    PlanError,
    captions,
    declared_theme,
    mix_styles,
    plan_clips,
    plan_video,
    transition_styles,
    welcome_speed,
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
    assert last.chrome["cta_platform"] == "youtube"


def test_the_reel_cut_of_a_short_asks_for_a_follow_the_instagram_way() -> None:
    # config/brand.yaml: "the Reel cut of a Short says Follow".
    visual = [scene([press("tapped Pay")])]
    record = entry(("short-1", 0.0, 6.0), duration=6.0)
    brand = {**BRAND, "video": {**BRAND["video"],
                                "shorts_prompt": {"seconds": 3, "reel_ask": "Follow"}}}
    last = plan_video(short_episode(visual), "short-1", record, brand, reel=True).clips[-1]
    assert last.chrome["cta_ask"] == "Follow"
    assert last.chrome["cta_platform"] == "instagram"
    # A long video has no Reel cut.
    episode, record = long_episode(3)
    with pytest.raises(PlanError, match="only a Short"):
        plan_video(episode, "long", record, BRAND, reel=True)


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
    styles = [(clip.chrome["enter_style"], clip.chrome["exit_style"])
              for clip in plan.clips if clip.spec.layout != "brand"]
    assert styles == [(None, "slide"), ("slide", "slide"), ("slide", "slide"), ("slide", "slide")]


def test_a_short_starts_and_ends_on_a_whole_picture_so_it_loops() -> None:
    visual = [scene([press("tapped Pay")]), scene([press("one key")], **{"from": "The fix"})]
    plan = plan_video(short_episode(visual), "short-1", entry(("short-1", 0.0, 6.0), duration=6.0),
                      MOVING)
    assert moves(plan) == [("short-1", None, "scene", False, False),
                           ("short-1", "scene", None, False, False)]
    first, last = plan.clips
    assert (first.chrome["enter_style"], last.chrome["exit_style"]) == (None, None)


def test_transitions_can_be_turned_off_and_an_unknown_style_is_refused() -> None:
    episode, record = long_episode(2)
    for off in (BRAND, {**BRAND, "video": {**BRAND["video"], "transition": "none"}}):
        plan = plan_video(episode, "long", record, off)
        assert all("enter_style" not in clip.chrome for clip in plan.clips)
    for wrong in ("spin", ["slide", "spin"], []):
        spin = {**BRAND, "video": {**BRAND["video"], "transition": wrong}}
        with pytest.raises(PlanError, match=r"video\.transition .* must be one of slide, wipe"):
            plan_video(episode, "long", record, spin)


MIXED: dict[str, Any] = {**BRAND,
                         "video": {**BRAND["video"], "transition": ["slide", "wipe", "zoom"]}}


def test_the_owner_asked_for_all_three_styles_mixed_at_random(repo_root: Any) -> None:
    # 13 October 2026: "T1, T2, T3, keep all, make mix of them on random".
    config = yaml.safe_load((repo_root / "config" / "brand.yaml").read_text(encoding="utf-8"))
    assert config["video"]["transition"] == ["slide", "wipe", "zoom"]
    assert transition_styles(config["video"]["transition"]) == STYLES


def test_a_mix_gives_both_sides_of_a_change_the_same_style() -> None:
    episode, record = long_episode(10)
    scenes = [clip for clip in plan_video(episode, "long", record, MIXED).clips
              if clip.spec.layout != "brand"]
    for earlier, later in pairwise(scenes):
        assert earlier.chrome["exit_style"] == later.chrome["enter_style"]
    used = [clip.chrome["exit_style"] for clip in scenes]
    # Every style turns up over a video, and none twice running, so the mix is seen.
    assert set(used) == set(STYLES)
    assert all(one != two for one, two in pairwise(used))


def test_a_mix_is_the_same_every_time_a_video_is_rendered() -> None:
    # Random, but repeatable: a job that is run again must give the same video.
    assert mix_styles(STYLES, 12, "001-idempotency/long") == mix_styles(
        STYLES, 12, "001-idempotency/long")
    episode, record = long_episode(10)
    again = [[clip.chrome.get("exit_style") for clip in plan_video(episode, "long", record,
                                                                   MIXED).clips]
             for _ in range(2)]
    assert again[0] == again[1]
    # Other videos get their own order.
    orders = {tuple(mix_styles(STYLES, 12, f"{number:03d}-topic/long")) for number in range(1, 9)}
    assert len(orders) > 1
    assert mix_styles(["slide"], 3, "any") == ["slide", "slide", "slide"]


def test_the_welcome_line_follows_the_logo_as_a_brand_scene() -> None:
    episode, record = long_episode(3)
    brand = copy.deepcopy(BRAND)
    brand["video"]["welcome"] = {"text": "This is StackNova: backend systems, explained."}
    brand["video"]["transition"] = "slide"
    # The voice stage said it right after the hook, 3 s long, and the rest moved along.
    record["segments"].insert(1, {"id": "welcome", "start": 20.0, "duration": 3.0, "pauses": []})
    for segment in record["segments"][2:]:
        segment["start"] += 3.0
    record["duration"] += 3.0
    plan = plan_video(episode, "long", record, brand)
    assert [clip.unit for clip in plan.clips] == ["s01", "intro", "welcome", "s02", "s03",
                                                  "outro"]
    welcome = plan.clips[2]
    assert welcome.spec.layout == "brand" and welcome.spec.decl["scene"] == "welcome"
    assert welcome.spec.decl["text"] == brand["video"]["welcome"]["text"]
    assert welcome.frames == 90 and welcome.chrome == {}
    second = plan.clips[3]
    # It is not a part of the episode: the top bar still counts three parts.
    assert (second.chrome["part"], second.chrome["parts"]) == (2, 3)
    assert second.chrome["from_black"] is True
    # The voice says it after the logo's sound, so it is inside the narration after the cut.
    assert [(part.source, part.start) for part in plan.audio[:3]] == [
        ("narration", 0.0), ("intro", 0.0), ("narration", 20.0)]


def test_a_short_has_no_welcome_line() -> None:
    brand = copy.deepcopy(BRAND)
    brand["video"]["welcome"] = {"text": "This is StackNova."}
    plan = plan_video(short_episode(scene([press("tapped Pay")])), "short-1",
                      entry(("short-1", 0.0, 6.0), duration=6.0), brand)
    assert [clip.unit for clip in plan.clips] == ["short-1"]


def test_the_welcome_line_is_said_faster_than_the_narration() -> None:
    # config/brand.yaml, the owner's call: 1.7, 1.35 and 1.25 were too fast; 1.15 (16 Oct 2026).
    root = Path(__file__).resolve().parents[1]
    brand = yaml.safe_load((root / "config" / "brand.yaml").read_text("utf-8"))
    assert welcome_speed(brand) == 1.15
    assert brand["video"]["welcome"]["text"].startswith("Every digital frontier begins")
    assert welcome_speed({}) == 1.0
    with pytest.raises(ValueError, match=r"between 0\.5 and 3"):
        welcome_speed({"video": {"welcome": {"speed": 5}}})


S02 = ("If anything fails, the client retries. Clean. But that picture hides a question: when "
       "the client gets no response, what actually happened? There are three possibilities.")
# Segment s02 of episode 001 as rendered on 14 October 2026: one silence after "retries." was
# measured as three, and the pauses after it are where the clauses really end.
S02_PAUSES = [(1.6, 1.83), (1.83, 1.98), (1.98, 2.15), (2.61, 2.95), (5.0, 5.44), (8.1, 8.4)]
S02_SAID = {"If": 0.0, "Clean.": 2.2, "But": 3.07, "when": 5.53, "There": 8.47}


def test_captions_start_as_their_first_word_is_said() -> None:
    plain = " ".join(S02.split())
    words = [(plain.index(word), start, start + 0.3) for word, start in S02_SAID.items()]
    lines = captions(S02, 10.0, S02_PAUSES, words=words)
    starts = {text.split()[0]: when for when, text in lines}
    assert starts == {"If": 0.0, "Clean.": 2.2, "But": 3.07, "when": 5.53, "There": 8.47}
    # Placed by the pauses alone, the split silence takes two clause ends too many, and the
    # caption for "when the client gets no response" comes over a second before its words.
    guessed = {text.split()[0]: when for when, text in captions(S02, 10.0, S02_PAUSES)}
    assert guessed["when"] < 5.53 - 1.0


def test_scenes_and_captions_take_the_word_times_from_timing_json() -> None:
    visual = [scene([press("tapped Pay")]), scene([press("one key")], **{"from": "The fix"})]
    record = entry(("short-1", 0.0, 6.0), duration=6.0)
    record["segments"][0]["words"] = [[SCRIPT.index("So you"), 2.6, 2.8],
                                      [SCRIPT.index("The fix"), 4.4, 4.6]]
    plan = plan_video(short_episode(visual), "short-1", record, BRAND)
    first, second = plan.clips
    # The second scene starts as "The fix" is said, and its caption is on from its first frame.
    assert first.frames == round(4.4 * 30)
    assert first.chrome["captions"][1][0] == 2.6
    assert second.chrome["captions"][0][0] == 0.0


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

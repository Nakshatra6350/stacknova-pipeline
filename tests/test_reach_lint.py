"""One passing and one failing case per rule in channel_os.reach.lint."""

from typing import Any

import pytest

from channel_os.reach.lint import Finding, lint_episode

Data = dict[str, Any]


def found(findings: list[Finding], rule: str) -> list[tuple[str, str]]:
    return [(finding.level, finding.where) for finding in findings if finding.rule == rule]


def test_valid_episode_has_no_findings(episode: Data, reach: Data) -> None:
    assert lint_episode(episode, reach) == []


def test_title_over_the_limit_is_an_error(episode: Data, reach: Data) -> None:
    episode["packaging"]["titles"][1] = "Idempotency " + "x" * 49
    assert found(lint_episode(episode, reach), "title-length") == [
        ("error", "packaging.titles[1]")
    ]


def test_title_limit_comes_from_the_reach_config(episode: Data, reach: Data) -> None:
    reach["quality_gates"]["title_max_chars"] = 20
    assert found(lint_episode(episode, reach), "title-length") == [
        ("error", "packaging.titles[0]"),
        ("error", "packaging.titles[1]"),
    ]


def test_blank_first_narration_is_an_error(episode: Data, reach: Data) -> None:
    episode["segments"][0]["narration"] = "   "
    assert found(lint_episode(episode, reach), "hook-present") == [("error", "s01")]


def test_blank_short_hook_is_an_error(episode: Data, reach: Data) -> None:
    episode["shorts"][1]["hook_on_screen"] = " "
    assert found(lint_episode(episode, reach), "hook-present") == [("error", "short-2")]


def test_emphasis_missing_from_narration_is_an_error(episode: Data, reach: Data) -> None:
    episode["segments"][1]["emphasis"] = ["Retry", "not there"]
    findings = [f for f in lint_episode(episode, reach) if f.rule == "emphasis-in-narration"]
    assert [(f.level, f.where) for f in findings] == [("error", "s02")]
    assert "not there" in findings[0].message


def test_phrases_match_across_line_breaks_and_case(episode: Data, reach: Data) -> None:
    episode["segments"][0]["narration"] = "Here is THE\n   retry that matters." + " filler" * 400
    episode["segments"][0]["emphasis"] = ["the retry"]
    findings = lint_episode(episode, reach)
    assert found(findings, "emphasis-in-narration") == []
    assert found(findings, "step-anchor") == []


def test_step_anchor_missing_from_narration_is_an_error(episode: Data, reach: Data) -> None:
    episode["segments"][0]["visual"]["steps"][1]["at"] = "never said"
    assert found(lint_episode(episode, reach), "step-anchor") == [
        ("error", "s01.visual.steps[1]")
    ]


def test_short_cut_from_an_unknown_segment_is_an_error(episode: Data, reach: Data) -> None:
    episode["shorts"][0]["segments"] = ["s02", "s99"]
    assert found(lint_episode(episode, reach), "short-source") == [("error", "short-1")]


def test_short_cut_from_no_segments_is_an_error(episode: Data, reach: Data) -> None:
    del episode["shorts"][0]["segments"]
    assert found(lint_episode(episode, reach), "short-source") == [("error", "short-1")]


@pytest.mark.parametrize("script", ["", "   ", None])
def test_standalone_short_without_a_script_is_an_error(
    episode: Data, reach: Data, script: str | None
) -> None:
    if script is None:
        del episode["shorts"][1]["script"]
    else:
        episode["shorts"][1]["script"] = script
    assert found(lint_episode(episode, reach), "short-source") == [("error", "short-2")]


GATED_STATUSES = ["ready_to_render", "rendering", "rendered", "published"]
UNGATED_STATUSES = ["draft", "archived"]


@pytest.mark.parametrize("status", GATED_STATUSES)
def test_story_placeholder_blocks_every_status_after_draft(
    episode: Data, reach: Data, status: str
) -> None:
    episode["status"] = status
    episode["segments"][2]["narration"] += " [STORY:duplicate-callback]"
    assert found(lint_episode(episode, reach), "story-placeholder") == [("error", "s03")]


@pytest.mark.parametrize("status", UNGATED_STATUSES)
def test_story_placeholder_is_a_warning_before_the_gate(
    episode: Data, reach: Data, status: str
) -> None:
    episode["status"] = status
    episode["segments"][2]["narration"] += " [STORY:duplicate-callback]"
    assert found(lint_episode(episode, reach), "story-placeholder") == [("warning", "s03")]


def test_story_placeholder_in_a_short_script_is_found(episode: Data, reach: Data) -> None:
    episode["shorts"][1]["script"] = "[STORY:duplicate-callback] and then the rest."
    assert found(lint_episode(episode, reach), "story-placeholder") == [("error", "short-2")]


def test_missing_localizations_block_ready_to_render(episode: Data, reach: Data) -> None:
    del episode["localizations"]["vi"]
    episode["localizations"]["ar"]["title"] = None
    findings = [f for f in lint_episode(episode, reach) if f.rule == "localizations"]
    assert [(f.level, f.where, f.message) for f in findings] == [
        ("error", "localizations.vi", "missing title and description"),
        ("error", "localizations.ar", "missing title"),
    ]


def test_missing_localizations_are_warnings_on_a_draft(episode: Data, reach: Data) -> None:
    episode["status"] = "draft"
    del episode["localizations"]
    assert found(lint_episode(episode, reach), "localizations") == [
        ("warning", f"localizations.{language}")
        for language in ["hi", "es", "pt", "id", "vi", "ar"]
    ]


def test_hook_longer_than_six_words_is_a_warning(episode: Data, reach: Data) -> None:
    episode["shorts"][0]["hook_on_screen"] = "Which of these is safe to retry?"
    assert found(lint_episode(episode, reach), "hook-words") == [("warning", "short-1")]


def test_keyword_outside_the_first_40_characters_is_a_warning(
    episode: Data, reach: Data
) -> None:
    episode["packaging"]["titles"][0] = "Why Your Payment Got Charged Twice (Idempotency)"
    assert found(lint_episode(episode, reach), "keyword-position") == [
        ("warning", "packaging.titles[0]")
    ]


def test_narration_outside_the_word_range_is_a_warning(episode: Data, reach: Data) -> None:
    for segment in episode["segments"]:
        segment["narration"] = "Here is the retry that matters."
    findings = [f for f in lint_episode(episode, reach) if f.rule == "word-count"]
    assert [(f.level, f.where, f.message) for f in findings] == [
        ("warning", "segments", "narration is 18 words, target is 1100-2200")
    ]

"""Mechanical content and reach rules that the episode schema cannot express.

Rule ids and levels follow docs/superpowers/specs/2026-10-09-m0-bootstrap-design.md.
Every rule assumes the episode already passed schemas/episode.schema.json.
"""

from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from typing import Any, Literal

Level = Literal["error", "warning"]
Episode = Mapping[str, Any]
Reach = Mapping[str, Any]

HOOK_MAX_WORDS = 6  # docs/CAPTIONS_SPEC.md, hook card
KEYWORD_WINDOW_CHARS = 40  # docs/REACH_PLAYBOOK.md section 1
NARRATION_WORDS = (1100, 2200)  # docs/CONTENT_RULES.md section 4
STORY_PLACEHOLDER = "[STORY:"
UNGATED_STATUSES = frozenset({"draft", "archived"})


@dataclass(frozen=True)
class Finding:
    """One rule violation in one place of an episode."""

    level: Level
    rule: str
    where: str
    message: str


def _norm(text: str) -> str:
    """Collapse whitespace and ignore case, as the caption aligner does."""
    return " ".join(text.split()).casefold()


def _gate_level(episode: Episode) -> Level:
    """Gate rules block rendering, so they are only warnings while an episode is a draft."""
    return "warning" if episode["status"] in UNGATED_STATUSES else "error"


def _title_length(episode: Episode, reach: Reach) -> Iterator[Finding]:
    limit = int(reach["quality_gates"]["title_max_chars"])
    for index, title in enumerate(episode["packaging"]["titles"]):
        if len(title) > limit:
            yield Finding(
                "error",
                "title-length",
                f"packaging.titles[{index}]",
                f"{len(title)} characters, limit is {limit}",
            )


def _hook_present(episode: Episode, reach: Reach) -> Iterator[Finding]:
    first = episode["segments"][0]
    if not first["narration"].strip():
        yield Finding("error", "hook-present", first["id"], "the first segment has no narration")
    for short in episode["shorts"]:
        if not short["hook_on_screen"].strip():
            yield Finding("error", "hook-present", short["id"], "hook_on_screen is blank")


def _emphasis_in_narration(episode: Episode, reach: Reach) -> Iterator[Finding]:
    for segment in episode["segments"]:
        narration = _norm(segment["narration"])
        for phrase in segment.get("emphasis", []):
            if _norm(phrase) not in narration:
                yield Finding(
                    "error",
                    "emphasis-in-narration",
                    segment["id"],
                    f'emphasis "{phrase}" is not in the narration',
                )


def _step_anchor(episode: Episode, reach: Reach) -> Iterator[Finding]:
    for segment in episode["segments"]:
        narration = _norm(segment["narration"])
        for index, step in enumerate(segment["visual"]["steps"]):
            anchor = step["at"]
            if anchor != "start" and _norm(anchor) not in narration:
                yield Finding(
                    "error",
                    "step-anchor",
                    f"{segment['id']}.visual.steps[{index}]",
                    f'at "{anchor}" is not in the narration',
                )


def _short_source(episode: Episode, reach: Reach) -> Iterator[Finding]:
    segment_ids = {segment["id"] for segment in episode["segments"]}
    for short in episode["shorts"]:
        if short["source"] == "segments":
            listed = short.get("segments", [])
            if not listed:
                yield Finding(
                    "error", "short-source", short["id"], "source is segments but none are listed"
                )
            for segment_id in listed:
                if segment_id not in segment_ids:
                    yield Finding(
                        "error", "short-source", short["id"], f"unknown segment {segment_id}"
                    )
        elif not str(short.get("script", "")).strip():
            yield Finding(
                "error", "short-source", short["id"], "source is standalone but script is blank"
            )


def _story_placeholder(episode: Episode, reach: Reach) -> Iterator[Finding]:
    level = _gate_level(episode)
    for segment in episode["segments"]:
        if STORY_PLACEHOLDER in segment["narration"]:
            yield Finding(
                level,
                "story-placeholder",
                segment["id"],
                "narration still holds a [STORY:...] placeholder",
            )
    for short in episode["shorts"]:
        if STORY_PLACEHOLDER in str(short.get("script", "")):
            yield Finding(
                level,
                "story-placeholder",
                short["id"],
                "script still holds a [STORY:...] placeholder",
            )


def _localizations(episode: Episode, reach: Reach) -> Iterator[Finding]:
    level = _gate_level(episode)
    localizations = episode.get("localizations", {})
    for language in reach["subtitle_languages"]:
        entry = localizations.get(language) or {}
        missing = [
            field for field in ("title", "description") if not str(entry.get(field) or "").strip()
        ]
        if missing:
            yield Finding(
                level,
                "localizations",
                f"localizations.{language}",
                f"missing {' and '.join(missing)}",
            )


def _hook_words(episode: Episode, reach: Reach) -> Iterator[Finding]:
    for short in episode["shorts"]:
        words = len(short["hook_on_screen"].split())
        if words > HOOK_MAX_WORDS:
            yield Finding(
                "warning",
                "hook-words",
                short["id"],
                f"hook_on_screen has {words} words, limit is {HOOK_MAX_WORDS}",
            )


def _keyword_position(episode: Episode, reach: Reach) -> Iterator[Finding]:
    primary = episode["keywords"]["primary"]
    keyword = _norm(primary)
    for index, title in enumerate(episode["packaging"]["titles"]):
        if keyword not in _norm(title[:KEYWORD_WINDOW_CHARS]):
            yield Finding(
                "warning",
                "keyword-position",
                f"packaging.titles[{index}]",
                f'"{primary}" is not within the first {KEYWORD_WINDOW_CHARS} characters',
            )


def _word_count(episode: Episode, reach: Reach) -> Iterator[Finding]:
    low, high = NARRATION_WORDS
    total = sum(len(segment["narration"].split()) for segment in episode["segments"])
    if not low <= total <= high:
        yield Finding(
            "warning",
            "word-count",
            "segments",
            f"narration is {total} words, target is {low}-{high}",
        )


Rule = Callable[[Episode, Reach], Iterator[Finding]]

RULES: tuple[Rule, ...] = (
    _title_length,
    _hook_present,
    _emphasis_in_narration,
    _step_anchor,
    _short_source,
    _story_placeholder,
    _localizations,
    _hook_words,
    _keyword_position,
    _word_count,
)


def lint_episode(episode: Episode, reach: Reach) -> list[Finding]:
    """Run every rule and return the findings in rule order."""
    return [finding for rule in RULES for finding in rule(episode, reach)]

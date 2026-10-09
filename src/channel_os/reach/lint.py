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


Rule = Callable[[Episode, Reach], Iterator[Finding]]

RULES: tuple[Rule, ...] = (
    _title_length,
    _hook_present,
    _emphasis_in_narration,
    _step_anchor,
    _short_source,
)


def lint_episode(episode: Episode, reach: Reach) -> list[Finding]:
    """Run every rule and return the findings in rule order."""
    return [finding for rule in RULES for finding in rule(episode, reach)]

"""Turn a `visual` block from episode.yaml into scenes with timed steps (M2). No browser here.

A visual is one scene or a list of scenes. Each later scene takes over at its `from` phrase.
Steps are listed in spoken order: a phrase is looked up from where the previous step's phrase
was found, so a repeated word means its next occurrence.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from itertools import pairwise
from typing import Any

from channel_os.scenes import (
    cards_model,
    code_model,
    console_model,
    fanin_model,
    sequence_model,
)
from channel_os.scenes.phrases import anchors, find_offset, normalise, time_at

MAX_DELAY = 5.0  # seconds a step may wait after its phrase
# layout name -> the module that checks its declaration and steps (`problems`, `ACTIONS`).
# Layouts not listed have no stage. The page draws each of these (scenes/web/<name>.js).
STAGES: Mapping[str, Any] = {
    "console": console_model,
    "sequence": sequence_model,
    "cards": cards_model,
    "fanin": fanin_model,
    "code": code_model,
}
_RESERVED = frozenset({"layout", "from", "steps"})


class SpecError(ValueError):
    """A visual block that cannot be turned into scenes. The message says where."""


@dataclass(frozen=True)
class Step:
    time: float  # seconds from the start of its scene
    action: str
    target: str
    params: Mapping[str, Any]
    at: str


@dataclass(frozen=True)
class SceneSpec:
    layout: str
    start: float  # seconds from the start of the narration unit
    end: float
    decl: Mapping[str, Any]  # the scene block without layout, from and steps
    steps: tuple[Step, ...]

    @property
    def duration(self) -> float:
        return self.end - self.start


def scene_blocks(visual: Any) -> list[Mapping[str, Any]]:
    return [visual] if isinstance(visual, Mapping) else list(visual)


def _offsets(blocks: Sequence[Mapping[str, Any]], text: str) -> list[tuple[int, list[int]]]:
    """For each scene: where it starts in the text, and where each of its steps' phrases is."""
    result: list[tuple[int, list[int]]] = []
    cursor = 0
    for index, block in enumerate(blocks):
        where = f"scene {index + 1}"
        if index == 0:
            start = 0
        else:
            if "from" not in block:
                raise SpecError(f"{where}: every scene after the first needs a `from` phrase")
            start = find_offset(block["from"], text, cursor)
            if start < 0:
                raise SpecError(f"{where}: `from` phrase {block['from']!r} is not spoken here")
        cursor = start
        step_offsets: list[int] = []
        for step in block["steps"]:
            found = cursor if step["at"] == "start" else find_offset(step["at"], text, cursor)
            if found < 0:
                raise SpecError(
                    f"{where}: `at` phrase {step['at']!r} is not spoken at or after the "
                    "previous step (steps must be in spoken order)"
                )
            cursor = found
            step_offsets.append(found)
        result.append((start, step_offsets))
    return result


def _delay(step: Mapping[str, Any]) -> float:
    return float((step.get("params") or {}).get("delay", 0.0))


def stage_problems(visual: Any) -> list[str]:
    """Unknown layouts, and whatever each known stage says about its declaration and steps."""
    found: list[str] = []
    for index, block in enumerate(scene_blocks(visual)):
        where = f"scene {index + 1}"
        stage = STAGES.get(block["layout"])
        if stage is None:
            found.append(f"{where}: layout {block['layout']!r} has no stage yet")
            continue
        for number, step in enumerate(block["steps"], start=1):
            delay = (step.get("params") or {}).get("delay", 0.0)
            number_like = isinstance(delay, int | float) and not isinstance(delay, bool)
            if not number_like or not 0 <= delay <= MAX_DELAY:
                found.append(f"{where}: step {number}: delay is seconds after the phrase, "
                             f"0 to {MAX_DELAY:g}, not {delay!r}")
        decl = {key: value for key, value in block.items() if key not in _RESERVED}
        found.extend(f"{where}: {issue}" for issue in stage.problems(decl, block["steps"]))
    return found


def order_problems(visual: Any, text: str) -> list[str]:
    """Phrases that are missing or not in spoken order, and scenes that do not move forward."""
    try:
        offsets = _offsets(scene_blocks(visual), text)
    except SpecError as exc:
        return [str(exc)]
    starts = [start for start, _ in offsets]
    if any(later <= earlier for earlier, later in pairwise(starts)):
        return ["scenes must start at later and later phrases"]
    return []


def problems(visual: Any, text: str) -> list[str]:
    """Everything wrong with a visual that can be known without audio. Empty means usable."""
    return [*stage_problems(visual), *order_problems(visual, text)]


def build_scenes(
    visual: Any, text: str, duration: float, pauses: Sequence[tuple[float, float]]
) -> list[SceneSpec]:
    """Scenes covering the whole narration unit, each with its steps at scene-local times."""
    blocks = scene_blocks(visual)
    issues = problems(visual, text)
    if issues:
        raise SpecError("; ".join(issues))
    anchor_list = anchors(text, duration, pauses)
    offsets = _offsets(blocks, text)
    starts = [0.0, *(time_at(start, anchor_list) for start, _ in offsets[1:])]
    ends = [*starts[1:], duration]
    length = len(normalise(text))
    scenes: list[SceneSpec] = []
    for block, (_, step_offsets), start, end in zip(blocks, offsets, starts, ends, strict=True):
        steps = []
        for step, offset in zip(block["steps"], step_offsets, strict=True):
            # `delay` staggers steps that share a phrase: a packet leaves, then its row appears.
            spoken = time_at(min(offset, length), anchor_list) + _delay(step)
            local = min(max(spoken - start, 0.0), end - start)
            steps.append(
                Step(local, step["action"], step["target"], dict(step.get("params") or {}),
                     step["at"])
            )
        decl = {key: value for key, value in block.items() if key not in _RESERVED}
        scenes.append(SceneSpec(block["layout"], start, end, decl, tuple(steps)))
    return scenes

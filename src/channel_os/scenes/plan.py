"""Which clips make up a target's picture, and how many frames each one gets (M2). No Manim here.

A target (the long video or a Short) is narrated as units: segments, or a standalone Short's
script. Each unit's `visual` gives one or more scenes. A scene's clip runs from the moment the
scene starts until the next one starts, so the pause after a unit belongs to the scene that was
on screen, and the clips add up to the narration exactly.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from itertools import pairwise
from typing import Any

from channel_os.scenes.formats import FPS, frame_count
from channel_os.scenes.spec import SceneSpec, SpecError, build_scenes
from channel_os.voice.narrate import select_units


class PlanError(ValueError):
    """A target whose scenes cannot be planned. The message names the unit."""


@dataclass(frozen=True)
class Clip:
    unit: str  # the segment or Short the scene belongs to
    spec: SceneSpec
    frames: int


def _visuals(episode: Mapping[str, Any], target: str) -> dict[str, Any]:
    """The `visual` of each narration unit of a target, by unit id."""
    found = {segment["id"]: segment.get("visual") for segment in episode["segments"]}
    for short in episode["shorts"]:
        if short["id"] == target and short["source"] == "standalone":
            found[target] = short.get("visual")
    return found


def declared_theme(episode: Mapping[str, Any], target: str) -> str | None:
    """The theme episode.yaml names for a target, if it names one."""
    holder: Mapping[str, Any] | None = episode
    if target != "long":
        holder = next((short for short in episode["shorts"] if short["id"] == target), None)
    theme: str | None = holder.get("theme") if holder else None
    return theme


def plan_clips(episode: Mapping[str, Any], target: str, entry: Mapping[str, Any],
               fps: int = FPS) -> list[Clip]:
    """The clips of a target, in order. `entry` is the target's record in timing.json."""
    timed = {segment["id"]: segment for segment in entry["segments"]}
    visuals = _visuals(episode, target)
    cuts: list[tuple[float, str, SceneSpec]] = []
    for unit in select_units(episode, target):
        if unit.id not in timed:
            raise PlanError(f"{unit.id}: timing.json has no narration for it; render the voice")
        if visuals.get(unit.id) is None:
            raise PlanError(f"{unit.id}: it has no visual to draw")
        segment = timed[unit.id]
        pauses = [(float(start), float(end)) for start, end in segment["pauses"]]
        try:
            scenes = build_scenes(visuals[unit.id], unit.text, segment["duration"], pauses)
        except SpecError as exc:
            raise PlanError(f"{unit.id}: {exc}") from exc
        cuts.extend((segment["start"] + scene.start, unit.id, scene) for scene in scenes)
    edges = [round(start * fps) for start, _, _ in cuts]
    edges.append(frame_count(entry["duration"], fps))
    clips = [
        Clip(unit, spec, later - earlier)
        for (_, unit, spec), (earlier, later) in zip(cuts, pairwise(edges), strict=True)
    ]
    for clip in clips:
        if clip.frames < 1:
            raise PlanError(f"{clip.unit}: a scene is shorter than one frame")
    return clips

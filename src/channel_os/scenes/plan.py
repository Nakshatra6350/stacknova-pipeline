"""Which clips make up a target's picture, how many frames each gets, and what goes around
them (M2, look v2). No browser here.

A target (the long video or a Short) is narrated as units: segments, or a standalone Short's
script. Each unit's `visual` gives one or more scenes. A scene's clip runs from the moment the
scene starts until the next one starts, so the pause after a unit belongs to the scene that was
on screen, and the clips add up to the narration exactly.

Around the scenes the planner adds what an episode never writes: the top bar, the captions,
the Instagram handle on long videos, the logo intro after the hook, the outro, and the follow
prompt on Shorts. Those come from config/brand.yaml.
"""

import html
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from itertools import accumulate, pairwise
from typing import Any

from channel_os.scenes.formats import FPS, frame_count
from channel_os.scenes.phrases import anchors, normalise, time_at
from channel_os.scenes.spec import SceneSpec, SpecError, build_scenes
from channel_os.voice.narrate import select_units

LONG = "long"
CAPTION_CHARS = 84  # a caption longer than this is split at a comma so it stays on two lines
SHORT_CAPTION_CHARS = 44  # Shorts read faster and larger: shorter pieces, changing more often
HANDLE_EDGE = 0.5  # seconds the Instagram handle keeps clear of a scene change
_SENTENCE = re.compile(r"[^.!?]+[.!?]+[\"')]*\s*|[^.!?]+$")


class PlanError(ValueError):
    """A target whose scenes cannot be planned. The message names the unit."""


@dataclass(frozen=True)
class Clip:
    unit: str  # the segment or Short the scene belongs to, or "intro" / "outro"
    spec: SceneSpec
    frames: int
    chrome: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AudioPart:
    source: str  # "narration", "intro" or "outro"
    start: float
    end: float


@dataclass(frozen=True)
class VideoPlan:
    clips: tuple[Clip, ...]
    audio: tuple[AudioPart, ...]

    @property
    def frames(self) -> int:
        return sum(clip.frames for clip in self.clips)


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
    if target != LONG:
        holder = next((short for short in episode["shorts"] if short["id"] == target), None)
    theme: str | None = holder.get("theme") if holder else None
    return theme


def plan_clips(episode: Mapping[str, Any], target: str, entry: Mapping[str, Any],
               fps: int = FPS) -> list[Clip]:
    """The scene clips of a target, in order. `entry` is the target's record in timing.json."""
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


def captions(text: str, duration: float, pauses: Sequence[tuple[float, float]],
             emphasis: Sequence[str] = (), limit: int = CAPTION_CHARS) -> list[tuple[float, str]]:
    """The narration as caption lines: (when it starts being spoken, HTML with <b> emphasis).

    A sentence longer than `limit` characters is split at its punctuation.
    """
    plain = normalise(text)
    points = anchors(text, duration, pauses)
    pieces: list[tuple[int, str]] = []
    for match in _SENTENCE.finditer(plain):
        start, sentence = match.start(), match.group()
        while len(sentence.strip()) > limit:
            # Break at the comma or semicolon nearest the middle; none means leave it whole.
            marks = [m.end() for m in re.finditer(r"[,;:]\s", sentence[:-2])]
            if not marks:
                break
            cut = min(marks, key=lambda mark: abs(mark - len(sentence) / 2))
            pieces.append((start, sentence[:cut]))
            start, sentence = start + cut, sentence[cut:]
        pieces.append((start, sentence))
    words = sorted({word for word in emphasis if word}, key=len, reverse=True)
    pattern = re.compile("|".join(re.escape(html.escape(word, quote=False)) for word in words),
                         re.IGNORECASE) if words else None
    lines: list[tuple[float, str]] = []
    for start, piece in pieces:
        shown = html.escape(piece.strip(), quote=False)
        if not shown:
            continue
        if pattern is not None:
            shown = pattern.sub(lambda found: f"<b>{found.group()}</b>", shown)
        lines.append((round(time_at(start, points), 3), shown))
    return lines


def _handle_windows(scenes: Sequence[Clip], hook: str, shares: Sequence[float], length: float,
                    fps: int) -> dict[int, list[list[float]]]:
    """When the Instagram handle slides in, by scene: [from, to] in seconds into that scene.

    Each one starts at its share of the content. One that would fall in the hook, or be cut
    short by a scene change, waits for the next scene with room for it.
    """
    begins = list(accumulate((clip.frames / fps for clip in scenes), initial=0.0))
    windows: dict[int, list[list[float]]] = {}
    for share in shares if length > 0 else ():
        at = share * begins[-1]
        for index, clip in enumerate(scenes):
            begin, seconds = begins[index], clip.frames / fps
            if begin + seconds <= at or clip.unit == hook:
                continue
            taken = windows.setdefault(index, [])
            start = max(at - begin, HANDLE_EDGE, taken[-1][1] + length if taken else 0.0)
            if start + length <= seconds - HANDLE_EDGE:
                taken.append([round(start, 3), round(start + length, 3)])
                break
    return {index: found for index, found in windows.items() if found}


def _brand_clip(scene: str, seconds: float, decl: Mapping[str, Any], fps: int) -> Clip:
    spec = SceneSpec("brand", 0.0, seconds, {"scene": scene, **decl}, ())
    return Clip(scene, spec, round(seconds * fps))


def plan_video(episode: Mapping[str, Any], target: str, entry: Mapping[str, Any],
               brand: Mapping[str, Any], fps: int = FPS) -> VideoPlan:
    """Everything a target's preview is made of: scenes with their chrome, the brand scenes of
    a long video, and the audio to lay under them."""
    scenes = plan_clips(episode, target, entry, fps)
    video = brand.get("video") or {}
    handles = (brand.get("handles") or {}).get("confirmed") or {}
    long_video = target == LONG
    units = list(dict.fromkeys(clip.unit for clip in scenes))
    intro = video.get("intro") if long_video and len(units) > 1 else None
    outro = video.get("outro") if long_video else None
    intro_frames = round(intro["seconds"] * fps) if intro else 0
    outro_frames = round(outro["seconds"] * fps) if outro else 0
    content_frames = sum(clip.frames for clip in scenes)
    total = content_frames + intro_frames + outro_frames
    hook_frames = sum(clip.frames for clip in scenes if clip.unit == units[0])

    segments = {segment["id"]: segment for segment in episode["segments"]}
    shorts = {short["id"]: short for short in episode["shorts"]}
    timed = {segment["id"]: segment for segment in entry["segments"]}
    spoken = {unit.id: unit.text for unit in select_units(episode, target)}
    number = episode["id"].split("-", 1)[0]
    headline = ((episode.get("packaging") or {}).get("titles") or [""])[0]
    wanted = (video.get("handle") or {}) if long_video else {}
    windows = _handle_windows(scenes, units[0], wanted.get("at", []),
                              float(wanted.get("seconds", 0)), fps)
    prompt = (video.get("shorts_prompt") or {}).get("seconds", 0) if not long_video else 0

    clips: list[Clip] = []
    done_content = 0  # content frames before this clip
    for index, clip in enumerate(scenes):
        seconds = clip.frames / fps
        unit = segments.get(clip.unit) or shorts.get(clip.unit) or {}
        shown_before = done_content + (intro_frames if clip.unit != units[0] else 0)
        chrome: dict[str, Any] = {
            "part": units.index(clip.unit) + 1,
            "parts": len(units),
            "title": unit.get("title") or unit.get("hook_on_screen") or "",
            "pill": f"EP {number} · {headline}" if headline else f"EP {number}",
            "pill_short": f"EP {number}",
            "progress": [shown_before / total, (shown_before + clip.frames) / total],
            "instagram": handles.get("instagram", ""),
        }
        narrated = timed[clip.unit]
        pauses = [(float(a), float(b)) for a, b in narrated["pauses"]]
        lines = captions(spoken[clip.unit], narrated["duration"], pauses,
                         unit.get("emphasis") or (),
                         CAPTION_CHARS if long_video else SHORT_CAPTION_CHARS)
        local = [(max(0.0, when - clip.spec.start), text) for when, text in lines
                 if when < clip.spec.end]
        current = [line for line in local if line[0] <= 0.0][-1:] or local[:1]
        chrome["captions"] = [list(line) for line in
                              [*current, *(line for line in local if line[0] > 0.0)]]
        if long_video:
            chrome["handle"] = windows.get(index, [])
        if prompt and index == len(scenes) - 1:
            chrome["cta"] = [round(max(0.0, seconds - prompt), 3), round(seconds, 3)]
            chrome["cta_ask"] = (video.get("shorts_prompt") or {}).get("ask", "Subscribe")
        clips.append(Clip(clip.unit, clip.spec, clip.frames, chrome))
        done_content += clip.frames
        if intro and clip.unit == units[0] and done_content == hook_frames:
            clips.append(_brand_clip("intro", intro["seconds"],
                                     {"tagline": brand["tagline"].upper()}, fps))

    narration_end = content_frames / fps
    audio = [AudioPart("narration", 0.0, narration_end)]
    if intro:
        cut = hook_frames / fps
        audio = [AudioPart("narration", 0.0, cut), AudioPart("intro", 0.0, intro["seconds"]),
                 AudioPart("narration", cut, narration_end)]
    if outro:
        decl = {
            "tagline": brand["tagline"].upper(),
            "instagram": handles.get("instagram", ""),
            "youtube": handles.get("youtube", ""),
            "cadence": outro.get("cadence", ""),
            "next": episode.get("next"),
        }
        clips.append(_brand_clip("outro", outro["seconds"], decl, fps))
        audio.append(AudioPart("outro", 0.0, outro["seconds"]))
    return VideoPlan(tuple(clips), tuple(audio))

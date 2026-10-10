"""Render an episode's assets: the voice stage (M1) and the scenes stage (M2).

Usage: python -m channel_os.render --episode ID [--stage voice|scenes] [--only TARGET]
                                   [--out DIR] [--root DIR] [--allow-draft]
       voice:  --reference WAV [--model NAME] [--set KEY=VALUE ...] [--cache-dir DIR]
       scenes: [--format portrait|landscape] [--theme NAME] [--quality N]

The two stages run in separate environments, because their dependency groups conflict. Voice
runs first; the scenes stage reads the narration and timing.json it left in the output folder
and writes preview/<target>.mp4 there.
Exit codes: 0 rendered or skipped, 1 the episode is invalid or the render failed its checks,
2 a needed file could not be read or a setting is invalid.
"""

import argparse
import sys
import tempfile
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

from channel_os.assemble.ffmpeg import FfmpegError
from channel_os.scenes.formats import FORMATS, FPS, natural_format
from channel_os.scenes.plan import declared_theme, plan_clips
from channel_os.scenes.theme import Themes, load_themes, pick_theme
from channel_os.validate import (
    REACH_PATH,
    SCHEMA_PATH,
    InputError,
    load_json,
    load_yaml,
    validate_episode,
)
from channel_os.voice.loudness import detect_pauses
from channel_os.voice.narrate import (
    LoudnessError,
    all_targets,
    narrate,
    select_units,
    update_timing,
)
from channel_os.voice.reference import prepare_reference
from channel_os.voice.settings import VoiceSettings, load_settings
from channel_os.voice.tts import ChatterboxSynthesizer, Synthesizer

VOICE_CONFIG = Path("config") / "voice.yaml"
THEMES_CONFIG = Path("config") / "themes.yaml"
RENDERABLE_STATUS = "ready_to_render"
SynthesizerFactory = Callable[[VoiceSettings, Path], Synthesizer]
PreviewRenderer = Callable[..., Path]  # scenes.preview.render_preview, or a stand-in in tests


def render_voice(
    episode: Mapping[str, Any],
    targets: Sequence[str],
    synthesizer: Synthesizer,
    settings: VoiceSettings,
    out_dir: Path,
    cache_dir: Path,
) -> None:
    """Narrate each target and record it in out_dir/timing.json."""
    for target in targets:
        units = select_units(episode, target)
        entry = narrate(units, target, synthesizer, settings, out_dir, cache_dir)
        update_timing(out_dir, episode["id"], target, entry)
        loudness = entry["loudness"]
        print(
            f"{target}: {entry['duration']} s, {loudness['integrated_lufs']} LUFS, "
            f"{loudness['true_peak_db']} dBTP, {len(entry['segments'])} segment(s)"
        )


def _with_pauses(entry: Mapping[str, Any], out_dir: Path) -> dict[str, Any]:
    """A timing entry in which every segment has its pauses.

    Narrations rendered before the voice stage recorded pauses are measured here instead.
    """
    segments = [
        segment if "pauses" in segment
        else {**segment, "pauses": detect_pauses(out_dir / segment["file"])}
        for segment in entry["segments"]
    ]
    return {**entry, "segments": segments}


def render_scenes(
    episode: Mapping[str, Any],
    targets: Sequence[str],
    timing: Mapping[str, Any],
    themes: Themes,
    out_dir: Path,
    cache_dir: Path,
    renderer: PreviewRenderer,
    format_name: str | None = None,
    theme_name: str | None = None,
    quality: float = 1.0,
) -> None:
    """Animate each target to its narration and write out_dir/preview/<target>.mp4."""
    for target in targets:
        entry = timing["targets"].get(target)
        if entry is None:
            raise ValueError(f"{target}: timing.json has no narration for it; render the voice")
        clips = plan_clips(episode, target, _with_pauses(entry, out_dir))
        natural = natural_format(target)
        fmt = FORMATS[format_name] if format_name else natural
        theme = pick_theme(
            themes, episode["id"], target, theme_name or declared_theme(episode, target)
        )
        name = target if fmt is natural else f"{target}.{fmt.name}"
        preview = renderer(clips, fmt, theme, themes, out_dir / entry["narration"],
                           out_dir / "preview" / f"{name}.mp4", quality, cache_dir)
        frames = sum(clip.frames for clip in clips)
        print(
            f"{target}: {frames} frames ({frames / FPS:.2f} s), {len(clips)} scene(s), "
            f"{fmt.name}, theme {theme.name} -> {preview}"
        )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m channel_os.render",
        description="Render an episode's narration, or animate it to that narration.",
    )
    parser.add_argument("--episode", required=True, help="episode id, e.g. 001-idempotency")
    parser.add_argument("--stage", choices=("voice", "scenes"), default="voice")
    parser.add_argument("--only", default="all", help="long, a Short id, or all (default)")
    parser.add_argument("--out", type=Path, default=None, help="default: <root>/out/<episode>")
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="repo root (default: cwd)")
    parser.add_argument("--allow-draft", action="store_true", help="preview a draft episode")
    voice = parser.add_argument_group("voice stage")
    voice.add_argument("--reference", type=Path, default=None, help="voice reference WAV")
    voice.add_argument("--model", default=None, help="override the model in config/voice.yaml")
    voice.add_argument(
        "--set",
        dest="overrides",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help="override one voice setting for this run, e.g. tempo=0.92 or clarity.air_db=2",
    )
    voice.add_argument("--cache-dir", type=Path, default=None, help="default: <root>/.cache/voice")
    scenes = parser.add_argument_group("scenes stage")
    scenes.add_argument("--format", choices=sorted(FORMATS), default=None,
                        help="default: landscape for long, portrait for Shorts")
    scenes.add_argument("--theme", default=None, help="override the theme for this run")
    scenes.add_argument("--quality", type=float, default=1.0,
                        help="picture size as a fraction of full size, e.g. 0.5 for a quick look")
    return parser


def _preview_renderer() -> PreviewRenderer:
    try:
        from channel_os.scenes.preview import render_preview
    except ImportError as exc:
        raise InputError(
            f"the scenes stage needs the scenes dependency group (uv sync --group scenes): {exc}"
        ) from exc
    return render_preview


def main(
    argv: Sequence[str] | None = None,
    make_synthesizer: SynthesizerFactory = ChatterboxSynthesizer,
    render_preview: PreviewRenderer | None = None,
) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    if args.stage == "voice" and args.reference is None:
        parser.error("the voice stage needs --reference")
    root: Path = args.root
    out_dir: Path = args.out or root / "out" / args.episode
    episode_path = root / "content" / "episodes" / args.episode / "episode.yaml"
    try:
        episode = load_yaml(episode_path)
        findings = validate_episode(
            episode, load_json(root / SCHEMA_PATH), load_yaml(root / REACH_PATH)
        )
        if args.stage == "voice":
            settings = load_settings(root / VOICE_CONFIG, args.model, args.overrides)
            if not args.reference.is_file():
                raise InputError(f"{args.reference}: voice reference not found")
        else:
            themes = load_themes(root / THEMES_CONFIG)
            if args.theme is not None and args.theme not in themes.themes:
                known = ", ".join(sorted(themes.themes))
                raise InputError(f"unknown theme {args.theme!r}; config/themes.yaml has: {known}")
            if not 0.1 <= args.quality <= 1.0:
                raise InputError(f"--quality must be between 0.1 and 1, not {args.quality}")
    except (InputError, OSError, ValueError, TypeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    errors = [finding for finding in findings if finding.level == "error"]
    for finding in errors:
        print(f"{episode_path}: error [{finding.rule}] {finding.where}: {finding.message}")
    if errors:
        return 1
    if episode["status"] != RENDERABLE_STATUS and not args.allow_draft:
        print(f"skipped {args.episode}: status is {episode['status']} (use --allow-draft)")
        return 0

    targets = all_targets(episode) if args.only == "all" else [args.only]
    if args.stage == "scenes":
        try:
            timing = load_json(out_dir / "timing.json")
            renderer = render_preview or _preview_renderer()
        except InputError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        try:
            render_scenes(episode, targets, timing, themes, out_dir, root / ".cache" / "manim",
                          renderer, args.format, args.theme, args.quality)
        except (FfmpegError, ValueError, RuntimeError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
        return 0

    cache_dir: Path = args.cache_dir or root / ".cache" / "voice"
    try:
        with tempfile.TemporaryDirectory() as work:
            prepared = Path(work) / "reference.wav"
            prepare_reference(args.reference, prepared, settings.reference)
            synthesizer = make_synthesizer(settings, prepared)
            render_voice(episode, targets, synthesizer, settings, out_dir, cache_dir)
    except (LoudnessError, FfmpegError, ValueError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

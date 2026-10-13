"""Render an episode's assets: the voice stage (M1) and the scenes stage (M2).

Usage: python -m channel_os.render --episode ID [--stage voice|scenes] [--only TARGET]
                                   [--out DIR] [--root DIR] [--allow-draft]
       voice:  --reference WAV [--model NAME] [--set KEY=VALUE ...] [--cache-dir DIR]
               [--no-listen]
       scenes: [--format portrait|landscape] [--theme NAME] [--quality N] [--jobs N]
               [--intro-sound FILE]

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
from channel_os.scenes.plan import LONG, declared_theme, plan_video
from channel_os.scenes.theme import Themes, load_themes, pick_theme
from channel_os.validate import (
    REACH_PATH,
    SCHEMA_PATH,
    InputError,
    load_json,
    load_yaml,
    validate_episode,
)
from channel_os.voice.lexicon import Lexicon, load_lexicon
from channel_os.voice.listen import Listener, WhisperListener
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
PRONUNCIATION_CONFIG = Path("config") / "pronunciation.yaml"
THEMES_CONFIG = Path("config") / "themes.yaml"
BRAND_CONFIG = Path("config") / "brand.yaml"
RENDERABLE_STATUS = "ready_to_render"
SynthesizerFactory = Callable[[VoiceSettings, Path], Synthesizer]
ListenerFactory = Callable[[], Listener]
PreviewRenderer = Callable[..., Path]  # scenes.preview.render_preview, or a stand-in in tests
SoundMaker = Callable[[str, Path], Path]  # brand.sound.write_sound, or a stand-in in tests


def render_voice(
    episode: Mapping[str, Any],
    targets: Sequence[str],
    synthesizer: Synthesizer,
    settings: VoiceSettings,
    out_dir: Path,
    cache_dir: Path,
    lexicon: Lexicon | None = None,
    listener: Listener | None = None,
) -> None:
    """Narrate each target and record it in out_dir/timing.json.

    With a listener every chunk is heard and read again until it says what the script says;
    what could still not be confirmed is printed, so someone knows where to listen.
    """
    for target in targets:
        units = select_units(episode, target)
        entry = narrate(units, target, synthesizer, settings, out_dir, cache_dir, lexicon,
                        listener)
        update_timing(out_dir, episode["id"], target, entry)
        loudness = entry["loudness"]
        print(
            f"{target}: {entry['duration']} s, {loudness['integrated_lufs']} LUFS, "
            f"{loudness['true_peak_db']} dBTP, {len(entry['segments'])} segment(s)"
        )
        if not entry["listened"]:
            print(f"{target}: not listened to (--no-listen)")
            continue
        retakes = sum(segment["retakes"] for segment in entry["segments"])
        unsure = [(segment["id"], note) for segment in entry["segments"]
                  for note in segment["unsure"]]
        print(f"{target}: listened to; {retakes} chunk(s) read again, "
              f"{len(unsure)} place(s) not confirmed")
        for unit, note in unsure:
            print(f"  {unit}: meant [{note['meant']}] heard [{note['heard']}]")


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
    brand: Mapping[str, Any],
    out_dir: Path,
    renderer: PreviewRenderer,
    sounds: Mapping[str, Path],
    format_name: str | None = None,
    theme_name: str | None = None,
    quality: float = 1.0,
    jobs: int = 1,
) -> None:
    """Animate each target to its narration and write out_dir/preview/<target>.mp4.

    A long video also gets the logo intro after its first segment and the outro; `sounds`
    holds the audio for those ("intro", "outro"), and one without a file plays in silence.
    """
    for target in targets:
        entry = timing["targets"].get(target)
        if entry is None:
            raise ValueError(f"{target}: timing.json has no narration for it; render the voice")
        plan = plan_video(episode, target, _with_pauses(entry, out_dir), brand)
        natural = natural_format(target)
        fmt = FORMATS[format_name] if format_name else natural
        theme = pick_theme(
            themes, episode["id"], target, theme_name or declared_theme(episode, target)
        )
        name = target if fmt is natural else f"{target}.{fmt.name}"
        preview = renderer(plan, fmt, theme, out_dir / entry["narration"],
                           out_dir / "preview" / f"{name}.mp4", sounds, quality=quality, jobs=jobs)
        print(
            f"{target}: {plan.frames} frames ({plan.frames / FPS:.2f} s), "
            f"{len(plan.clips)} scene(s), {fmt.name}, theme {theme.name} -> {preview}"
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
    voice.add_argument("--no-listen", action="store_true",
                       help="skip listening to each chunk and reading it again when words are "
                            "missed (for quick tuning runs; the result is unchecked)")
    scenes = parser.add_argument_group("scenes stage")
    scenes.add_argument("--format", choices=sorted(FORMATS), default=None,
                        help="default: landscape for long, portrait for Shorts")
    scenes.add_argument("--theme", default=None, help="override the theme for this run")
    scenes.add_argument("--quality", type=float, default=1.0,
                        help="picture size as a fraction of full size, e.g. 0.5 for a quick look")
    scenes.add_argument("--intro-sound", type=Path, default=None,
                        help="audio for the logo intro; without it the intro is silent")
    scenes.add_argument("--jobs", type=int, default=1,
                        help="scenes drawn at the same time, each in its own process (default 1)")
    return parser


def _scene_tools() -> tuple[PreviewRenderer, SoundMaker]:
    """The renderer and the sound maker. Both need the scenes dependency group."""
    try:
        from channel_os.brand.sound import write_sound
        from channel_os.scenes.preview import render_preview
    except ImportError as exc:
        raise InputError(
            f"the scenes stage needs the scenes dependency group (uv sync --group scenes): {exc}"
        ) from exc
    return render_preview, write_sound


def _sounds(brand: Mapping[str, Any], work: Path, make_sound: SoundMaker,
            intro_sound: Path | None) -> dict[str, Path]:
    """The audio files for the brand scenes: the outro's music, and the intro's sound if any.

    Both are named in config/brand.yaml and made by brand/sound.py. A file given with
    --intro-sound is used for the intro instead of the configured one.
    """
    sounds: dict[str, Path] = {}
    video = brand.get("video") or {}
    music = (video.get("outro") or {}).get("music")
    if music:
        sounds["outro"] = make_sound(str(music), work / "outro.wav")
    sting = (video.get("intro") or {}).get("sound")
    if intro_sound is not None:
        sounds["intro"] = intro_sound
    elif sting:
        sounds["intro"] = make_sound(str(sting), work / "intro.wav")
    return sounds


def _whisper() -> Listener:
    """The real listener. Its model loads when it first hears something."""
    return WhisperListener()


def main(
    argv: Sequence[str] | None = None,
    make_synthesizer: SynthesizerFactory = ChatterboxSynthesizer,
    render_preview: PreviewRenderer | None = None,
    make_sound: SoundMaker | None = None,
    make_listener: ListenerFactory = _whisper,
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
            lexicon = load_lexicon(root / PRONUNCIATION_CONFIG)
            if not args.reference.is_file():
                raise InputError(f"{args.reference}: voice reference not found")
        else:
            themes = load_themes(root / THEMES_CONFIG)
            brand = load_yaml(root / BRAND_CONFIG)
            if args.intro_sound is not None and not args.intro_sound.is_file():
                raise InputError(f"{args.intro_sound}: intro sound not found")
            if args.theme is not None and args.theme not in themes.themes:
                known = ", ".join(sorted(themes.themes))
                raise InputError(f"unknown theme {args.theme!r}; config/themes.yaml has: {known}")
            if not 0.1 <= args.quality <= 1.0:
                raise InputError(f"--quality must be between 0.1 and 1, not {args.quality}")
            if not 1 <= args.jobs <= 8:
                raise InputError(f"--jobs must be between 1 and 8, not {args.jobs}")
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
            if render_preview is None or make_sound is None:
                real_renderer, real_sound = _scene_tools()
                renderer, sound_maker = render_preview or real_renderer, make_sound or real_sound
            else:
                renderer, sound_maker = render_preview, make_sound
        except InputError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        try:
            with tempfile.TemporaryDirectory() as work:
                # Only a long video has brand scenes, so only then is there music to make.
                sounds = (_sounds(brand, Path(work), sound_maker, args.intro_sound)
                          if LONG in targets else {})
                render_scenes(episode, targets, timing, themes, brand, out_dir, renderer, sounds,
                              args.format, args.theme, args.quality, args.jobs)
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
            listener = None if args.no_listen else make_listener()
            render_voice(episode, targets, synthesizer, settings, out_dir, cache_dir, lexicon,
                         listener)
    except (LoudnessError, FfmpegError, ValueError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

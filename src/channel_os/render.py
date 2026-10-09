"""Render an episode's assets. Milestone M1 implements the voice stage only.

Usage: python -m channel_os.render --episode ID --reference WAV [--only TARGET] [--model NAME]
                                   [--out DIR] [--cache-dir DIR] [--root DIR] [--allow-draft]
Exit codes: 0 rendered or skipped, 1 the episode is invalid or the render failed its checks,
2 a needed file could not be read.
"""

import argparse
import sys
import tempfile
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

from channel_os.assemble.ffmpeg import FfmpegError
from channel_os.validate import (
    REACH_PATH,
    SCHEMA_PATH,
    InputError,
    load_json,
    load_yaml,
    validate_episode,
)
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
RENDERABLE_STATUS = "ready_to_render"
SynthesizerFactory = Callable[[VoiceSettings, Path], Synthesizer]


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


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m channel_os.render",
        description="Render an episode's narration in the cloned voice.",
    )
    parser.add_argument("--episode", required=True, help="episode id, e.g. 001-idempotency")
    parser.add_argument("--reference", required=True, type=Path, help="voice reference WAV")
    parser.add_argument("--only", default="all", help="long, a Short id, or all (default)")
    parser.add_argument("--model", default=None, help="override the model in config/voice.yaml")
    parser.add_argument("--out", type=Path, default=None, help="default: <root>/out/<episode>")
    parser.add_argument("--cache-dir", type=Path, default=None, help="default: <root>/.cache/voice")
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="repo root (default: cwd)")
    parser.add_argument("--allow-draft", action="store_true", help="preview a draft episode")
    return parser


def main(
    argv: Sequence[str] | None = None,
    make_synthesizer: SynthesizerFactory = ChatterboxSynthesizer,
) -> int:
    args = _parser().parse_args(argv)
    root: Path = args.root
    episode_path = root / "content" / "episodes" / args.episode / "episode.yaml"
    try:
        episode = load_yaml(episode_path)
        findings = validate_episode(
            episode, load_json(root / SCHEMA_PATH), load_yaml(root / REACH_PATH)
        )
        settings = load_settings(root / VOICE_CONFIG, args.model)
        if not args.reference.is_file():
            raise InputError(f"{args.reference}: voice reference not found")
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

    out_dir: Path = args.out or root / "out" / args.episode
    cache_dir: Path = args.cache_dir or root / ".cache" / "voice"
    targets = all_targets(episode) if args.only == "all" else [args.only]
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

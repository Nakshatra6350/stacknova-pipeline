"""Speak a film's dialogue: one WAV per line, plus when each word is said.

    uv run --no-sync python studio/scripts/film_voice.py FILM_YAML REFERENCE OUT
    uv run --no-sync python studio/scripts/film_voice.py --digest FILM_YAML

The engineer speaks with the channel's settings; Nova's lines are read with more exaggeration and
a little faster (the robot sound is added later, by build_film.py). `--digest` prints a short hash
of what is said, so the voice job only speaks a film again when its lines change.
"""

import gc
import hashlib
import json
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
SPEAKERS = {
    "engineer": ["tempo=0.98"],
    "nova": ["exaggeration=0.75", "cfg_weight=0.35", "tempo=1.04"],
}


def load_lines(film: Path) -> list[dict[str, str]]:
    lines: list[dict[str, str]] = yaml.safe_load(film.read_text(encoding="utf-8"))["lines"]
    return lines


def digest(film: Path) -> str:
    spoken = [
        [line["id"], line["who"], line["say"]] + ([line["speed"]] if "speed" in line else [])
        for line in load_lines(film)
    ]
    return hashlib.sha256(json.dumps([SPEAKERS, spoken]).encode()).hexdigest()[:10]


def speak(film: Path, reference: Path, out: Path) -> None:
    # imported here so --digest needs nothing but PyYAML
    from channel_os.voice.lexicon import load_lexicon
    from channel_os.voice.listen import WhisperListener
    from channel_os.voice.narrate import Unit, narrate
    from channel_os.voice.reference import prepare_reference
    from channel_os.voice.settings import load_settings
    from channel_os.voice.tts import ChatterboxSynthesizer

    lines = load_lines(film)
    lexicon = load_lexicon(ROOT / "config" / "pronunciation.yaml")
    listener = WhisperListener()
    timing = {}
    for who, overrides in SPEAKERS.items():
        units = [
            Unit(line["id"], line["say"], float(line.get("speed", 1.0)))
            for line in lines
            if line["who"] == who
        ]
        if not units:
            continue
        settings = load_settings(ROOT / "config" / "voice.yaml", None, overrides)
        with tempfile.TemporaryDirectory() as work:
            prepared = Path(work) / "reference.wav"
            prepare_reference(reference, prepared, settings.reference)
            synthesizer = ChatterboxSynthesizer(settings, prepared)
            timing[who] = narrate(
                units, who, synthesizer, settings, out, out / "cache", lexicon, listener, print
            )
            del synthesizer
            gc.collect()
    (out / "timing.json").write_text(json.dumps(timing, indent=2), encoding="utf-8")
    (out / "digest.txt").write_text(digest(film), encoding="utf-8")
    print("done:", ", ".join(f"{who} {entry['duration']} s" for who, entry in timing.items()))


if __name__ == "__main__":
    if sys.argv[1] == "--digest":
        print(digest(Path(sys.argv[2])))
    else:
        speak(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))

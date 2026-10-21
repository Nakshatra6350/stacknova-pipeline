"""Look v3 draft: speak the dialogue in lines.yaml, one WAV per line plus when each word is said.

    uv run --no-sync python spikes/look-v3/voice_lines.py LINES REFERENCE OUT

The engineer speaks with the channel's settings; Nova's lines are read with more exaggeration
and a little faster. The robot sound is added afterwards with ffmpeg. Throwaway spike.
"""

import gc
import json
import sys
import tempfile
from pathlib import Path

import yaml

from channel_os.voice.lexicon import load_lexicon
from channel_os.voice.listen import WhisperListener
from channel_os.voice.narrate import Unit, narrate
from channel_os.voice.reference import prepare_reference
from channel_os.voice.settings import load_settings
from channel_os.voice.tts import ChatterboxSynthesizer

ROOT = Path(__file__).resolve().parents[2]
SPEAKERS = {
    "engineer": ["tempo=0.98"],
    "nova": ["exaggeration=0.75", "cfg_weight=0.35", "tempo=1.04"],
}


def main(lines_path: Path, reference: Path, out: Path) -> None:
    lines = yaml.safe_load(lines_path.read_text(encoding="utf-8"))["lines"]
    lexicon = load_lexicon(ROOT / "config" / "pronunciation.yaml")
    listener = WhisperListener()
    timing = {}
    for who, overrides in SPEAKERS.items():
        settings = load_settings(ROOT / "config" / "voice.yaml", None, overrides)
        units = [Unit(line["id"], line["say"]) for line in lines if line["who"] == who]
        with tempfile.TemporaryDirectory() as work:
            prepared = Path(work) / "reference.wav"
            prepare_reference(reference, prepared, settings.reference)
            synthesizer = ChatterboxSynthesizer(settings, prepared)
            timing[who] = narrate(units, who, synthesizer, settings, out, out / "cache", lexicon,
                                  listener, print)
            del synthesizer
            gc.collect()
    (out / "timing.json").write_text(json.dumps(timing, indent=2), encoding="utf-8")
    print("done:", ", ".join(f"{who} {entry['duration']} s" for who, entry in timing.items()))


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))

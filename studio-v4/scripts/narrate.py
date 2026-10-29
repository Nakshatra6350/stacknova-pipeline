r"""Narration and timeline for a look v4 video (Kokoro, free, Apache-2.0).

    python studio-v4/scripts/narrate.py ID MODEL_DIR [--voice=am_michael] [--speed=1.08]

Reads content/v4/<ID>/script.yaml, speaks each line on its own (so every scene starts exactly
when its line starts), joins them with short pauses and writes studio-v4/public/<ID>/:
narration.wav and timeline.json (each line's scene, start, end and caption words). Word times
inside a line are spread by how long each word takes to say: good enough for phrase captions.
MODEL_DIR holds kokoro-v1.0.onnx and voices-v1.0.bin.
"""

import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import yaml
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[2]
GAP = 0.22  # seconds of silence between lines
LEAD = 0.15  # silence before the first word, so frame 1 is the hook card, not mid-word
NUMBER_WORDS = {"0": 1, "1": 1, "999": 5, "1,000": 2, "3.5": 3}


def weight(word: str) -> float:
    """Roughly how long a word takes to say: its letters, or the words a number is read as."""
    bare = word.strip(".,:;?!\"'()")
    if any(ch.isdigit() for ch in bare):
        return 4.0 * NUMBER_WORDS.get(bare, len(re.sub(r"\D", "", bare)))
    return max(len(bare), 2) + 1.5


def main(episode: str, model: Path, voice: str, speed: float) -> None:
    script = yaml.safe_load((ROOT / "content" / "v4" / episode / "script.yaml").read_text(encoding="utf-8"))
    lang = "en-gb" if voice.startswith("b") else "en-us"
    kokoro = Kokoro(str(model / "kokoro-v1.0.onnx"), str(model / "voices-v1.0.bin"))
    rate = 24000
    pieces = [np.zeros(int(LEAD * rate), dtype=np.float32)]
    clock = LEAD
    lines = []
    for line in script["lines"]:
        audio, rate = kokoro.create(line["say"], voice=voice, speed=speed, lang=lang)
        audio = np.trim_zeros(np.asarray(audio, dtype=np.float32), "fb")
        start, length = clock, len(audio) / rate
        shown = line.get("show", line["say"]).split()
        weights = [weight(w) for w in shown]
        total, at, words = sum(weights), start, []
        for w, wt in zip(shown, weights):
            span = length * wt / total
            words.append({"w": w, "s": round(at, 3), "e": round(at + span, 3)})
            at += span
        lines.append({"id": line["id"], "scene": line["scene"], "start": round(start, 3),
                      "end": round(start + length, 3), "words": words})
        pieces += [audio, np.zeros(int(GAP * rate), dtype=np.float32)]
        clock += length + GAP
        print(f"{line['id']:>3} {line['scene']:<9} {start:6.2f} s  {length:5.2f} s")
    out = ROOT / "studio-v4" / "public" / episode
    out.mkdir(parents=True, exist_ok=True)
    sf.write(out / "narration.wav", np.concatenate(pieces), rate)
    timeline = {"id": episode, "keyword": script["keyword"], "voice": voice,
                "duration": round(clock, 3), "lines": lines}
    (out / "timeline.json").write_text(json.dumps(timeline, indent=1), encoding="utf-8")
    print(f"{episode}: {clock:.2f} s in {voice}")


if __name__ == "__main__":
    opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--"))
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(args[0], Path(args[1]), opts.get("voice", "am_michael"), float(opts.get("speed", "1.08")))

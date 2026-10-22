"""Speak a film's dialogue: one WAV per line, plus when each word is said.

    uv run --no-sync python studio/scripts/film_voice.py FILM_YAML REFERENCE OUT [--only ID,ID,...]
    uv run --no-sync python studio/scripts/film_voice.py --digest FILM_YAML
    uv run --no-sync python studio/scripts/film_voice.py --plan STORED.txt
    uv run --no-sync python studio/scripts/film_voice.py --merge FILM_YAML CHUNKS_DIR OUT

The engineer speaks with the channel's settings; Nova's lines are read with more exaggeration and
a little faster (the robot sound is added later, by build_film.py). `--digest` prints a short hash
of what is said, so the voice job only speaks a film again when its lines change.

A long film takes hours to speak in one job, so the voice job splits it: `--plan` lists, for every
film whose voice is not stored yet (STORED.txt: the names already in the draft Release), chunks of
at most CHUNK lines as a JSON matrix; each chunk is spoken with `--only` in a job of its own, in
parallel; `--merge` puts the chunks back together as one film's voice.

When a film already has a stored voice for an earlier version of its lines, only the lines that are
new or say something different are spoken again: the plan names that voice as the chunks' `base`
(git history tells what each stored voice said), and the merge takes the other lines from it, so
the parts of a film that did not change keep their timing and need not be drawn again.
"""

import gc
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
SPEAKERS = {
    "engineer": ["tempo=0.98"],
    "nova": ["exaggeration=0.75", "cfg_weight=0.35", "tempo=1.04"],
}
CHUNK = 8  # lines spoken by one job


def load_lines(film: Path) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = yaml.safe_load(film.read_text(encoding="utf-8"))["lines"]
    return lines


def spoken(line: dict[str, Any]) -> list[Any]:
    """What decides how a line sounds: its id, its speaker, its words and its speed."""
    return [line["id"], line["who"], line["say"]] + ([line["speed"]] if "speed" in line else [])


def digest_of(lines: list[dict[str, Any]]) -> str:
    said = json.dumps([SPEAKERS, [spoken(x) for x in lines]])
    return hashlib.sha256(said.encode()).hexdigest()[:10]


def digest(film: Path) -> str:
    return digest_of(load_lines(film))


def stored_name(film: Path) -> str:
    return f"film-{film.parent.name}-voice-{digest(film)}.zip"


def lines_spoken_as(film: Path, voice_digest: str) -> list[dict[str, Any]] | None:
    """The lines of the version of `film` whose voice has this digest, from git history."""
    rel = film.relative_to(ROOT).as_posix()
    log = subprocess.run(["git", "log", "--format=%H", "--", rel], cwd=ROOT,
                         capture_output=True, text=True, check=False).stdout.split()
    for rev in log:
        shown = subprocess.run(["git", "show", f"{rev}:{rel}"], cwd=ROOT,
                               capture_output=True, text=True, check=False)
        if shown.returncode:
            continue
        lines: list[dict[str, Any]] = (yaml.safe_load(shown.stdout) or {}).get("lines") or []
        if digest_of(lines) == voice_digest:
            return lines
    return None


def reusable(film: Path, have: set[str]) -> tuple[str, set[str]]:
    """The stored voice of this film that already says the most of its lines, and those lines."""
    now = {line["id"]: spoken(line) for line in load_lines(film)}
    best: tuple[str, set[str]] = ("", set())
    for name in sorted(have):
        m = re.fullmatch(rf"film-{re.escape(film.parent.name)}-voice-([0-9a-f]{{10}})\.zip", name)
        old = lines_spoken_as(film, m[1]) if m else None
        if old is None:
            continue
        same = {line["id"] for line in old if now.get(line["id"]) == spoken(line)}
        if len(same) > len(best[1]):
            best = (name, same)
    return best


def plan(stored: Path) -> list[dict[str, str]]:
    have = set(stored.read_text(encoding="utf-8").split())
    matrix = []
    for film in sorted((ROOT / "studio" / "films").glob("*/film.yaml")):
        if stored_name(film) in have:
            continue
        base, keep = reusable(film, have)
        ids = [line["id"] for line in load_lines(film) if line["id"] not in keep]
        # a film whose lines were only dropped or moved still needs one (empty) chunk to merge
        for n in range(0, max(len(ids), 1), CHUNK):
            matrix.append(
                {
                    "film": film.parent.name,
                    "chunk": f"{n // CHUNK:02d}",
                    "ids": ",".join(ids[n : n + CHUNK]),
                    "base": base,
                }
            )
    return matrix


def speak(film: Path, reference: Path, out: Path, only: set[str] | None = None) -> None:
    # imported here so --digest and --plan need nothing but PyYAML
    from channel_os.voice.lexicon import load_lexicon
    from channel_os.voice.listen import WhisperListener
    from channel_os.voice.narrate import Unit, narrate
    from channel_os.voice.reference import prepare_reference
    from channel_os.voice.settings import load_settings
    from channel_os.voice.tts import ChatterboxSynthesizer

    lines = [line for line in load_lines(film) if only is None or line["id"] in only]
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


def merge(film: Path, chunks: Path, out: Path) -> None:
    """One film's voice from its spoken chunks: every WAV, and one timing record per speaker.

    Chunks are read in name order, so a stored voice unpacked as "0-base" comes first and any line
    spoken again in a chunk replaces it; lines the film no longer has are left out."""
    lines = load_lines(film)
    order = {line["id"]: n for n, line in enumerate(lines)}
    who_says = {line["id"]: line["who"] for line in lines}
    timing: dict[str, dict[str, Any]] = {}
    chosen: dict[str, tuple[Path, dict[str, Any]]] = {}
    for chunk in sorted(p for p in chunks.iterdir() if p.is_dir()):
        part = json.loads((chunk / "timing.json").read_text(encoding="utf-8"))
        for who, entry in part.items():
            timing.setdefault(who, {k: v for k, v in entry.items() if k != "segments"})
            for seg in entry["segments"]:
                if who_says.get(seg["id"]) == who:
                    chosen[seg["id"]] = (chunk, seg)
    for who, whole in timing.items():
        segs = [chosen[i] for i in sorted(chosen, key=order.__getitem__) if who_says[i] == who]
        whole["segments"] = [seg for _, seg in segs]
        whole["duration"] = round(sum(float(seg["duration"]) for _, seg in segs), 3)
        for chunk, seg in segs:
            dest = out / seg["file"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(chunk / seg["file"], dest)
    missing = set(order) - {seg["id"] for entry in timing.values() for seg in entry["segments"]}
    if missing:
        raise SystemExit(f"{film.parent.name}: no voice for {sorted(missing)}")
    (out / "timing.json").write_text(json.dumps(timing, indent=2), encoding="utf-8")
    (out / "digest.txt").write_text(digest(film), encoding="utf-8")
    print(f"{film.parent.name}: merged {sum(len(e['segments']) for e in timing.values())} lines")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[0] == "--digest":
        print(digest(Path(args[1])))
    elif args[0] == "--name":
        print(stored_name(Path(args[1])))
    elif args[0] == "--plan":
        print(json.dumps(plan(Path(args[1]))))
    elif args[0] == "--merge":
        merge(Path(args[1]), Path(args[2]), Path(args[3]))
    else:
        only = set(args[args.index("--only") + 1].split(",")) if "--only" in args else None
        speak(Path(args[0]), Path(args[1]), Path(args[2]), only)

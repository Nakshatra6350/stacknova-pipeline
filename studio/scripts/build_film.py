"""Lay a film's spoken lines on a timeline, give every beat its time, and mix the sound.

    .venv\\Scripts\\python.exe studio/scripts/build_film.py FILM_ID VOICE_DIR

Reads studio/films/<id>/film.yaml and VOICE_DIR (timing.json and voice/<who>/seg-<id>.wav from the
film voice job). Writes studio/public/films/<id>/timeline.json, which the studio draws from, and
out/films/<id>/mix.wav (voices, Nova made robotic, sound effects and a quiet music bed).

Times in film.yaml are anchors, so a script edit never leaves a beat behind:
  12.5          seconds from the start
  e2            when line e2 starts            e2>          when it ends
  e2.doubles    when the word is said          e2.doubles>  when the word ends
  e3.one#2      the second time it is said     end          when the end card starts
  any of these + or - seconds: e2.doubles-0.3; or a name from `events`
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path
from typing import Any

import numpy as np
import yaml

from channel_os.captions.align import script_words

ROOT = Path(__file__).resolve().parents[2]
SR = 48000
FPS = 30
LEAD = 0.55  # silence before the first line
PAUSE = 0.3  # after a line, unless it says `after`
TAIL = 2.6  # the end card after the last line
NOVA_FILTER = (
    "asetrate=48000*1.16,aresample=48000,atempo=0.862,asplit=2[a][b];"
    "[b]afftfilt=real='hypot(re,im)':imag='0':win_size=512:overlap=0.75,volume=0.5[r];"
    "[a][r]amix=inputs=2:weights='1 0.5':normalize=0,highpass=f=170,"
    "aecho=0.7:0.45:6:0.3,equalizer=f=3200:t=q:w=1.2:g=3"
)
ANCHOR = re.compile(
    r"^(?P<base>[A-Za-z_]\w*)(?:\.(?P<word>[a-z0-9]+)(?:#(?P<n>\d+))?)?"
    r"(?P<end>>)?(?P<off>[+-]\d+(?:\.\d+)?)?$"
)


def ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    assert path, "ffmpeg not found"
    return path


def read_audio(path: Path, filters: str | None = None) -> np.ndarray:
    args = [ffmpeg(), "-hide_banner", "-loglevel", "error", "-i", str(path)]
    if filters:
        args += ["-filter_complex", filters]
    args += ["-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    raw = subprocess.run(args, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def envelope(audio: np.ndarray) -> list[float]:
    """How open the mouth is, 30 times a second."""
    hop = SR // FPS
    frames = max(1, len(audio) // hop)
    rms = np.array(
        [np.sqrt(np.mean(audio[i * hop : (i + 1) * hop] ** 2) + 1e-12) for i in range(frames)]
    )
    top = np.percentile(rms, 92) or 1.0
    env = np.clip((rms / top - 0.12) / 0.88, 0, 1)
    env = np.convolve(env, [0.25, 0.5, 0.25], mode="same")  # so the mouth does not flicker
    return [round(float(x), 3) for x in env]


def timed_words(
    say: str, words: list[list[float]], duration: float
) -> list[tuple[int, str, float, float]]:
    """Every word of `say` with a start and end; words the recogniser missed are filled in."""
    plain = " ".join(say.split())
    by_offset = {int(w[0]): (w[1], w[2]) for w in words}
    out: list[list[Any]] = [
        [off, key, *by_offset.get(off, (None, None))] for off, key in script_words(say)
    ]
    known = [i for i, w in enumerate(out) if w[2] is not None]
    for i, w in enumerate(out):
        if w[2] is not None:
            continue
        before = max([k for k in known if k < i], default=None)
        after = min([k for k in known if k > i], default=None)
        t0 = out[before][3] if before is not None else 0.0
        t1 = out[after][2] if after is not None else duration
        o0 = out[before][0] if before is not None else 0
        o1 = out[after][0] if after is not None else len(plain)
        w[2] = t0 + (t1 - t0) * (w[0] - o0) / max(1, o1 - o0)
        w[3] = w[2] + 0.18
    return [(o, key, float(s), float(e)) for o, key, s, e in out]


def display_words(
    say: str, show: str, timed: list[tuple[int, str, float, float]]
) -> list[dict[str, Any]]:
    """Caption words for `show`, timed by where they sit in the spoken line."""
    plain = " ".join(say.split())
    starts = [(o / max(1, len(plain)), s) for o, _, s, _ in timed]
    ends = timed[-1][3] if timed else 0.0
    shown = " ".join(show.split())
    tokens = [(m.start(), m.group()) for m in re.finditer(r"\S+", shown)]
    out = []
    for pos, token in tokens:
        f = pos / max(1, len(shown))
        s = float(np.interp(f, [x for x, _ in starts] + [1.0], [y for _, y in starts] + [ends]))
        out.append({"w": token, "s": round(s, 3)})
    for i, w in enumerate(out):
        w["e"] = round(out[i + 1]["s"] if i + 1 < len(out) else ends, 3)
    return out


# ------------------------------------------------------------------ synthesised sound


def tone(freq: float, dur: float, decay: float, amp: float = 0.5) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    return (amp * np.sin(2 * np.pi * freq * t) * np.exp(-decay * t)).astype(np.float32)


def noise(dur: float, decay: float, amp: float = 0.4, seed: int = 1) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    return (amp * np.random.default_rng(seed).uniform(-1, 1, len(t)) * np.exp(-decay * t)).astype(
        np.float32
    )


def lowpass(x: np.ndarray, k: int = 8) -> np.ndarray:
    return np.convolve(x, np.ones(k) / k, mode="same").astype(np.float32)


def together(*parts: np.ndarray) -> np.ndarray:
    out = np.zeros(max(len(x) for x in parts), dtype=np.float32)
    for x in parts:
        out[: len(x)] += x
    return out


def sounds() -> dict[str, np.ndarray]:
    def t(d: float) -> np.ndarray:
        return np.arange(int(d * SR)) / SR

    clank = together(
        tone(170, 0.35, 16, 0.5), lowpass(noise(0.35, 30, 0.35), 6), tone(620, 0.2, 40, 0.15)
    )
    ding = together(tone(1320, 1.2, 4.5, 0.32), tone(1980, 1.0, 6, 0.18), tone(2640, 0.6, 9, 0.08))
    tt = t(1.6)
    sweep = (0.22 * np.sin(2 * np.pi * (300 * tt + 900 * tt**2)) * np.exp(-1.2 * tt)).astype(
        np.float32
    )
    whoosh = (lowpass(noise(1.6, 1.5, 0.35, 7), 24) * np.minimum(1, tt * 4)).astype(np.float32)
    vision = together(sweep, whoosh, tone(880, 1.6, 2.2, 0.12), tone(1760, 1.4, 3, 0.07))
    ta = t(0.8)
    alarm = (0.16 * np.sign(np.sin(2 * np.pi * 520 * ta)) * ((ta % 0.26) < 0.13)).astype(np.float32)
    thud = together(tone(58, 0.6, 7, 0.95), lowpass(noise(0.3, 18, 0.5, 3), 16))
    tick = together(tone(980, 0.16, 28, 0.3), tone(1470, 0.12, 36, 0.12))
    tm = t(1.4)
    arp = np.zeros_like(tm)
    for i, f in enumerate(440 * 2 ** (np.array([0, 3, 7, 10, 12, 15, 19, 22]) / 12)):
        start = i * 0.11
        arp += (
            0.14
            * np.sin(2 * np.pi * f * (tm - start))
            * np.exp(-5 * np.clip(tm - start, 0, None))
            * (tm >= start)
        )
    hit = together(
        tone(110, 2.2, 1.6, 0.6),
        tone(55, 2.2, 1.2, 0.5),
        tone(220, 1.5, 2.5, 0.2),
        lowpass(noise(0.5, 6, 0.25, 9), 20),
    )
    tw = t(0.35)
    whip = (0.3 * np.sin(2 * np.pi * (1200 * tw - 1400 * tw**2)) * np.exp(-6 * tw)).astype(
        np.float32
    )
    tp = t(0.25)
    pop = (0.25 * np.sin(2 * np.pi * (500 * tp + 1600 * tp**2)) * np.exp(-14 * tp)).astype(
        np.float32
    )
    td = t(1.2)
    rise = (
        0.18
        * np.sin(2 * np.pi * (200 * td + 260 * td**2))
        * np.minimum(1, td * 3)
        * np.exp(-0.8 * td)
    ).astype(np.float32)
    return {
        "clank": clank,
        "ding": ding,
        "vision": vision,
        "alarm": alarm,
        "thud": thud,
        "tick": tick,
        "arp": arp.astype(np.float32),
        "hit": hit,
        "whip": whip,
        "pop": pop,
        "rise": rise,
    }


def brand_sound(name: str) -> np.ndarray:
    """One of the channel's own sounds (src/channel_os/brand/sound.py), such as nod-up."""
    from channel_os.brand.sound import write_sound

    with tempfile.TemporaryDirectory() as work:
        return read_audio(write_sound(name, Path(work) / f"{name}.wav"))


def music(duration: float) -> np.ndarray:
    """A quiet minor pad with a soft pulse, 4 chords of 3.2 s each, looping."""
    chords = [
        [220.0, 261.63, 329.63],
        [174.61, 220.0, 261.63],
        [130.81, 196.0, 261.63],
        [196.0, 246.94, 293.66],
    ]
    n = int(duration * SR)
    t = np.arange(n) / SR
    out = np.zeros(n, dtype=np.float64)
    idx = (t // 3.2).astype(int) % 4
    for k in range(4):
        mask = idx == k
        for f in chords[k]:
            out[mask] += 0.05 * (
                np.sin(2 * np.pi * f * t[mask]) + 0.4 * np.sin(2 * np.pi * f * 1.003 * t[mask])
            )
        out[mask] += 0.06 * np.sin(2 * np.pi * chords[k][0] / 2 * t[mask])
    out *= 0.6 + 0.4 * np.abs(np.sin(np.pi * t / 0.6))
    fade = np.minimum(1, np.minimum(t / 1.5, (duration - t) / 2.0))
    return (out * np.clip(fade, 0, 1)).astype(np.float32)


def add(mix: np.ndarray, clip: np.ndarray, at: float, gain: float = 1.0) -> None:
    i = max(0, int(at * SR))
    if i >= len(mix):
        return
    j = min(len(mix), i + len(clip))
    mix[i:j] += clip[: j - i] * gain


# ------------------------------------------------------------------ the timeline


class Clock:
    """Turns anchors into seconds."""

    def __init__(self, placed: list[dict[str, Any]], end: float) -> None:
        self.lines = {p["id"]: p for p in placed}
        self.events: dict[str, float] = {"start": 0.0, "end": end}

    def __call__(self, anchor: Any) -> float:
        if isinstance(anchor, int | float):
            return float(anchor)
        m = ANCHOR.match(str(anchor).replace(" ", ""))
        if not m:
            raise ValueError(f"cannot read the time {anchor!r}")
        base, word, off = m["base"], m["word"], float(m["off"] or 0)
        if word is None and base in self.events:
            return self.events[base] + off
        if base not in self.lines:
            raise ValueError(f"no line or event called {base!r} (in {anchor!r})")
        line = self.lines[base]
        if word is None:
            return (line["end"] if m["end"] else line["start"]) + off
        hits = [w for w in line["said"] if w["k"] == word]
        if not hits:
            said = " ".join(w["k"] for w in line["said"])
            raise ValueError(f"{base} never says {word!r} (in {anchor!r}); it says: {said}")
        hit = hits[min(int(m["n"] or 1), len(hits)) - 1]
        return (hit["e"] if m["end"] else hit["s"]) + off


def resolve(beats: list[dict[str, Any]], clock: Clock) -> list[dict[str, Any]]:
    """Each beat's `at` and `until` become seconds (a shot's `at` is a place, not a time)."""
    out = []
    for beat in beats:
        beat = dict(beat)
        for key in ("at", "until"):
            if key in beat:
                beat[key] = round(clock(beat[key]), 3)
        out.append(beat)
    return out


def main(film_id: str, voice_dir: Path) -> None:
    film = yaml.safe_load(
        (ROOT / "studio" / "films" / film_id / "film.yaml").read_text(encoding="utf-8")
    )
    timing = json.loads((voice_dir / "timing.json").read_text(encoding="utf-8"))
    segs = {seg["id"]: seg for entry in timing.values() for seg in entry["segments"]}
    cursor = float(film.get("lead", LEAD))
    placed: list[dict[str, Any]] = []
    segment = None
    for line in film["lines"]:
        segment = line.get("segment", segment)
        seg = segs[line["id"]]
        audio = read_audio(voice_dir / seg["file"], NOVA_FILTER if line["who"] == "nova" else None)
        dur = len(audio) / SR
        timed = timed_words(line["say"], seg["words"], dur)
        shown = display_words(line["say"], line.get("show", line["say"]), timed)
        placed.append(
            {
                "id": line["id"],
                "who": line["who"],
                "start": round(cursor, 3),
                "end": round(cursor + dur, 3),
                "words": [
                    {"w": w["w"], "s": round(cursor + w["s"], 3), "e": round(cursor + w["e"], 3)}
                    for w in shown
                ],
                "said": [
                    {"k": key, "s": round(cursor + s, 3), "e": round(cursor + e, 3)}
                    for _, key, s, e in timed
                ],
                "env": envelope(audio),
                "audio": audio,
                "segment": segment,
            }
        )
        cursor += dur + float(line.get("after", PAUSE))
    end = round(placed[-1]["end"] + 0.15, 3)
    duration = round(end + float(film.get("tail", TAIL)), 3)
    clock = Clock(placed, end)
    for name, anchor in (film.get("events") or {}).items():
        clock.events[name] = round(clock(anchor), 3)

    mix = np.zeros(int(duration * SR) + SR, dtype=np.float32)
    for p in placed:
        add(mix, p["audio"], p["start"])
    fx = sounds()
    long = film.get("format") == "long"
    for cue in film.get("sfx") or []:
        add(
            mix,
            fx[cue["sound"]] if cue["sound"] in fx else brand_sound(cue["sound"]),
            clock(cue["at"]),
            float(cue.get("gain", 0.7)),
        )
    # a Short ends on a hit; a long video on the channel's outro music (config/brand.yaml)
    if long:
        add(mix, brand_sound("lofi-nod"), end, 1.0)
    else:
        add(mix, fx["hit"], end, 0.8)
    add(mix, music(duration), 0, float(film.get("music", 0.55)))
    mix = mix[: int(duration * SR)]
    mix = mix / (float(np.max(np.abs(mix))) or 1.0) * 0.89
    out = ROOT / "out" / "films" / film_id
    out.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out / "mix-raw.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(
        [
            ffmpeg(),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(out / "mix-raw.wav"),
            "-af",
            "loudnorm=I=-14:TP=-1.5:LRA=11",
            "-ar",
            str(SR),
            "-ac",
            "2",
            str(out / "mix.wav"),
        ],
        check=True,
    )

    for p in placed:
        p.pop("audio")
    spec = {k: v for k, v in film.items() if k not in ("lines", "events", "sfx")}
    spec["beats"] = sorted(resolve(film.get("beats") or [], clock), key=lambda b: b["at"])
    timeline = {
        "duration": duration,
        "fps": FPS,
        "lines": placed,
        "events": dict(sorted(clock.events.items(), key=lambda kv: kv[1])),
        "chapters": [
            {"segment": p["segment"], "start": p["start"]}
            for n, p in enumerate(placed)
            if p["segment"] and (n == 0 or placed[n - 1]["segment"] != p["segment"])
        ],
        "film": spec,
    }
    dest = ROOT / "studio" / "public" / "films" / film_id
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "timeline.json").write_text(
        json.dumps(timeline, separators=(",", ":"), ensure_ascii=False), encoding="utf-8"
    )
    print(
        f"{film_id}: {duration} s, {len(placed)} lines, {len(spec['beats'])} beats",
        "->",
        dest / "timeline.json",
    )


if __name__ == "__main__":
    main(sys.argv[1], Path(sys.argv[2]))

"""Look v3 draft: lay the spoken lines on a timeline, make Nova sound like a robot, add sound
effects and a soft music bed, and write the timeline the scene page draws from.

    .venv\\Scripts\\python.exe spikes/look-v3/build_timeline.py VOICE_DIR OUT_DIR

VOICE_DIR holds timing.json and voice/<who>/seg-<id>.wav from the look-v3 voice job.
Writes OUT_DIR/timeline.json and OUT_DIR/mix.wav. Throwaway spike.
"""

import json
import re
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
import yaml

from channel_os.captions.align import script_words

HERE = Path(__file__).resolve().parent
SR = 48000
FPS = 30
LEAD = 0.55
# Pause after each line (seconds): room for the moments the picture needs.
AFTER = {"n1": 0.15, "e1": 0.2, "n2": 0.25, "e2": 1.35, "e3": 0.2, "e4": 0.55, "n3": 0.15,
         "e5": 1.0, "n4": 0.2, "e6": 0.45, "n5": 0.2, "e7": 2.8}
NOVA_FILTER = ("asetrate=48000*1.16,aresample=48000,atempo=0.862,asplit=2[a][b];"
               "[b]afftfilt=real='hypot(re,im)':imag='0':win_size=512:overlap=0.75,volume=0.5[r];"
               "[a][r]amix=inputs=2:weights='1 0.5':normalize=0,highpass=f=170,"
               "aecho=0.7:0.45:6:0.3,equalizer=f=3200:t=q:w=1.2:g=3")


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
    hop = SR // FPS
    frames = max(1, len(audio) // hop)
    rms = np.array([np.sqrt(np.mean(audio[i * hop:(i + 1) * hop] ** 2) + 1e-12) for i in range(frames)])
    top = np.percentile(rms, 92) or 1.0
    env = np.clip((rms / top - 0.12) / 0.88, 0, 1)
    # a little smoothing so the mouth does not flicker
    env = np.convolve(env, [0.25, 0.5, 0.25], mode="same")
    return [round(float(x), 3) for x in env]


def timed_words(say: str, words: list[list[float]], duration: float) -> list[tuple[int, str, float, float]]:
    """Every word of `say` with a start and end; words the recogniser missed are filled in."""
    plain = " ".join(say.split())
    script = script_words(say)
    by_offset = {int(w[0]): (w[1], w[2]) for w in words}
    out: list[list] = [[off, key, *by_offset.get(off, (None, None))] for off, key in script]
    # fill gaps by interpolating between known neighbours (by character position)
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
        k = (w[0] - o0) / max(1, o1 - o0)
        w[2] = t0 + (t1 - t0) * k
        w[3] = w[2] + 0.18
    return [(o, key, float(s), float(e)) for o, key, s, e in out]


def display_words(say: str, show: str, timed: list[tuple[int, str, float, float]]) -> list[dict]:
    """Caption words for `show`, timed by where they sit in the spoken line."""
    plain = " ".join(say.split())
    starts = [(o / max(1, len(plain)), s) for o, _, s, _ in timed]
    ends = timed[-1][3] if timed else 0.0
    tokens = [(m.start(), m.group()) for m in re.finditer(r"\S+", " ".join(show.split()))]
    total = max(1, len(" ".join(show.split())))
    out = []
    for i, (pos, token) in enumerate(tokens):
        f = pos / total
        s = float(np.interp(f, [x for x, _ in starts] + [1.0], [y for _, y in starts] + [ends]))
        out.append({"w": token, "s": round(s, 3)})
    for i, w in enumerate(out):
        w["e"] = round(out[i + 1]["s"] if i + 1 < len(out) else ends, 3)
    return out


# ------------------------------------------------------------------ synthesised sound

def tone(freq, dur, decay, amp=0.5):
    t = np.arange(int(dur * SR)) / SR
    return (amp * np.sin(2 * np.pi * freq * t) * np.exp(-decay * t)).astype(np.float32)


def noise(dur, decay, amp=0.4, seed=1):
    t = np.arange(int(dur * SR)) / SR
    return (amp * np.random.default_rng(seed).uniform(-1, 1, len(t)) * np.exp(-decay * t)).astype(np.float32)


def lowpass(x, k=8):
    return np.convolve(x, np.ones(k) / k, mode="same").astype(np.float32)


def together(*parts: np.ndarray) -> np.ndarray:
    """Sum clips of different lengths, padding the shorter ones with silence."""
    out = np.zeros(max(len(x) for x in parts), dtype=np.float32)
    for x in parts:
        out[: len(x)] += x
    return out


def sfx() -> dict[str, np.ndarray]:
    t = lambda d: np.arange(int(d * SR)) / SR  # noqa: E731
    clank = together(tone(170, 0.35, 16, 0.5), lowpass(noise(0.35, 30, 0.35), 6), tone(620, 0.2, 40, 0.15))
    ding = together(tone(1320, 1.2, 4.5, 0.32), tone(1980, 1.0, 6, 0.18), tone(2640, 0.6, 9, 0.08))
    tt = t(1.6)
    sweep = (0.22 * np.sin(2 * np.pi * (300 * tt + 900 * tt ** 2)) * np.exp(-1.2 * tt)).astype(np.float32)
    whoosh = (lowpass(noise(1.6, 1.5, 0.35, 7), 24) * np.minimum(1, tt * 4)).astype(np.float32)
    vision = together(sweep, whoosh, tone(880, 1.6, 2.2, 0.12), tone(1760, 1.4, 3, 0.07))
    ta = t(0.8)
    alarm = (0.16 * np.sign(np.sin(2 * np.pi * 520 * ta)) * ((ta % 0.26) < 0.13)).astype(np.float32)
    thud = together(tone(58, 0.6, 7, 0.95), lowpass(noise(0.3, 18, 0.5, 3), 16))
    tick = together(tone(980, 0.16, 28, 0.3), tone(1470, 0.12, 36, 0.12))
    tm = t(1.4)
    notes = 440 * 2 ** (np.array([0, 3, 7, 10, 12, 15, 19, 22]) / 12)
    arp = np.zeros_like(tm)
    for i, f in enumerate(notes):
        start = i * 0.11
        seg = tm >= start
        arp += 0.14 * np.sin(2 * np.pi * f * (tm - start)) * np.exp(-5 * np.clip(tm - start, 0, None)) * seg
    hit = together(tone(110, 2.2, 1.6, 0.6), tone(55, 2.2, 1.2, 0.5), tone(220, 1.5, 2.5, 0.2), lowpass(noise(0.5, 6, 0.25, 9), 20))
    tw = t(0.35)
    whip = (0.3 * np.sin(2 * np.pi * (1200 * tw - 1400 * tw ** 2)) * np.exp(-6 * tw)).astype(np.float32)
    return {"clank": clank, "ding": ding, "vision": vision, "alarm": alarm, "thud": thud,
            "tick": tick, "arp": arp.astype(np.float32), "hit": hit, "whip": whip}


def music(duration: float) -> np.ndarray:
    """A quiet minor pad with a soft pulse, 4 chords of 3.2 s each, looping."""
    chords = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [130.81, 196.0, 261.63], [196.0, 246.94, 293.66]]
    n = int(duration * SR)
    t = np.arange(n) / SR
    out = np.zeros(n, dtype=np.float64)
    idx = (t // 3.2).astype(int) % 4
    for k in range(4):
        mask = idx == k
        for f in chords[k]:
            out[mask] += 0.05 * (np.sin(2 * np.pi * f * t[mask]) + 0.4 * np.sin(2 * np.pi * f * 1.003 * t[mask]))
        bass = chords[k][0] / 2
        out[mask] += 0.06 * np.sin(2 * np.pi * bass * t[mask])
    pulse = 0.6 + 0.4 * np.abs(np.sin(np.pi * t / 0.6))  # gentle movement every 0.6 s
    out *= pulse
    fade = np.minimum(1, np.minimum(t / 1.5, (duration - t) / 2.0))
    return (out * np.clip(fade, 0, 1)).astype(np.float32)


def add(mix: np.ndarray, clip: np.ndarray, at: float, gain: float = 1.0) -> None:
    i = int(at * SR)
    if i >= len(mix):
        return
    j = min(len(mix), i + len(clip))
    mix[i:j] += clip[: j - i] * gain


def main(voice_dir: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    lines = yaml.safe_load((HERE / "lines.yaml").read_text(encoding="utf-8"))["lines"]
    timing = json.loads((voice_dir / "timing.json").read_text(encoding="utf-8"))
    segs = {seg["id"]: seg for entry in timing.values() for seg in entry["segments"]}
    cursor = LEAD
    placed = []
    for line in lines:
        seg = segs[line["id"]]
        wav = voice_dir / seg["file"]
        audio = read_audio(wav, NOVA_FILTER if line["who"] == "nova" else None)
        dur = len(audio) / SR
        timed = timed_words(line["say"], seg["words"], dur)
        shown = display_words(line["say"], line.get("show", line["say"]), timed)
        placed.append({
            "id": line["id"], "who": line["who"], "start": round(cursor, 3), "end": round(cursor + dur, 3),
            "words": [{"w": w["w"], "s": round(cursor + w["s"], 3), "e": round(cursor + w["e"], 3)} for w in shown],
            "said": [{"k": key, "s": round(cursor + s, 3), "e": round(cursor + e, 3)} for _, key, s, e in timed],
            "env": envelope(audio), "audio": audio,
        })
        cursor += dur + AFTER.get(line["id"], 0.25)
    duration = round(cursor, 3)

    def at(line_id: str, key: str | None = None, which: int = 0, end: bool = False) -> float:
        line = next(p for p in placed if p["id"] == line_id)
        if key is None:
            return line["end"] if end else line["start"]
        hits = [w for w in line["said"] if w["k"] == key]
        return (hits[min(which, len(hits) - 1)]["e" if end else "s"]) if hits else line["start"]

    mix = np.zeros(int(duration * SR) + SR, dtype=np.float32)
    for p in placed:
        add(mix, p["audio"], p["start"], 1.0)
    fx = sfx()
    events = {
        "open0": at("n1", "zero"), "open1": at("n1", "one"), "open2": at("n1", "two", which=1),
        "vision": at("e2", end=True) + 0.05,
        "hash": at("e3", "hash"), "mix": at("e3", "mixes"),
        "bits": at("e4", "last"), "seven": at("e4", "seven"), "jump": at("e4", "jump", end=True),
        "o1": at("e5", "o"),
        "drop": at("n4") - 0.85, "legal": at("n4", "legal"),
        "chain": at("e6", "chain"), "equals": at("e6", "equals"),
        "eight": at("n5", "eight"), "tree": at("e7", "tree"), "part2": at("e7", "two"),
        "end": at("e7", end=True) + 0.15,
    }
    for k in ("open0", "open1", "open2"):
        add(mix, fx["clank"], events[k], 0.55)
    add(mix, fx["vision"], events["vision"] - 0.2, 0.9)
    add(mix, fx["whip"], events["seven"] - 0.1, 0.7)
    add(mix, fx["ding"], events["jump"] - 0.15, 0.6)
    add(mix, fx["thud"], events["drop"] + 0.45, 0.9)
    add(mix, fx["alarm"], events["drop"] + 0.5, 0.55)
    for i in range(6):
        add(mix, fx["tick"], events["eight"] - 1.2 + i * 0.2, 0.6)
    add(mix, fx["arp"], events["tree"] - 0.1, 0.8)
    add(mix, fx["hit"], events["end"], 0.8)
    add(mix, music(duration), 0, 0.55)
    mix = mix[: int(duration * SR)]
    peak = float(np.max(np.abs(mix))) or 1.0
    mix = mix / peak * 0.89
    raw = out / "mix-raw.wav"
    with wave.open(str(raw), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw),
                    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), "-ac", "2", str(out / "mix.wav")], check=True)
    for p in placed:
        p.pop("audio")
    (out / "timeline.json").write_text(json.dumps({"duration": duration, "fps": FPS, "lines": placed,
                                                    "events": {k: round(v, 3) for k, v in events.items()}},
                                                   indent=1), encoding="utf-8")
    print(f"duration {duration} s; events:", {k: round(v, 2) for k, v in events.items()})


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))

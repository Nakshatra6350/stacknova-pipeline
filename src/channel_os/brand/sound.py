"""The channel's own sounds, synthesised from sine waves and noise (look v2).

Nothing here is sampled or downloaded, so the channel owns every sound outright and none can be
claimed on YouTube. `lofi-nod` is the outro bed the owner chose on 12 October 2026 (the second
of three options): mellow keys over a soft beat, 84 bpm, 13 seconds. The intro has no sound from
here: two rounds of synthesised intros were rejected, and it will use a sound the owner picks.

Needs numpy, so it is imported only by the scenes stage.
"""

import wave
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np

SR = 48000
SEED = 11  # fixed, so the same sound is written every time
Wave = Any  # a numpy array; numpy is untyped for mypy in this project


def _hz(midi: float) -> float:
    return float(440.0 * 2 ** ((midi - 69) / 12))


def _time(seconds: float) -> Wave:
    return np.arange(int(seconds * SR)) / SR


def _filter(x: Wave, cutoff: float, high: bool = False, order: int = 2) -> Wave:
    spectrum = np.fft.rfft(x)
    ratio = (np.fft.rfftfreq(len(x), 1 / SR) / cutoff) ** (2 * order)
    gain = ratio / (1 + ratio) if high else 1 / (1 + ratio)
    return np.fft.irfft(spectrum * np.sqrt(gain), len(x))


def _swell(n: int, attack: float, release: float) -> Wave:
    env = np.ones(n)
    a, r = min(n, int(attack * SR)), min(n, int(release * SR))
    env[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    env[n - r:] *= np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return env


def _keys(midi: float, seconds: float = 2.6) -> Wave:
    """A mellow electric-piano tone: a sine bent by a second sine that dies away quickly."""
    t, f = _time(seconds), _hz(midi)
    x = np.sin(2 * np.pi * f * t + 1.1 * np.exp(-t * 5) * np.sin(2 * np.pi * 2 * f * t))
    x = x * np.exp(-t * 1.7)
    x[: int(0.006 * SR)] *= np.linspace(0, 1, int(0.006 * SR))
    return x * 0.5


def _kick(seconds: float = 0.45, low: float = 44) -> Wave:
    t = _time(seconds)
    phase = 2 * np.pi * (low * t + 70 / 26 * (1 - np.exp(-t * 26)))
    return np.sin(phase) * np.exp(-t * 8) * 0.9


def _hat(rng: Any, seconds: float = 0.09) -> Wave:
    noise = _filter(rng.standard_normal(int(seconds * SR)), 7500, high=True)
    return noise * np.exp(-_time(seconds) * 70) * 0.25


def _snare(rng: Any, seconds: float = 0.28) -> Wave:
    t = _time(seconds)
    noise = _filter(_filter(rng.standard_normal(len(t)), 900, high=True), 6000) * np.exp(-t * 20)
    return (noise * 0.5 + np.sin(2 * np.pi * 185 * t) * np.exp(-t * 26) * 0.4) * 0.6


def _sub(midi: float, seconds: float) -> Wave:
    t = _time(seconds)
    return np.sin(2 * np.pi * _hz(midi) * t) * _swell(len(t), 0.05, min(0.4, seconds / 2)) * 0.5


class _Mix:
    def __init__(self, seconds: float, rng: Any) -> None:
        self.buf = np.zeros((2, int(seconds * SR)))
        self.rng = rng

    def add(self, x: Wave, at: float, gain: float = 1.0, pan: float = 0.0) -> None:
        start = int(at * SR)
        stereo = np.stack([x * (1 - max(0.0, pan)), x * (1 + min(0.0, pan))])
        end = min(self.buf.shape[1], start + stereo.shape[1])
        if end > start:
            self.buf[:, start:end] += stereo[:, : end - start] * gain

    def render(self, room: float, wet: float, tone: float, fade: float) -> Wave:
        t = _time(room)
        out = np.zeros_like(self.buf)
        for channel in range(2):
            dry = self.buf[channel]
            tail = _filter(self.rng.standard_normal(len(t)), 5200) * np.exp(-t * 6.9 / room)
            size = len(dry) + len(t) - 1
            echo = np.fft.irfft(np.fft.rfft(dry, size) * np.fft.rfft(tail, size), size)[: len(dry)]
            echo /= max(1e-9, np.abs(echo).max()) / max(1e-9, np.abs(dry).max())
            out[channel] = _filter(dry * (1 - wet) + echo * wet, tone)
        out = np.tanh(out / max(1e-9, np.abs(out).max()) * 1.3)
        out *= _swell(out.shape[1], 0.02, fade)
        return out / np.abs(out).max()


def _lofi_nod(rng: Any) -> Wave:
    mix, beat = _Mix(13.0, rng), 60 / 84
    chords = ([50, 57, 60, 64, 65], [43, 53, 57, 59, 62], [48, 55, 59, 62, 64],
              [45, 55, 57, 60, 64])
    for bar, chord in enumerate(chords):
        at = bar * 4 * beat
        for hit, gain in ((0.0, 1.0), (2.5, 0.55)):
            for note in chord[1:]:
                mix.add(_keys(note), at + hit * beat + rng.uniform(0, 0.012), 0.34 * gain,
                        rng.uniform(-0.4, 0.4))
        mix.add(_sub(chord[0] - 12, 1.9 * beat), at, 0.5)
        mix.add(_sub(chord[0] - 12, 1.2 * beat), at + 2.5 * beat, 0.4)
        for b in (0, 2, 2.75):
            mix.add(_kick(), at + b * beat, 0.6)
        for b in (1, 3):
            mix.add(_snare(rng), at + b * beat + 0.012, 0.5)
        for eighth in range(8):
            swing = 0.06 * beat if eighth % 2 else 0.0
            mix.add(_hat(rng), at + eighth * beat / 2 + swing, 0.5 if eighth % 2 else 0.8, 0.3)
    return mix.render(room=1.6, wet=0.2, tone=5200, fade=1.8)


# name -> (maker, peak level): how loud the sound sits in the mix (1.0 is full scale).
SOUNDS: dict[str, tuple[Callable[[Any], Wave], float]] = {"lofi-nod": (_lofi_nod, 0.56)}


def write_sound(name: str, path: Path) -> Path:
    """Write the named sound as a 16-bit stereo WAV. The same bytes every time."""
    if name not in SOUNDS:
        known = ", ".join(sorted(SOUNDS))
        raise ValueError(f"unknown sound {name!r}; brand/sound.py makes: {known}")
    make, level = SOUNDS[name]
    audio = make(np.random.default_rng(SEED)) * level
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SR)
        wav.writeframes((audio.T * 32767).astype("<i2").tobytes())
    return path

"""The channel's own sounds: synthesised, repeatable and never clipping."""

import math
import struct
import wave
from pathlib import Path
from typing import Any

import pytest
import yaml

pytest.importorskip("numpy", reason="needs the scenes dependency group")

from channel_os.brand.sound import SOUNDS, write_sound


def read(path: Path) -> tuple[tuple[int, int, int], float, list[float]]:
    """A WAV's format, its length in seconds, and its samples as mono floats."""
    with wave.open(str(path), "rb") as wav:
        shape = (wav.getnchannels(), wav.getsampwidth(), wav.getframerate())
        frames = wav.getnframes()
        raw = struct.unpack(f"<{frames * 2}h", wav.readframes(frames))
    mono = [(raw[i] + raw[i + 1]) / 2 / 32767 for i in range(0, len(raw), 2)]
    return shape, frames / shape[2], mono


def loudness(mono: list[float], start: float, seconds: float = 0.25, rate: int = 48000) -> float:
    """How loud a stretch is, in dB (root mean square)."""
    window = mono[int(start * rate):int((start + seconds) * rate)]
    return 20 * math.log10(max(1e-6, math.sqrt(sum(x * x for x in window) / len(window))))


def test_the_outro_bed_is_a_stereo_wav_long_enough_for_the_outro(tmp_path: Path) -> None:
    path = write_sound("lofi-nod", tmp_path / "sounds" / "outro.wav")
    shape, seconds, mono = read(path)
    assert shape == (2, 2, 48000) and seconds == pytest.approx(13.0)
    # It sits under nothing, so it is mixed well below full scale, and it ends in silence
    # instead of being cut off.
    assert 0.3 < max(abs(sample) for sample in mono) < 0.6
    assert max(abs(sample) for sample in mono[-480:]) < 0.01


def test_the_intro_is_the_one_the_owner_chose(tmp_path: Path) -> None:
    # "S1" of three, picked by ear on 13 October 2026. Its shape is pinned here so a change to
    # the instruments it shares with the outro cannot quietly turn it into another sound:
    # two beats of pickup, the hit at 1.0 s as the logo bursts, the last chord at 2.0 s, then
    # a ring-out that is gone before the logo is.
    shape, seconds, mono = read(write_sound("nod-up", tmp_path / "intro.wav"))
    assert shape == (2, 2, 48000) and seconds == pytest.approx(4.3)
    heard = [-19, -23, -24, -23, -14, -16, -17, -17, -13, -17, -17, -18, -23]
    measured = [loudness(mono, index * 0.25) for index in range(len(heard))]
    assert measured == pytest.approx(heard, abs=1.5)
    assert loudness(mono, 1.0) > loudness(mono, 0.75) + 6, "the hit lands on the burst"
    assert loudness(mono, 4.0) < -45, "silent by the time the logo fades"
    assert max(abs(sample) for sample in mono) < 0.62, "lively, never sharp"


@pytest.mark.parametrize("name", sorted(SOUNDS))
def test_the_same_sound_is_written_every_time(tmp_path: Path, name: str) -> None:
    first = write_sound(name, tmp_path / "a.wav").read_bytes()
    assert write_sound(name, tmp_path / "b.wav").read_bytes() == first


def test_the_config_names_sounds_that_exist(repo_root: Path) -> None:
    brand: Any = yaml.safe_load((repo_root / "config" / "brand.yaml").read_text("utf-8"))
    video = brand["video"]
    # The owner's picks: "nod-up" for the logo, "lofi-nod" under the outro.
    assert (video["intro"]["sound"], video["outro"]["music"]) == ("nod-up", "lofi-nod")
    assert {video["intro"]["sound"], video["outro"]["music"]} <= set(SOUNDS)


def test_an_unknown_sound_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match=r"unknown sound 'fanfare'; brand/sound\.py makes: lofi"):
        write_sound("fanfare", tmp_path / "x.wav")

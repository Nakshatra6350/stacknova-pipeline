"""The channel's own sounds: synthesised, repeatable and never clipping."""

import struct
import wave
from pathlib import Path

import pytest

pytest.importorskip("numpy", reason="needs the scenes dependency group")

from channel_os.brand.sound import SOUNDS, write_sound


def test_the_outro_bed_is_a_stereo_wav_long_enough_for_the_outro(tmp_path: Path) -> None:
    path = write_sound("lofi-nod", tmp_path / "sounds" / "outro.wav")
    with wave.open(str(path), "rb") as wav:
        assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) == (2, 2, 48000)
        seconds = wav.getnframes() / wav.getframerate()
        samples = struct.unpack(f"<{wav.getnframes() * 2}h", wav.readframes(wav.getnframes()))
    assert seconds == pytest.approx(13.0)
    # It sits under nothing, so it is mixed well below full scale, and it ends in silence
    # instead of being cut off.
    assert 0.5 < max(abs(sample) for sample in samples) / 32767 < 0.6
    assert max(abs(sample) for sample in samples[-960:]) < 200


def test_the_same_sound_is_written_every_time(tmp_path: Path) -> None:
    first = write_sound("lofi-nod", tmp_path / "a.wav").read_bytes()
    assert write_sound("lofi-nod", tmp_path / "b.wav").read_bytes() == first


def test_an_unknown_sound_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match=r"unknown sound 'fanfare'; brand/sound\.py makes: lofi"):
        write_sound("fanfare", tmp_path / "x.wav")
    assert list(SOUNDS) == ["lofi-nod"]

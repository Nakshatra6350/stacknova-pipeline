"""Speech synthesis behind a small interface, with chatterbox-tts as the real engine (M1).

Everything else in the voice stage talks to `Synthesizer`, so tests use a fake and never load
a model. The heavy libraries are imported only inside `ChatterboxSynthesizer`.
"""

import hashlib
import wave
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any, Protocol

from channel_os.voice.settings import VoiceSettings


class Synthesizer(Protocol):
    """Turns one chunk of text into a mono 16-bit WAV file."""

    identity: str
    """Everything that changes the audio for a given text: library, model, settings, voice."""

    def synthesize(self, text: str, out_path: Path) -> None: ...


def cache_key(identity: str, text: str) -> str:
    """File name of a synthesised chunk: the same identity and text always give the same audio."""
    return hashlib.sha256(f"{identity}\n{text}".encode()).hexdigest()


def require_watermarker() -> None:
    """Stop early, with a readable reason, if chatterbox's watermarker did not import.

    resemble-perth 1.0.1 imports pkg_resources and, when that fails, quietly sets its
    watermarker class to None; chatterbox then dies with "'NoneType' object is not callable".
    pkg_resources left setuptools in version 81, hence the `setuptools<81` pin in pyproject.
    """
    import perth

    if getattr(perth, "PerthImplicitWatermarker", None) is None:
        raise RuntimeError(
            "the Perth watermarker did not import (it needs pkg_resources: setuptools<81); "
            "refusing to synthesise without it"
        )


class ChatterboxSynthesizer:
    """chatterbox-tts on CPU, cloning the voice in `reference`."""

    def __init__(self, settings: VoiceSettings, reference: Path, device: str = "cpu") -> None:
        try:
            library = version("chatterbox-tts")
        except PackageNotFoundError as exc:
            raise RuntimeError(
                "chatterbox-tts is not installed; run `uv sync --group voice`"
            ) from exc
        self._settings = settings
        self._reference = reference
        self._device = device
        self._model: Any = None
        self.identity = "|".join(
            [
                f"chatterbox-tts=={library}",
                settings.model,
                f"seed={settings.seed}",
                f"exaggeration={settings.exaggeration}",
                f"cfg={settings.cfg_weight}",
                f"temperature={settings.temperature}",
                f"voice={hashlib.sha256(reference.read_bytes()).hexdigest()}",
            ]
        )

    def _load(self) -> Any:
        """Load the model and the voice once; later chunks reuse both."""
        if self._model is None:
            require_watermarker()
            if self._settings.model == "original":
                from chatterbox.tts import ChatterboxTTS

                model = ChatterboxTTS.from_pretrained(device=self._device)
                model.prepare_conditionals(
                    str(self._reference), exaggeration=self._settings.exaggeration
                )
            else:
                from chatterbox.tts_turbo import ChatterboxTurboTTS

                model = ChatterboxTurboTTS.from_pretrained(
                    device=self._device, nano=self._settings.model == "nano"
                )
                model.prepare_conditionals(str(self._reference))
            self._model = model
        return self._model

    def synthesize(self, text: str, out_path: Path) -> None:
        import torch

        model = self._load()
        options: dict[str, Any] = {"temperature": self._settings.temperature}
        if self._settings.model == "original":
            options["exaggeration"] = self._settings.exaggeration
            options["cfg_weight"] = self._settings.cfg_weight
        torch.manual_seed(self._settings.seed)
        audio = model.generate(text, **options)
        samples = audio.squeeze(0).clamp(-1.0, 1.0).mul(32767.0).round().to(torch.int16)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(out_path), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(int(model.sr))
            wav.writeframes(samples.cpu().numpy().tobytes())

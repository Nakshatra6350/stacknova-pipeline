"""Listening to what the voice model actually said (M1).

The voice model sometimes says a word wrong ("retry" as "re-tree"), garbles a phrase or skips
a whole sentence. Nobody can listen to every take of every chunk, so speech recognition does:
it writes down what it hears, and `missed` lines that up with what was meant.

Speech recognition is not an ear. It writes numbers as digits, joins and splits words, and
cannot spell jargon it never saw. Those differences are told apart from real misses here, so a
miss reported by this module is worth another take.
"""

import difflib
import re
import shutil
import subprocess
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from channel_os.assemble.ffmpeg import FfmpegError
from channel_os.captions.align import HeardWord

# Small words whose loss or swap nobody hears as a mistake.
WEAK = frozenset(
    {"a", "an", "the", "to", "of", "and", "is", "are", "as", "it", "in", "on", "at", "so"})
_CONTRACTIONS = {
    "you'll": "you will", "we'll": "we will", "it'll": "it will", "they'll": "they will",
    "i'll": "i will", "we're": "we are", "you're": "you are", "they're": "they are",
    "i'm": "i am", "it's": "it is", "that's": "that is", "here's": "here is",
    "there's": "there is", "what's": "what is", "let's": "let us", "you've": "you have",
    "we've": "we have", "i've": "i have", "they've": "they have", "don't": "do not",
    "doesn't": "does not", "didn't": "did not", "isn't": "is not", "aren't": "are not",
    "wasn't": "was not", "can't": "can not", "cannot": "can not", "won't": "will not",
    "shouldn't": "should not", "wouldn't": "would not", "couldn't": "could not",
}
_UNITS = {word: value for value, word in enumerate((
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
    "nineteen",
))}
_TENS = {word: 10 * value for value, word in enumerate(
    ("twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"), start=2)}
_CURLY_APOSTROPHE = chr(0x2019)
# Words that sound the same; speech recognition picks either.
_HOMOPHONES = [{"write", "right"}, {"there", "their"}, {"for", "four", "4"}, {"to", "too", "2"},
               {"by", "buy"}, {"no", "know"}, {"its", "it is"}, {"one", "won", "1"}]
_SUFFIXES = ("'s", "ing", "ed", "es", "s", "d")
# How alike jargon must be to what was heard, letter for letter, to count as said:
# "idempotent" heard as "item potent" passes (0.9), heard as "important" does not (0.74).
JARGON_CLOSE = 0.8


@dataclass(frozen=True)
class Miss:
    """A stretch that was meant one way and heard another (either side may be empty)."""

    meant: str
    heard: str

    def __str__(self) -> str:
        return f"meant [{self.meant}] heard [{self.heard}]"


class Listener(Protocol):
    """Writes down the words spoken in a WAV file."""

    identity: str
    """Everything that changes what is heard in a given file: recogniser, model, hints."""

    def hear(self, wav: Path) -> str: ...

    def hear_words(self, wav: Path) -> list[HeardWord]:
        """Each word heard, with the seconds at which it starts and ends."""
        ...


def _numbers(tokens: Sequence[str]) -> list[str]:
    """Number words as digits ("a hundred" -> 100, "twenty four" -> 24, "fifty thousand" ->
    50000), as recognisers write."""
    out: list[str] = []
    index = 0
    while index < len(tokens):
        word = tokens[index]
        following = tokens[index + 1] if index + 1 < len(tokens) else ""
        if word in ("a", "one") and following in ("hundred", "thousand"):
            value, index = 1, index + 1
        elif word in _UNITS and following == "hundred":
            value, index = 100 * _UNITS[word], index + 2
        elif word in _TENS:
            value, index = _TENS[word], index + 1
            if index < len(tokens) and tokens[index] in _UNITS and 0 < _UNITS[tokens[index]] < 10:
                value, index = value + _UNITS[tokens[index]], index + 1
        elif word in _UNITS:
            value, index = _UNITS[word], index + 1
        else:
            out.append(word)
            index += 1
            continue
        if index < len(tokens) and tokens[index] in ("hundred", "thousand"):
            value, index = value * (100 if tokens[index] == "hundred" else 1000), index + 1
        if out and out[-1].isdigit() and int(out[-1]) % 100 == 0 and int(out[-1]) and value < 100:
            out[-1] = str(int(out[-1]) + value)  # "a hundred forty-seven" is 147
            continue
        if (len(out) > 1 and out[-1] == "and" and out[-2].isdigit() and int(out[-2]) % 100 == 0
                and int(out[-2]) and value < 100):
            out[-2:] = [str(int(out[-2]) + value)]  # "two hundred and forty-three" is 243
            continue
        out.append(str(value))
    return out


def words(text: str) -> list[str]:
    """Text as the words to compare: lowercase, no punctuation, numbers as digits."""
    text = text.lower().replace(_CURLY_APOSTROPHE, "'")
    text = re.sub(r"(?<=\d),(?=\d{3}\b)", "", text)  # 50,000 is one number
    for short, long in _CONTRACTIONS.items():
        text = re.sub(rf"\b{re.escape(short)}\b", long, text)
    tokens = re.findall(r"[a-z0-9]+(?:'[a-z]+)?", text.replace("-", " "))
    # A recogniser writes "$200" for "two hundred" whether or not "dollars" was said, so the
    # word itself is not compared.
    tokens = _numbers([token for token in tokens if token not in ("dollar", "dollars")])
    # "four oh nine" is how 409 is read aloud.
    merged: list[str] = []
    index = 0
    while index < len(tokens):
        following = tokens[index + 1] if index + 1 < len(tokens) else ""
        if tokens[index] == "oh" and merged and merged[-1].isdigit() and following.isdigit():
            merged[-1] += "0" + following
            index += 2
        else:
            merged.append(tokens[index])
            index += 1
    return merged


def _stem(word: str) -> str:
    for suffix in _SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 2:
            word = word[: -len(suffix)]
            break
    if len(word) > 2 and word[-1] == word[-2]:
        word = word[:-1]
    return word.rstrip("e") if len(word) > 3 else word


def _same(meant: Sequence[str], heard: Sequence[str], terms: frozenset[str]) -> bool:
    """Whether a stretch heard differently is the recogniser's doing and not the voice's."""
    one, other = "".join(meant), "".join(heard)
    if one == other or _stem(one) == _stem(other):
        return True
    if len(meant) == len(heard) and all(
        a == b or _stem(a) == _stem(b) or any(a in group and b in group for group in _HOMOPHONES)
        for a, b in zip(meant, heard, strict=True)
    ):
        return True
    # Jargon the recogniser cannot spell ("idempotency" as "item potency") only has to sound
    # close. Anything else has to be the word.
    jargon = any(word in terms for word in meant)
    return jargon and difflib.SequenceMatcher(None, one, other).ratio() >= JARGON_CLOSE


def missed(meant: str, heard: str, terms: Sequence[str] = ()) -> list[Miss]:
    """Where the words heard differ from the words meant, in a way a listener would notice."""
    # The short parts of a term ("key" in Idempotency-Key) are ordinary words, not jargon.
    known = frozenset(word for term in terms for word in words(term) if len(word) >= 5)
    a, b = words(meant), words(heard)
    found: list[Miss] = []
    for op, a0, a1, b0, b1 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if op == "equal":
            continue
        said, got = a[a0:a1], b[b0:b1]
        if _same(said, got, known):
            continue
        if all(word in WEAK for word in said) and all(word in WEAK for word in got):
            continue
        found.append(Miss(" ".join(said), " ".join(got)))
    return found


def weight(misses: Sequence[Miss]) -> int:
    """How bad a take is: the words that count, meant and not heard or heard and not meant."""
    return sum(
        max(sum(word not in WEAK for word in miss.meant.split()),
            sum(word not in WEAK for word in miss.heard.split()))
        for miss in misses
    )


class WhisperListener:
    """faster-whisper on CPU. The model is loaded on first use."""

    def __init__(self, model: str = "small.en") -> None:
        self._name = model
        self._model: Any = None
        self.identity = f"faster-whisper|{model}"

    def _transcribe(self, wav: Path, word_timestamps: bool) -> list[Any]:
        import numpy as np

        if self._model is None:
            from faster_whisper import WhisperModel

            self._model = WhisperModel(self._name, device="cpu", compute_type="int8")
        binary = shutil.which("ffmpeg")
        if binary is None:
            raise FfmpegError("ffmpeg was not found on PATH")
        # Decoded here, to 16 kHz mono, so the recogniser's own audio reader is not involved.
        done = subprocess.run(
            [binary, "-v", "error", "-nostdin", "-i", str(wav), "-ar", "16000", "-ac", "1",
             "-f", "f32le", "-"],
            capture_output=True, check=False,
        )
        if done.returncode != 0:
            raise FfmpegError(f"ffmpeg could not read {wav.name}: {done.stderr.decode()[-500:]}")
        samples: Any = np.frombuffer(done.stdout, dtype=np.float32)
        # No hints are given: offered the jargon as "hot words", the recogniser wrote those
        # words into silences (28 times "idempotent" at the end of one segment). `missed`
        # allows for its spelling of jargon instead.
        segments, _ = self._model.transcribe(
            samples, beam_size=5, temperature=0.0, condition_on_previous_text=False,
            word_timestamps=word_timestamps,
        )
        return list(segments)

    def hear(self, wav: Path) -> str:
        return " ".join(segment.text.strip() for segment in self._transcribe(wav, False))

    def hear_words(self, wav: Path) -> list[HeardWord]:
        return [(word.word.strip(), float(word.start), float(word.end))
                for segment in self._transcribe(wav, True) for word in segment.words or ()]

"""Turn narration text into normalised WAV files and a timing record (milestone M1)."""

import hashlib
import json
import tempfile
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from channel_os.captions.align import TimedWord, align, script_words
from channel_os.reach.lint import STORY_PLACEHOLDER
from channel_os.voice.chunking import chunk_text, sentences
from channel_os.voice.lexicon import Lexicon
from channel_os.voice.listen import WEAK, Listener, Miss, missed, weight, words
from channel_os.voice.loudness import Loudness, Target, detect_pauses, measure, normalize
from channel_os.voice.polish import polish
from channel_os.voice.settings import VoiceSettings
from channel_os.voice.tts import Synthesizer, cache_key
from channel_os.voice.wavio import concat, duration_seconds

# Acceptance limits from docs/BUILD_PLAN.md M1. Settings aim inside them; these are the gate.
LUFS_TOLERANCE = 1.0
TRUE_PEAK_LIMIT_DB = -1.0


# No sentence holds a silence this long. One that does is the voice model stalling, and the
# pause cap in polish should have cut it; if it is still here, the render must not go on.
MAX_SILENCE_SECONDS = 3.0
# The voice model sometimes says a word wrong or skips a sentence, so each chunk is listened
# to and read again, up to this many readings in all, until nothing is missed.
MAX_TAKES = 4
Report = Callable[[str], None]  # told what the listening check found and did, line by line
# A reading that misses this many words running, or this share of all its words, lost a phrase.
GROSS_RUN = 4
GROSS_SHARE = 0.2


class LoudnessError(RuntimeError):
    """A rendered narration is outside the loudness acceptance limits."""


class SilenceError(RuntimeError):
    """A rendered segment holds a silence no speaker would leave."""


class PronunciationError(RuntimeError):
    """The voice lost a phrase of the script in every reading it was given."""


WELCOME = "welcome"  # the unit id of the channel's welcome line in a long video


@dataclass(frozen=True)
class Unit:
    """One stretch of narration that becomes one seg-<id>.wav file."""

    id: str
    text: str


def all_targets(episode: Mapping[str, Any]) -> list[str]:
    return ["long", *(short["id"] for short in episode["shorts"])]


def select_units(episode: Mapping[str, Any], only: str, welcome: str | None = None) -> list[Unit]:
    """Units for one target: 'long' is every segment; a Short is its script or its segments.

    A unit that is still a [STORY:...] placeholder is left out: there is nothing to say yet.
    Only a draft can hold one (the validator refuses it at ready_to_render), so this is what
    lets a draft be previewed before the owner's story is written.

    `welcome` is the channel's welcome line (config/brand.yaml). A long video says it as a unit
    of its own right after the hook, where the logo intro plays; Shorts never say it.
    """
    narrations = {segment["id"]: segment["narration"] for segment in episode["segments"]}
    if only == "long":
        chosen = [Unit(segment_id, text) for segment_id, text in narrations.items()]
    else:
        short = next((short for short in episode["shorts"] if short["id"] == only), None)
        if short is None:
            raise ValueError(f"unknown target {only!r}: use 'long' or a Short id")
        if short["source"] == "standalone":
            chosen = [Unit(only, short["script"])]
        else:
            chosen = [Unit(segment_id, narrations[segment_id]) for segment_id in short["segments"]]
    units = [unit for unit in chosen if STORY_PLACEHOLDER not in unit.text]
    if not units:
        raise ValueError(f"{only}: nothing to narrate yet, it is all story placeholders")
    if only == "long" and welcome and len(units) > 1:
        units.insert(1, Unit(WELCOME, welcome))
    return units


def _when_said(text: str, wav: Path, listener: Listener, cache_dir: Path) -> list[TimedWord]:
    """When each word of `text` is said in a finished segment.

    What the listener heard is kept in the cache under the file's content, so a segment that
    comes out the same (a Short cut from the long video, or a render run again) is not heard
    twice.
    """
    digest = hashlib.sha256(wav.read_bytes() + listener.identity.encode()).hexdigest()[:24]
    note = cache_dir / f"words-{digest}.json"
    if not note.exists():
        note.write_text(json.dumps(listener.hear_words(wav)), encoding="utf-8")
    heard = [(str(word), float(start), float(end))
             for word, start, end in json.loads(note.read_text(encoding="utf-8"))]
    return align(text, heard)


def _heard(wav: Path, listener: Listener) -> str:
    """What the listener hears in a cached chunk, written down beside it the first time."""
    tag = hashlib.sha256(listener.identity.encode()).hexdigest()[:8]
    note = wav.with_suffix(f".{tag}.txt")
    if not note.exists():
        note.write_text(listener.hear(wav), encoding="utf-8")
    return note.read_text(encoding="utf-8")


def _gross(text: str, misses: Sequence[Miss]) -> bool:
    """Whether a reading lost a phrase: several words running, or a good share of them all."""
    content = sum(word not in WEAK for word in words(text))
    dropped = any(sum(word not in WEAK for word in miss.meant.split()) >= GROSS_RUN
                  for miss in misses)
    return dropped or weight(misses) >= max(GROSS_RUN, GROSS_SHARE * content)


def _said(misses: Sequence[Miss]) -> str:
    return "; ".join(map(str, misses))


def _at(report: Report, where: str) -> Report:
    """`report`, with every line saying which stretch of narration it is about."""

    def tell(line: str) -> None:
        report(f"{where}: {line}")

    return tell


def _readings(
    text: str, synthesizer: Synthesizer, lexicon: Lexicon, listener: Listener | None,
    cache_dir: Path, tell: Report, last_resort: bool,
) -> tuple[Path, int, list[Miss], int]:
    """Speak `text`, listen to it, and read it again while that can still help.

    Returns the best reading's file, which reading it was (0 is the first), what it still
    misses, and how many readings were tried. Each further reading has another seed and, for
    a word the lexicon spells in several ways, the next spelling. Reading stops when nothing
    is missed, after MAX_TAKES, and when a reading misses exactly what the one before missed
    and every spelling has had its turn: then the miss is not chance (the model always says
    it so, or the recogniser always hears it so) and more readings would only cost time.
    With `last_resort` (nothing smaller can be tried in its place) a reading that lost a
    phrase is never a reason to stop early, because the render stops on it. Without a
    listener there is one reading and nothing is checked.
    """
    spellings = lexicon.spellings(text)
    best: tuple[int, int, Path, list[Miss]] | None = None
    previous: list[Miss] | None = None
    tried = 0
    for take in range(MAX_TAKES if listener is not None else 1):
        spoken = lexicon.respell(text, take)
        cached = cache_dir / f"{cache_key(synthesizer.identity, spoken, take)}.wav"
        if not cached.exists():
            partial = cached.with_suffix(".part")
            synthesizer.synthesize(spoken, partial, take)
            partial.replace(cached)
        tried += 1
        if listener is None:
            tell("spoken")
            return cached, 0, [], tried
        misses = missed(text, _heard(cached, listener), lexicon.terms)
        tell(("" if take == 0 else f"reading {take + 1}: ")
             + (_said(misses) if misses else "said as written"))
        if best is None or weight(misses) < best[0]:
            best = (weight(misses), take, cached, misses)
        if not misses:
            break
        settled = misses == previous and take + 1 >= spellings
        if settled and not (last_resort and _gross(text, misses)):
            break
        previous = misses
    assert best is not None
    _, take, wav, misses = best
    if misses and tried > 1:
        tell(f"reading {take + 1} is kept")
    return wav, take, misses, tried


def _raw_unit(
    unit: Unit, synthesizer: Synthesizer, settings: VoiceSettings, cache_dir: Path, work: Path,
    lexicon: Lexicon, listener: Listener | None, report: Report,
) -> tuple[Path, int, list[Miss]]:
    """Synthesise a unit chunk by chunk, reusing cached chunks, and join them.

    Also returns how many chunks were read again and what is still missed. A chunk is read
    as a whole, and again as a whole while words are missed: the voice keeps its own flow from
    sentence to sentence, and one model call costs much the same whether it says one sentence
    or four. Only a chunk that loses a phrase in every reading is spoken sentence by sentence,
    which is how the model says a sentence it skips inside a long chunk. A sentence that still
    loses a phrase stops the render.
    """
    files: list[Path] = []
    retakes = 0
    unsure: list[Miss] = []

    def lost(text: str, misses: Sequence[Miss], tried: int) -> PronunciationError:
        return PronunciationError(
            f"{unit.id}: the voice did not say this in {tried} reading(s): "
            f"{text!r} ({_said(misses)})"
        )

    chunks = chunk_text(unit.text, settings.max_chunk_chars)
    for number, chunk in enumerate(chunks, start=1):
        where = f"{unit.id} chunk {number}/{len(chunks)}"
        parts = sentences(chunk)
        wav, take, misses, tried = _readings(chunk, synthesizer, lexicon, listener, cache_dir,
                                             _at(report, where), last_resort=len(parts) == 1)
        if not _gross(chunk, misses):
            files.append(wav)
            unsure.extend(misses)
            retakes += take > 0
            continue
        if len(parts) == 1:
            raise lost(chunk, misses, tried)
        report(f"{where}: a phrase is lost in every reading, so each sentence is read alone")
        for index, part in enumerate(parts, start=1):
            wav, take, misses, tried = _readings(
                part, synthesizer, lexicon, listener, cache_dir,
                _at(report, f"{where} sentence {index}/{len(parts)}"), last_resort=True)
            if _gross(part, misses):
                raise lost(part, misses, tried)
            files.append(wav)
            unsure.extend(misses)
        retakes += 1
    raw = work / f"raw-{unit.id}.wav"
    concat(files, raw, settings.sentence_gap_ms)
    return raw, retakes, unsure


def _check(loudness: Loudness, settings: VoiceSettings) -> None:
    if abs(loudness.integrated_lufs - settings.target_lufs) > LUFS_TOLERANCE:
        raise LoudnessError(
            f"narration is at {loudness.integrated_lufs} LUFS; "
            f"allowed is {settings.target_lufs} +/- {LUFS_TOLERANCE}"
        )
    if loudness.true_peak_db > TRUE_PEAK_LIMIT_DB:
        raise LoudnessError(
            f"narration peaks at {loudness.true_peak_db} dBTP; limit is {TRUE_PEAK_LIMIT_DB}"
        )


def narrate(
    units: Sequence[Unit],
    target_name: str,
    synthesizer: Synthesizer,
    settings: VoiceSettings,
    out_dir: Path,
    cache_dir: Path,
    lexicon: Lexicon | None = None,
    listener: Listener | None = None,
    report: Report = lambda line: None,
) -> dict[str, Any]:
    """Render units into out_dir/voice/<target_name>/ and return that target's timing entry.

    `lexicon` respells words the voice reads wrong. With a `listener`, every chunk is heard
    and read again until it says what the script says; each segment's record then tells how
    many chunks needed another reading (`retakes`) and what could not be confirmed (`unsure`),
    and `report` is told about each as it happens. The finished segment is heard once more for
    when each word is said (`words`: offset in the normalised text, start, end), which is what
    captions and scene steps are timed from.
    """
    lexicon = lexicon or Lexicon()
    voice_dir = out_dir / "voice" / target_name
    voice_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = Target(
        settings.target_lufs,
        settings.true_peak_ceiling_db,
        settings.loudness_range,
        settings.sample_rate,
    )
    gap = settings.segment_gap_ms / 1000
    files: list[Path] = []
    segments: list[dict[str, Any]] = []
    cursor = 0.0
    with tempfile.TemporaryDirectory() as work:
        for unit in units:
            raw, retakes, unsure = _raw_unit(unit, synthesizer, settings, cache_dir, Path(work),
                                             lexicon, listener, report)
            polished = polish(raw, Path(work) / f"polished-{unit.id}.wav", settings)
            segment = voice_dir / f"seg-{unit.id}.wav"
            normalize(polished, segment, target)
            duration = duration_seconds(segment)
            pauses = detect_pauses(segment)
            for start, end in pauses:
                if end - start > MAX_SILENCE_SECONDS:
                    raise SilenceError(
                        f"{unit.id}: {end - start:.1f} s of silence at {start:.1f} s; "
                        "the voice model stalled and the pause cap did not catch it"
                    )
            words: list[TimedWord] = []
            if listener is not None:
                words = _when_said(unit.text, segment, listener, cache_dir)
                report(f"{unit.id}: {len(words)} of {len(script_words(unit.text))} words "
                       "timed for captions and scenes")
            segments.append(
                {
                    "id": unit.id,
                    "file": segment.relative_to(out_dir).as_posix(),
                    "start": round(cursor, 3),
                    "duration": round(duration, 3),
                    "pauses": [list(pause) for pause in pauses],
                    "words": [list(word) for word in words],
                    "retakes": retakes,
                    "unsure": [{"meant": miss.meant, "heard": miss.heard} for miss in unsure],
                }
            )
            cursor += duration + gap
            files.append(segment)
    narration = voice_dir / "narration.wav"
    concat(files, narration, settings.segment_gap_ms)
    loudness = measure(narration)
    _check(loudness, settings)
    return {
        "narration": narration.relative_to(out_dir).as_posix(),
        "duration": round(duration_seconds(narration), 3),
        "pause_ms": settings.segment_gap_ms,
        "model": settings.model,
        "loudness": {
            "integrated_lufs": loudness.integrated_lufs,
            "true_peak_db": loudness.true_peak_db,
        },
        "listened": listener is not None,
        "segments": segments,
    }


def update_timing(
    out_dir: Path, episode_id: str, target_name: str, entry: Mapping[str, Any]
) -> Path:
    """Record one target in out_dir/timing.json, keeping the targets already there."""
    path = out_dir / "timing.json"
    timing: dict[str, Any] = (
        json.loads(path.read_text(encoding="utf-8"))
        if path.exists()
        else {"episode": episode_id, "targets": {}}
    )
    timing["targets"][target_name] = dict(entry)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(timing, indent=2) + "\n", encoding="utf-8")
    return path

"""Units become cached chunks, normalised segments, one narration and a timing entry."""

import json
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from conftest import SAID, TAKE

from channel_os.voice import narrate as narrate_module
from channel_os.voice.chunking import chunk_text
from channel_os.voice.lexicon import Lexicon
from channel_os.voice.loudness import Loudness
from channel_os.voice.narrate import (
    MAX_TAKES,
    LoudnessError,
    PronunciationError,
    SilenceError,
    Unit,
    all_targets,
    narrate,
    select_units,
    update_timing,
)
from channel_os.voice.settings import VoiceSettings, load_settings
from channel_os.voice.wavio import duration_seconds

Data = dict[str, Any]
UNITS = [
    Unit("s01", "Here is the retry that matters. It works."),
    Unit("s02", "Then it fails. Twice."),
]


@pytest.fixture
def settings(repo_root: Path) -> VoiceSettings:
    return load_settings(repo_root / "config" / "voice.yaml")


def test_the_long_video_uses_every_segment(episode: Data) -> None:
    assert [unit.id for unit in select_units(episode, "long")] == ["s01", "s02", "s03"]


def test_a_cut_short_uses_its_segments(episode: Data) -> None:
    assert select_units(episode, "short-1") == [Unit("s02", episode["segments"][1]["narration"])]


def test_a_standalone_short_uses_its_script(episode: Data) -> None:
    assert select_units(episode, "short-2") == [
        Unit("short-2", "A standalone script about one retry.")
    ]


def test_an_unknown_target_is_an_error(episode: Data) -> None:
    with pytest.raises(ValueError, match="unknown target"):
        select_units(episode, "short-9")


def test_a_story_placeholder_is_left_out_of_a_draft_preview(episode: Data) -> None:
    episode["segments"][1]["narration"] = "[STORY:duplicate-callback] To be written by the owner."
    assert [unit.id for unit in select_units(episode, "long")] == ["s01", "s03"]
    # short-1 is cut from that one segment, so there is nothing left to say.
    with pytest.raises(ValueError, match="short-1: nothing to narrate yet"):
        select_units(episode, "short-1")


class Stalling:
    """A voice model that leaves twelve seconds of silence in the middle of a sentence."""

    identity = "stalls-v1"

    def __init__(self, audio: Any) -> None:
        self.audio = audio

    def synthesize(self, text: str, out_path: Path, take: int = 0) -> None:
        self.audio(out_path, [(1.0, 0.1), (12.0, 0.0), (1.0, 0.1)])


def test_a_stall_in_the_voice_is_cut_out_of_the_narration(
    tmp_path: Path, settings: VoiceSettings, audio: Any
) -> None:
    # Seen for real on 11 October 2026: 29 s of silence inside segment s06 of episode 001.
    entry = narrate([Unit("s06", "One sentence.")], "long", Stalling(audio), settings,
                    tmp_path / "out", tmp_path / "cache")
    (segment,) = entry["segments"]
    assert segment["duration"] < 4.0
    assert max(end - start for start, end in segment["pauses"]) < 1.0


def test_a_silence_that_survives_stops_the_render(
    tmp_path: Path, settings: VoiceSettings, audio: Any
) -> None:
    uncapped = replace(settings, max_pause_ms=0)
    with pytest.raises(SilenceError, match=r"s06: 1\d\.\d s of silence at"):
        narrate([Unit("s06", "One sentence.")], "long", Stalling(audio), uncapped,
                tmp_path / "out", tmp_path / "cache")


def test_all_targets_lists_the_long_video_then_the_shorts(episode: Data) -> None:
    assert all_targets(episode) == ["long", "short-1", "short-2"]


def test_narrate_writes_segments_narration_and_timing(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    out = tmp_path / "out"
    entry = narrate(UNITS, "long", fake_synthesizer(), settings, out, tmp_path / "cache")

    names = sorted(path.name for path in (out / "voice" / "long").iterdir())
    assert names == ["narration.wav", "seg-s01.wav", "seg-s02.wav"]
    first, second = entry["segments"]
    assert (first["id"], first["file"], first["start"]) == ("s01", "voice/long/seg-s01.wav", 0.0)
    assert first["duration"] == pytest.approx(duration_seconds(out / first["file"]), abs=0.001)
    assert second["start"] == pytest.approx(first["duration"] + 0.25, abs=0.002)
    assert entry["duration"] == pytest.approx(
        first["duration"] + 0.25 + second["duration"], abs=0.002
    )
    assert entry["narration"] == "voice/long/narration.wav"
    assert (entry["pause_ms"], entry["model"]) == (250, "original")
    assert entry["loudness"]["integrated_lufs"] == pytest.approx(-14.0, abs=1.0)
    assert entry["loudness"]["true_peak_db"] <= -1.0


def test_chunks_are_synthesised_once_and_then_reused(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    cache = tmp_path / "cache"
    synthesizer = fake_synthesizer()
    narrate(UNITS, "long", synthesizer, settings, tmp_path / "one", cache)
    assert len(synthesizer.calls) == 2
    narrate(UNITS, "long", synthesizer, settings, tmp_path / "two", cache)
    assert len(synthesizer.calls) == 2
    assert list(cache.glob("*.part")) == []

    other_voice = fake_synthesizer("fake-v2")
    narrate(UNITS, "long", other_voice, settings, tmp_path / "three", cache)
    assert len(other_voice.calls) == 2


def test_long_text_is_synthesised_chunk_by_chunk(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    text = " ".join(f"Sentence number {n} is here." for n in range(30))
    synthesizer = fake_synthesizer()
    narrate([Unit("s01", text)], "long", synthesizer, settings, tmp_path / "out", tmp_path / "c")
    assert synthesizer.calls == chunk_text(text, settings.max_chunk_chars)
    assert len(synthesizer.calls) > 1


def test_a_narration_outside_the_loudness_limits_fails(
    tmp_path: Path,
    settings: VoiceSettings,
    fake_synthesizer: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(narrate_module, "measure", lambda path: Loudness(-20.0, -3.0))
    with pytest.raises(LoudnessError, match=r"-20\.0 LUFS"):
        narrate(UNITS, "long", fake_synthesizer(), settings, tmp_path / "out", tmp_path / "c")


def test_a_true_peak_over_the_limit_fails(
    tmp_path: Path,
    settings: VoiceSettings,
    fake_synthesizer: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(narrate_module, "measure", lambda path: Loudness(-14.0, -0.5))
    with pytest.raises(LoudnessError, match=r"-0\.5 dBTP"):
        narrate(UNITS, "long", fake_synthesizer(), settings, tmp_path / "out", tmp_path / "c")


def test_segments_record_the_pauses_between_their_chunks(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    # Scenes time their steps from these pauses, so every segment entry carries them.
    text = " ".join(f"Sentence number {n} is here." for n in range(30))
    chunks = chunk_text(text, settings.max_chunk_chars)
    entry = narrate(
        [Unit("s01", text)], "long", fake_synthesizer(), settings, tmp_path / "o", tmp_path / "c"
    )
    pauses = entry["segments"][0]["pauses"]
    assert len(pauses) == len(chunks) - 1
    assert all(end > start for start, end in pauses)


def test_tempo_stretches_the_segments(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    cache = tmp_path / "cache"
    normal = replace(settings, tempo=1.0)
    slower = replace(settings, tempo=0.8)
    first = narrate(UNITS[:1], "long", fake_synthesizer(), normal, tmp_path / "a", cache)
    second = narrate(UNITS[:1], "long", fake_synthesizer(), slower, tmp_path / "b", cache)
    assert second["duration"] == pytest.approx(first["duration"] / 0.8, abs=0.05)


def test_update_timing_keeps_other_targets(tmp_path: Path) -> None:
    update_timing(tmp_path, "900-fixture", "long", {"duration": 1.0})
    path = update_timing(tmp_path, "900-fixture", "short-1", {"duration": 2.0})
    assert json.loads(path.read_text(encoding="utf-8")) == {
        "episode": "900-fixture",
        "targets": {"long": {"duration": 1.0}, "short-1": {"duration": 2.0}},
    }


# ---- listening to what was said ------------------------------------------------------------


class Ears:
    """Speech recognition for tests: hears what the fake voice was given, unless `mishear`
    says what it heard instead (it is told the text and which take it was)."""

    identity = "test-ears"

    def __init__(self, mishear: Callable[[str, int], str | None] = lambda text, take: None) -> None:
        self.mishear = mishear
        self.calls = 0

    def hear(self, wav: Path) -> str:
        self.calls += 1
        text, take = SAID[wav.stem], TAKE[wav.stem]
        heard = self.mishear(text, take)
        return text if heard is None else heard


WRONG, RIGHT = "Here is the retry that matters.", "It works."


def test_only_the_sentence_said_wrong_is_read_again(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    # The owner heard "retry" said as "re-tree". The chunk is read once as a whole; then each
    # sentence on its own, and only the one with the word in it a second time.
    ears = Ears(lambda text, take: text.replace("retry", "re tree") if take == 0 else None)
    synthesizer = fake_synthesizer()
    said: list[str] = []
    entry = narrate(UNITS, "long", synthesizer, settings, tmp_path / "out", tmp_path / "c",
                    listener=ears, report=said.append)
    assert entry["listened"] is True
    first, second = entry["segments"]
    assert (first["retakes"], first["unsure"]) == (1, [])
    assert (second["retakes"], second["unsure"]) == (0, [])
    assert synthesizer.calls == [UNITS[0].text, WRONG, WRONG, RIGHT, UNITS[1].text]
    assert synthesizer.takes == [0, 0, 1, 0, 0]
    # One line per chunk, and what was done about a miss: this is the log of a render.
    assert said == [
        "s01 chunk 1/1: meant [retry] heard [re tree]",
        "s01 chunk 1/1: read again sentence by sentence, said as written now",
        "s02 chunk 1/1: said as written",
    ]


ONE = Unit("s01", "Here is the retry that matters and works.")


def test_the_best_reading_is_kept_when_none_is_clean(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    heard = {
        0: ONE.text.replace("matters", "mutters").replace("works", "walks"),
        1: ONE.text.replace("retry", "re tree").replace("works", "walks"),
        2: ONE.text.replace("matters", "mutters"),
        3: ONE.text.replace("matters", "mutters").replace("works", "walks"),
    }
    synthesizer = fake_synthesizer()
    entry = narrate([ONE], "long", synthesizer, settings, tmp_path / "out", tmp_path / "c",
                    listener=Ears(lambda text, take: heard[take]))
    # Every reading was tried; the third missed least, so it is the one used, and what it
    # still misses is written down for whoever reviews the video.
    assert synthesizer.takes == list(range(MAX_TAKES))
    segment = entry["segments"][0]
    assert segment["retakes"] == 1
    assert segment["unsure"] == [{"meant": "matters", "heard": "mutters"}]


def test_reading_again_stops_when_it_changes_nothing(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    # The same miss twice running is the model's habit or the recogniser's, not chance, so
    # two more readings would only cost time. The first reading stays: it flows best.
    ears = Ears(lambda text, take: text.replace("retry", "re tree"))
    synthesizer = fake_synthesizer()
    said: list[str] = []
    entry = narrate(UNITS[:1], "long", synthesizer, settings, tmp_path / "out", tmp_path / "c",
                    listener=ears, report=said.append)
    assert synthesizer.calls == [UNITS[0].text, WRONG, WRONG, RIGHT]
    assert synthesizer.takes == [0, 0, 1, 0]
    segment = entry["segments"][0]
    assert (segment["retakes"], len(segment["pauses"])) == (0, 0)
    assert segment["unsure"] == [{"meant": "retry", "heard": "re tree"}]
    assert said[-1] == "s01 chunk 1/1: reading again did not help, the first reading is kept"


def test_a_sentence_that_is_worse_alone_leaves_the_whole_reading(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    def mishear(text: str, take: int) -> str | None:
        return "" if text == WRONG else text.replace("retry", "re tree")

    synthesizer = fake_synthesizer()
    entry = narrate(UNITS[:1], "long", synthesizer, settings, tmp_path / "out", tmp_path / "c",
                    listener=Ears(mishear))
    # The sentence got every reading it is allowed, lost its words in each, and is not used.
    assert synthesizer.calls == [UNITS[0].text, *[WRONG] * MAX_TAKES]
    segment = entry["segments"][0]
    assert (segment["retakes"], len(segment["pauses"])) == (0, 0)
    assert segment["unsure"] == [{"meant": "retry", "heard": "re tree"}]


SKIPPED = "We're back to two charges, just faster."
RACE = Unit("s06", f"Both charge. {SKIPPED} The fix is to let the database decide.")


def test_a_skipped_sentence_is_spoken_again_on_its_own(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    # Seen in episode 001: the voice stalled and left a sentence of segment s06 unsaid.
    # Given the whole chunk it skips the sentence; given one sentence it speaks.
    ears = Ears(lambda text, take: text.replace(f"{SKIPPED} ", "") if "Both charge" in text
                and SKIPPED in text else None)
    synthesizer = fake_synthesizer()
    entry = narrate([RACE], "long", synthesizer, settings, tmp_path / "out", tmp_path / "c",
                    listener=ears)
    assert synthesizer.calls == [
        RACE.text, "Both charge.", SKIPPED, "The fix is to let the database decide."]
    assert synthesizer.takes == [0, 0, 0, 0]
    assert (entry["segments"][0]["retakes"], entry["segments"][0]["unsure"]) == (1, [])
    # The three sentences are joined with the pause that separates chunks.
    assert len(entry["segments"][0]["pauses"]) == 2


def test_a_sentence_the_voice_cannot_say_stops_the_render(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    ears = Ears(lambda text, take: text.replace(SKIPPED, ""))
    synthesizer = fake_synthesizer()
    with pytest.raises(PronunciationError,
                       match=r"s06: the voice did not say this in 4 reading\(s\)"):
        narrate([RACE], "long", synthesizer, settings, tmp_path / "out", tmp_path / "c",
                listener=ears)
    # A lost sentence gets every reading it is allowed before the render gives up on it.
    assert synthesizer.calls == [RACE.text, "Both charge.", *[SKIPPED] * MAX_TAKES]


def test_what_was_heard_is_remembered_with_the_chunk(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    cache = tmp_path / "cache"
    ears = Ears()
    narrate(UNITS, "long", fake_synthesizer(), settings, tmp_path / "one", cache, listener=ears)
    assert ears.calls == 2
    again = Ears()
    narrate(UNITS, "long", fake_synthesizer(), settings, tmp_path / "two", cache, listener=again)
    assert again.calls == 0


def test_words_are_respelled_for_the_voice_only(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    lexicon = Lexicon({"retry": "re-try"})
    synthesizer = fake_synthesizer()
    entry = narrate(UNITS[:1], "long", synthesizer, settings, tmp_path / "out", tmp_path / "c",
                    lexicon=lexicon, listener=Ears())
    assert synthesizer.calls == ["Here is the re-try that matters. It works."]
    # "re-try" was heard, and that is the word that was meant.
    assert entry["segments"][0]["unsure"] == []


def test_without_a_listener_there_is_one_reading_and_no_check(
    tmp_path: Path, settings: VoiceSettings, fake_synthesizer: Any
) -> None:
    synthesizer = fake_synthesizer()
    said: list[str] = []
    entry = narrate(UNITS, "long", synthesizer, settings, tmp_path / "out", tmp_path / "c",
                    report=said.append)
    assert entry["listened"] is False
    assert synthesizer.takes == [0, 0]
    assert [segment["retakes"] for segment in entry["segments"]] == [0, 0]
    assert said == ["s01 chunk 1/1: spoken", "s02 chunk 1/1: spoken"]

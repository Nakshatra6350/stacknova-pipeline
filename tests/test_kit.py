"""The upload kit for posting by hand: subtitles, chapters and every text to paste."""

import json
from pathlib import Path
from typing import Any

import yaml

from channel_os.captions.srt import problems
from channel_os.kit import build, main
from channel_os.scenes.plan import welcome_line
from channel_os.voice.narrate import all_targets, select_units

ROOT = Path(__file__).resolve().parents[1]
EPISODE = "006-payment-system"


def _stand_in_timing(episode: dict[str, Any], brand: dict[str, Any]) -> dict[str, Any]:
    """Narration timing as if read at 14.5 characters a second, with a quarter second between
    units and no measured words (the planner then places words by their position)."""
    targets = {}
    for target in all_targets(episode):
        welcome = welcome_line(brand) if target == "long" else None
        clock, segments = 0.0, []
        for unit in select_units(episode, target, welcome):
            seconds = round(len(unit.text) / 14.5, 3)
            segments.append({"id": unit.id, "file": f"voice/{target}/seg-{unit.id}.wav",
                             "start": round(clock, 3), "duration": seconds, "pauses": []})
            clock += seconds + 0.25
        targets[target] = {"narration": f"voice/{target}/narration.wav",
                           "duration": round(clock, 3), "segments": segments}
    return {"episode": episode["id"], "targets": targets}


def _out(tmp_path: Path) -> Path:
    episode = yaml.safe_load((ROOT / "content/episodes" / EPISODE / "episode.yaml")
                             .read_text("utf-8"))
    brand = yaml.safe_load((ROOT / "config/brand.yaml").read_text("utf-8"))
    (tmp_path / "timing.json").write_text(json.dumps(_stand_in_timing(episode, brand)),
                                          encoding="utf-8")
    return tmp_path


def test_every_video_gets_a_valid_english_subtitle_track(tmp_path: Path) -> None:
    out = _out(tmp_path)
    written = build(ROOT, EPISODE, out)
    tracks = sorted(path.name for path in written if path.suffix == ".srt")
    assert tracks == ["long.en.srt", *(f"short-{n}.en.srt" for n in range(1, 6))]
    for name in tracks:
        assert problems((out / "kit" / name).read_text("utf-8")) == []
    first = (out / "kit" / "long.en.srt").read_text("utf-8").split("\n\n")[0]
    assert " ".join(first.splitlines()[2:]) == "A customer taps Pay for a forty-nine dollar order."


def test_the_kit_holds_every_text_to_paste(tmp_path: Path) -> None:
    out = _out(tmp_path)
    build(ROOT, EPISODE, out)
    kit = (out / "kit" / "kit.md").read_text("utf-8")
    assert "Design a Payment System (Senior System Design Interview)" in kit
    assert "0:00 Did the money move?" in kit  # chapters start at zero, with the hook's title
    assert "Previous: design a rate limiter — [LINK: 005-rate-limiter]" in kit
    assert "Next: how HashMap really works — coming soon, subscribe" in kit  # not written yet
    assert "{" + "chapters}" not in kit and "{" + "sources}" not in kit
    assert "altered or synthetic content: **Yes**" in kit
    # The template's wrapped prose becomes one line a paragraph.
    assert "Here's how to design a payment system at senior level:" in kit
    assert "#systemdesigninterview" in kit
    assert kit.count("### short-") == 5 and kit.count("### Reel from") == 5
    assert "`carousel-06.jpg`" in kit
    assert "*Hindi (hi)*" in kit


def test_the_kit_is_also_written_as_data_for_a_posting_checklist(tmp_path: Path) -> None:
    out = _out(tmp_path)
    build(ROOT, EPISODE, out)
    data = json.loads((out / "kit" / "kit.json").read_text("utf-8"))
    assert data["release"] == "ep-006-payment-system"
    assert data["long"]["title_b"] == "Payment System Design: Ledger, Idempotency, Webhooks"
    assert [short["id"] for short in data["shorts"]] == [f"short-{n}" for n in range(1, 6)]
    assert data["reels"][0]["caption"].endswith("#faang")
    assert data["reels"][0]["video"] == "reel.short-1.mp4"  # the cut that asks for a Follow
    assert data["carousel"]["slides"][-1] == "carousel-06.jpg"
    assert {text["code"] for text in data["long"]["translations"]} == {
        "hi", "es", "pt", "id", "vi", "ar"}


def test_no_instagram_post_carries_more_than_five_hashtags() -> None:
    # Instagram's cap since 18 December 2025: five per post or Reel, comments included.
    reach = yaml.safe_load((ROOT / "config/reach.yaml").read_text("utf-8"))
    too_many = {pillar: tags for pillar, tags in reach["hashtag_sets"].items() if len(tags) > 5}
    assert too_many == {}


def test_the_command_reports_a_missing_narration(tmp_path: Path, capsys: Any) -> None:
    assert main(["--episode", EPISODE, "--out", str(tmp_path), "--root", str(ROOT)]) == 1
    assert "timing.json" in capsys.readouterr().err

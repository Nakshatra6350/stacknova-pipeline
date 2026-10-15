"""Thumbnails and carousel slides for the upload kit, drawn in the browser (M3)."""

from pathlib import Path

import pytest
import yaml

pytest.importorskip("playwright.sync_api", reason="needs the scenes dependency group")

from channel_os.assemble.carousel import draw_carousel, idea_texts, kind
from channel_os.assemble.frames import _crop
from channel_os.assemble.thumbnails import LAYOUTS, draw_thumbnails, layouts

ROOT = Path(__file__).resolve().parents[1]
BRAND = yaml.safe_load((ROOT / "config/brand.yaml").read_text("utf-8"))
EPISODE = yaml.safe_load(
    (ROOT / "content/episodes/005-rate-limiter/episode.yaml").read_text("utf-8"))
# A tiny PNG (one dark violet pixel) standing in for a still of a scene.
PIXEL = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763"
    "6060f80f0001040100a8d2e4b20000000049454e44ae426082")


def test_the_owners_pick_mixes_the_two_layouts() -> None:
    # 15 October 2026: "Mix: A and B", so Test & compare also tests the layout.
    assert layouts(BRAND, 3) == ["verdict", "monitor", "verdict"]
    assert layouts({}, 2) == [LAYOUTS[0], LAYOUTS[0]]
    with pytest.raises(ValueError, match="unknown thumbnail layout"):
        layouts({"thumbnail": {"layouts": ["poster"]}}, 1)


def test_every_slide_between_the_cover_and_the_ask_is_an_idea_with_its_own_scene() -> None:
    assert BRAND["carousel"]["scenes_on_every_slide"] is True  # the owner's pick, 15 Oct 2026
    slides = EPISODE["carousel"]["slides"]
    kinds = [kind(i, len(slides), s["headline"]) for i, s in enumerate(slides)]
    assert kinds == ["cover", "idea", "idea", "idea", "idea", "follow"]
    assert idea_texts(EPISODE)[0] == "Limit per client By API key or account, never by IP alone"


def test_a_crop_keeps_16_9_inside_the_frame_and_never_zooms_past_the_limit() -> None:
    region = _crop([900, 500, 1000, 560])
    assert region["width"] / region["height"] == pytest.approx(16 / 9)
    assert region["width"] == pytest.approx(1920 / 2.5)
    assert region["x"] >= 0 and region["x"] + region["width"] <= 1920
    full = _crop([0, 0, 1920, 1080])
    assert full == {"x": 0.0, "y": 0.0, "width": 1920, "height": 1080}


def test_thumbnails_and_slides_are_drawn(tmp_path: Path) -> None:
    still = tmp_path / "still.png"
    still.write_bytes(PIXEL)
    thumbs = draw_thumbnails(EPISODE, [still, still, still], BRAND, tmp_path)
    assert [path.name for path in thumbs] == ["thumb-a.jpg", "thumb-b.jpg", "thumb-c.jpg"]
    slides = draw_carousel(EPISODE, still, tmp_path, [still] * 4)
    assert [path.name for path in slides] == [f"carousel-0{n}.jpg" for n in range(1, 7)]
    for path in [*thumbs, *slides]:
        assert path.read_bytes()[:2] == b"\xff\xd8"  # a JPEG
        assert path.stat().st_size < 2 * 1024 * 1024  # YouTube's limit for a thumbnail

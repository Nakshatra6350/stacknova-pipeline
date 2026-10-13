"""A whole preview, start to finish: clips drawn in the browser, joined, and the audio cut to
match (the scenes dependency group and ffmpeg)."""

import re
import subprocess
from pathlib import Path
from typing import Any

import pytest

pytest.importorskip("playwright.sync_api", reason="needs the scenes dependency group")

from channel_os.brand.sound import write_sound
from channel_os.scenes.browser import count_frames
from channel_os.scenes.formats import LANDSCAPE
from channel_os.scenes.plan import plan_video
from channel_os.scenes.preview import DRAWN, render_preview
from channel_os.scenes.spec import STAGES
from channel_os.scenes.theme import load_themes

SCRIPT = "You tapped Pay and got an error. The fix is one key per payment."
VISUAL = {
    "layout": "console",
    "phone": {"title": "Checkout", "total": "$100.00"},
    "systems": [{"id": "api", "name": "API server"}, {"id": "gateway", "name": "Payment gateway"}],
    "steps": [{"at": "tapped Pay", "action": "tap", "target": "phone"}],
}
# Brand scenes far shorter than the real ones, so the test stays quick.
BRAND: dict[str, Any] = {
    "tagline": "Light up your whole stack.",
    "handles": {"confirmed": {"youtube": "@StackNovaDev", "instagram": "@stacknova.dev"}},
    "video": {"intro": {"seconds": 0.5}, "outro": {"seconds": 1.0, "music": "lofi-nod"}},
}


def loudest(path: Path, start: float, seconds: float) -> float:
    """The peak level of a stretch of a file's audio, in dB (silence is far below -60)."""
    done = subprocess.run(
        ["ffmpeg", "-hide_banner", "-ss", str(start), "-t", str(seconds), "-i", str(path),
         "-vn", "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True, check=True,
    )
    found = re.search(r"max_volume: (-?[\d.]+|-inf) dB", done.stderr)
    assert found, done.stderr[-400:]
    return float(found.group(1))


def test_a_long_preview_is_frame_exact_and_its_audio_follows_the_picture(
    tmp_path: Path, repo_root: Path, audio: Any
) -> None:
    segments = [{"id": unit, "title": "Part", "narration": SCRIPT, "visual": VISUAL}
                for unit in ("s01", "s02")]
    episode = {"id": "001-test", "segments": segments, "shorts": []}
    entry = {"duration": 2.0,
             "segments": [{"id": unit, "start": start, "duration": 1.0, "pauses": []}
                          for unit, start in (("s01", 0.0), ("s02", 1.0))]}
    plan = plan_video(episode, "long", entry, BRAND)
    assert [(clip.unit, clip.frames) for clip in plan.clips] == [
        ("s01", 30), ("intro", 15), ("s02", 30), ("outro", 30)]

    narration = audio(tmp_path / "narration.wav", [(2.0, 0.1)])
    sounds = {"outro": write_sound("lofi-nod", tmp_path / "outro.wav")}
    theme = load_themes(repo_root / "config" / "themes.yaml").themes["control"]
    preview = render_preview(plan, LANDSCAPE, theme, narration, tmp_path / "preview" / "long.mp4",
                             sounds, quality=0.25, jobs=2)

    assert count_frames(preview) == plan.frames == 105
    # Narration under the hook, silence under the logo (no intro sound has been chosen),
    # narration again, then the outro's music.
    assert loudest(preview, 0.2, 0.6) > -30
    assert loudest(preview, 1.15, 0.2) < -60
    assert loudest(preview, 1.7, 0.6) > -30
    assert loudest(preview, 2.7, 0.6) > -40


def test_the_page_draws_some_layouts_and_the_rest_wait_for_their_stage() -> None:
    # Layouts the validator accepts but the page cannot draw yet fail at render time with the
    # page's own message; this list shrinks as the remaining stages are rebuilt.
    assert set(DRAWN) - {"brand"} <= set(STAGES)
    assert "console" in DRAWN and "brand" in DRAWN

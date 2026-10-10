"""A preview: every planned clip, in order, under the narration."""

from pathlib import Path
from typing import Any

import pytest

pytest.importorskip("manim", reason="needs the scenes dependency group")

import av

from channel_os.scenes.flow_model import layout
from channel_os.scenes.formats import PORTRAIT
from channel_os.scenes.plan import plan_clips
from channel_os.scenes.preview import render_preview
from channel_os.scenes.render import count_frames, read_frame
from channel_os.scenes.theme import load_themes

QUALITY = 0.25
SCRIPT = "You tapped Pay and got an error. So you tapped again. The fix is one key per payment."
NODES = [
    {"id": "you", "kind": "phone", "label": "you"},
    {"id": "server", "kind": "service", "label": "server"},
    {"id": "bank", "kind": "ledger", "label": "bank"},
]
WITH_TABLE = {"layout": "flow", "from": "The fix", "nodes": NODES,
              "table": {"title": "keys", "owner": "server"},
              "steps": [{"at": "one key", "action": "press", "target": "you"}]}
VISUAL = [
    {"layout": "flow", "nodes": NODES,
     "steps": [{"at": "tapped Pay", "action": "press", "target": "you"}]},
    WITH_TABLE,
]


def test_clips_are_joined_in_order_under_the_narration(
    tmp_path: Path, repo_root: Path, cache: Path, audio: Any
) -> None:
    themes = load_themes(repo_root / "config" / "themes.yaml")
    episode = {"id": "001-test", "segments": [], "shorts": [
        {"id": "short-1", "source": "standalone", "script": SCRIPT, "visual": VISUAL}]}
    entry = {"duration": 3.0, "segments": [
        {"id": "short-1", "start": 0.0, "duration": 3.0, "pauses": [[1.0, 1.2], [1.8, 2.0]]}]}
    clips = plan_clips(episode, "short-1", entry)
    assert [clip.frames for clip in clips] == [60, 30]

    narration = audio(tmp_path / "narration.wav", [(3.0, 0.1)])
    out = render_preview(clips, PORTRAIT, themes.themes["navy"], themes, narration,
                         tmp_path / "preview" / "short-1.mp4", quality=QUALITY, cache_dir=cache)

    assert count_frames(out) == 90
    with av.open(str(out)) as container:
        assert len(container.streams.audio) == 1
        assert float(container.duration) / av.time_base == pytest.approx(3.0, abs=0.1)
    # Only the second scene has a table: its place is empty before the cut and drawn after it.
    table = layout(PORTRAIT, WITH_TABLE).table
    assert table is not None
    rows = slice(round(table.rect.y0 * QUALITY), round(table.rect.y1 * QUALITY))
    columns = slice(round(table.rect.x0 * QUALITY), round(table.rect.x1 * QUALITY))
    before, after = (float(read_frame(out, index)[rows, columns].mean()) for index in (55, 85))
    assert after > before + 3

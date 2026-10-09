"""The package layout of CLAUDE.md section 5 exists and is importable."""

import importlib

import pytest

SKELETON_MODULES = [
    "channel_os",
    "channel_os.voice.tts",
    "channel_os.voice.loudness",
    "channel_os.scenes.theme",
    "channel_os.scenes.components",
    "channel_os.assemble.timeline",
    "channel_os.assemble.ffmpeg",
    "channel_os.assemble.cuts",
    "channel_os.assemble.thumbnails",
    "channel_os.assemble.carousel",
    "channel_os.captions.align",
    "channel_os.captions.ass",
    "channel_os.captions.srt",
    "channel_os.publish.youtube",
    "channel_os.publish.instagram",
    "channel_os.publish.pages_host",
    "channel_os.telegram.bot",
    "channel_os.telegram.approvals",
    "channel_os.state.queue",
    "channel_os.report.weekly",
    "channel_os.reach",
]


@pytest.mark.parametrize("name", SKELETON_MODULES)
def test_module_imports_and_is_documented(name: str) -> None:
    module = importlib.import_module(name)
    assert module.__doc__ and module.__doc__.strip()

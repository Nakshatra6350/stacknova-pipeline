"""Shared fixtures: a minimal episode that passes the schema and every lint rule."""

from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = ["hi", "es", "pt", "id", "vi", "ar"]


def _segment(segment_id: str) -> dict[str, Any]:
    return {
        "id": segment_id,
        "title": f"Segment {segment_id}",
        "narration": "Here is the retry that matters." + " filler" * 400,
        "emphasis": ["retry"],
        "visual": {
            "layout": "client-server-db",
            "steps": [
                {"at": "start", "action": "add", "target": "client"},
                {"at": "the retry", "action": "highlight", "target": "client"},
            ],
        },
    }


@pytest.fixture
def episode() -> dict[str, Any]:
    return {
        "id": "900-fixture",
        "version": 1,
        "status": "ready_to_render",
        "pillar": "money-systems",
        "language": "en",
        "keywords": {"primary": "idempotency"},
        "packaging": {
            "titles": ["Idempotency keys explained", "Idempotency: why retries are safe"],
            "thumbnail_texts": ["CHARGED TWICE?"],
            "description": "Fixture description.",
            "tags": ["a", "b", "c", "d", "e"],
        },
        "segments": [_segment("s01"), _segment("s02"), _segment("s03")],
        "shorts": [
            {
                "id": "short-1",
                "source": "segments",
                "segments": ["s02"],
                "hook_on_screen": "This retry charged you twice",
                "youtube_title": "Why Your Retry Charged You Twice #Shorts",
                "instagram_caption": "Caption.",
            },
            {
                "id": "short-2",
                "source": "standalone",
                "script": "A standalone script about one retry.",
                "hook_on_screen": "Exactly-once is a lie",
                "youtube_title": "Exactly-Once Delivery Doesn't Exist #Shorts",
                "instagram_caption": "Caption.",
            },
        ],
        "sources": [{"title": "RFC 9110", "url": "https://www.rfc-editor.org/rfc/rfc9110"}],
        "fact_check": [
            {"claim": "GET is idempotent", "source": "https://www.rfc-editor.org/rfc/rfc9110"}
        ],
        "localizations": {
            language: {"title": f"Title {language}", "description": f"Description {language}"}
            for language in LANGUAGES
        },
    }


@pytest.fixture
def reach() -> dict[str, Any]:
    return {"subtitle_languages": list(LANGUAGES), "quality_gates": {"title_max_chars": 60}}


@pytest.fixture
def repo_root() -> Path:
    return REPO_ROOT

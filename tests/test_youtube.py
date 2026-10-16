"""The YouTube uploader: always private, dry run by default in tests, secrets never shown."""

from pathlib import Path
from typing import Any

import pytest

from channel_os.publish.youtube import (
    ConfigError,
    credentials_from_env,
    main,
    upload_body,
    upload_private,
)


class FakeRequest:
    """An upload that finishes in two chunks."""

    def __init__(self) -> None:
        self.chunks = 0

    def next_chunk(self) -> tuple[Any, Any]:
        self.chunks += 1
        if self.chunks == 1:
            return type("Status", (), {"progress": lambda self: 0.5})(), None
        return None, {"id": "vid123"}


class FakeService:
    def __init__(self) -> None:
        self.sent: dict[str, Any] = {}

    def videos(self) -> "FakeService":
        return self

    def insert(self, **kwargs: Any) -> FakeRequest:
        self.sent = kwargs
        return FakeRequest()


def video(tmp_path: Path) -> Path:
    path = tmp_path / "test.mp4"
    path.write_bytes(b"\x00" * 1024)
    return path


def test_every_upload_is_private_and_discloses_the_cloned_voice() -> None:
    body = upload_body("Title", "Description")
    assert body["status"] == {"privacyStatus": "private", "selfDeclaredMadeForKids": False,
                              "containsSyntheticMedia": True}
    assert body["snippet"]["categoryId"] == "27"  # Education


def test_a_dry_run_logs_the_request_and_sends_nothing(tmp_path: Path) -> None:
    lines: list[str] = []
    assert upload_private(video(tmp_path), "T", "D", dry_run=True, log=lines.append) is None
    assert lines[0].startswith("POST https://www.googleapis.com/upload/youtube/v3/videos")
    assert '"privacyStatus": "private"' in lines[0]
    assert lines[-1] == "dry run: nothing sent"


def test_an_upload_returns_the_video_id(tmp_path: Path) -> None:
    service, lines = FakeService(), []
    found = upload_private(video(tmp_path), "T", "D", dry_run=False, service=service,
                           make_media=lambda path: f"media:{path.name}", log=lines.append)
    assert found == "vid123"
    assert service.sent["part"] == "snippet,status"
    assert service.sent["body"]["status"]["privacyStatus"] == "private"
    assert service.sent["media_body"] == "media:test.mp4"
    assert "uploaded 50%" in lines
    assert lines[-1].endswith("https://studio.youtube.com/video/vid123/edit")


def test_missing_secrets_are_named_and_values_never_shown() -> None:
    with pytest.raises(ConfigError, match="YT_CLIENT_SECRET, YT_REFRESH_TOKEN"):
        credentials_from_env({"YT_CLIENT_ID": "id-value"})
    creds = credentials_from_env({"YT_CLIENT_ID": "a", "YT_CLIENT_SECRET": "b",
                                  "YT_REFRESH_TOKEN": "secret-token"})
    assert "secret-token" not in repr(creds) and "secret-token" not in str(creds)


def test_the_command_dry_run_needs_no_secrets(tmp_path: Path,
                                              capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--file", str(video(tmp_path)), "--title", "T", "--dry-run"]) == 0
    assert "dry run: nothing sent" in capsys.readouterr().out
    assert main(["--file", str(tmp_path / "missing.mp4"), "--title", "T", "--dry-run"]) == 2

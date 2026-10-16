"""YouTube Data API v3 uploads and metadata for approved assets (M5).

Built so far (16 October 2026): one upload, always **private**, which is what the YouTube API
audit asks to see in a screen recording, and the first piece of M5. Nothing here can make a
video public: making one public waits for the approval flow (docs/APPROVAL_FLOW.md), and until
the project passes Google's audit YouTube keeps API uploads private anyway.

    python -m channel_os.publish.youtube --file video.mp4 --title "..." [--dry-run]

Credentials come from the environment (YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN,
docs/SECRETS.md) and are never printed. The Google client libraries are the `publish`
dependency group; they are imported only when a real call is made, so a dry run needs none.
"""

import argparse
import json
import os
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

TOKEN_URI = "https://oauth2.googleapis.com/token"
SCOPES = (
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
)
EDUCATION = "27"  # YouTube's category id for Education
PRIVATE = "private"
ENV_NAMES = ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN")

Log = Callable[[str], None]


class ConfigError(RuntimeError):
    """A credential is missing. The message names it, never shows a value."""


@dataclass(frozen=True)
class Credentials:
    client_id: str
    client_secret: str
    refresh_token: str

    def __repr__(self) -> str:  # never let a value reach a log by accident
        return "Credentials(<hidden>)"


def credentials_from_env(env: Mapping[str, str] = os.environ) -> Credentials:
    missing = [name for name in ENV_NAMES if not env.get(name)]
    if missing:
        raise ConfigError(f"missing secret(s): {', '.join(missing)} (docs/SECRETS.md)")
    return Credentials(env["YT_CLIENT_ID"], env["YT_CLIENT_SECRET"], env["YT_REFRESH_TOKEN"])


def build_service(credentials: Credentials) -> Any:
    """The YouTube Data API client, signed in with the refresh token."""
    from google.oauth2.credentials import Credentials as GoogleCredentials
    from googleapiclient.discovery import build

    google = GoogleCredentials(
        token=None, refresh_token=credentials.refresh_token, token_uri=TOKEN_URI,
        client_id=credentials.client_id, client_secret=credentials.client_secret,
        scopes=list(SCOPES))
    return build("youtube", "v3", credentials=google, cache_discovery=False)


def media_file(path: Path) -> Any:
    from googleapiclient.http import MediaFileUpload

    return MediaFileUpload(str(path), mimetype="video/mp4", chunksize=-1, resumable=True)


def upload_body(title: str, description: str, tags: Sequence[str] = ()) -> dict[str, Any]:
    """The video resource sent with an upload. Always private: see the module docstring."""
    return {
        "snippet": {"title": title, "description": description, "tags": list(tags),
                    "categoryId": EDUCATION, "defaultLanguage": "en",
                    "defaultAudioLanguage": "en"},
        "status": {"privacyStatus": PRIVATE, "selfDeclaredMadeForKids": False,
                   # The narration is a cloned voice: disclosed on every upload
                   # (docs/CONTENT_RULES.md).
                   "containsSyntheticMedia": True},
    }


def channel_title(service: Any) -> str:
    """The name of the channel the credentials act for."""
    items = service.channels().list(part="snippet", mine=True).execute().get("items") or []
    if not items:
        raise ConfigError("the refresh token is not for a YouTube channel")
    return str(items[0]["snippet"]["title"])


def upload_private(video: Path, title: str, description: str, *, dry_run: bool,
                   service: Any = None, make_media: Callable[[Path], Any] = media_file,
                   log: Log = print) -> str | None:
    """Upload `video` as a private video and return its id; with dry_run, only log the request.

    `service` is the API client (build_service); tests pass a stand-in.
    """
    if not video.is_file():
        raise FileNotFoundError(f"{video}: no such video")
    body = upload_body(title, description)
    log("POST https://www.googleapis.com/upload/youtube/v3/videos"
        f"?part=snippet,status&uploadType=resumable  file={video.name} "
        f"({video.stat().st_size} bytes)  body={json.dumps(body)}")
    if dry_run:
        log("dry run: nothing sent")
        return None
    request = service.videos().insert(part="snippet,status", body=body,
                                      media_body=make_media(video))
    response = None
    while response is None:
        status, response = request.next_chunk()
        if status is not None:
            log(f"uploaded {int(status.progress() * 100)}%")
    video_id = str(response["id"])
    log(f"uploaded as {video_id} (private): https://studio.youtube.com/video/{video_id}/edit")
    return video_id


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m channel_os.publish.youtube",
                                     description="Upload one video to the channel, private.")
    parser.add_argument("--file", type=Path, required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--description", default="")
    parser.add_argument("--dry-run", action="store_true", help="log the request, send nothing")
    args = parser.parse_args(argv)
    try:
        service = None
        if not args.dry_run:
            service = build_service(credentials_from_env())
            print(f"signed in as the channel: {channel_title(service)}")
        upload_private(args.file, args.title, args.description, dry_run=args.dry_run,
                       service=service)
    except (ConfigError, FileNotFoundError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

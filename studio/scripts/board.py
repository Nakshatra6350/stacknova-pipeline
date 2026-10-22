r"""The posting board of the 22 Oct 2026 plan: every post with the words to paste, as one page.

    .venv\Scripts\python.exe studio/scripts/board.py OUT.html

Reads the same texts as upload_day.py --plan (post-v2.yaml, the deep dive's kit with its plan
titles) for the days in DAYS, and fills studio/covers/board.html. Nothing is posted.
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import upload_day as ud

TEMPLATE = ud.ROOT / "studio" / "covers" / "board.html"
# the days and items exactly as the plan folders were filled (upload_day.py --plan="New plan")
DAYS = [
    ("Fri 23 Oct", "2026-10-23", ["18-30:short:007-p1", "20-00:reel:007-p1"]),
    ("Sat 24 Oct", "2026-10-24", ["17-30:carousel:007-c1", "18-30:short:007-p2",
                                  "20-00:reel:007-p2"]),
    ("Sun 25 Oct", "2026-10-25", ["18-30:short:007-p3", "20-00:reel:007-p3"]),
    ("Mon 26 Oct", "2026-10-26", ["18-30:short:007-p4", "20-00:reel:007-p4"]),
    ("Tue 27 Oct", "2026-10-27", ["17-30:carousel:007-c2", "19-30:long:007-long",
                                  "20-00:reel:007-reel", "20-30:short:007-reel"]),
    ("Wed 28 Oct", "2026-10-28", ["18-30:short:008-p1", "20-00:reel:008-p1"]),
    ("Thu 29 Oct", "2026-10-29", ["18-30:short:008-p2", "20-00:reel:008-p2"]),
    ("Fri 30 Oct", "2026-10-30", ["18-30:short:008-p3", "20-00:reel:008-p3"]),
]


def kit_sections(kit: str) -> dict[str, Any]:
    """Titles, description, tags, pinned comment and translations from a kit.txt."""
    lines = kit.splitlines()

    def after(head: str) -> int:
        return next(i for i, line in enumerate(lines) if line.startswith(head)) + 1

    t = after("TITLE")
    titles = []
    while t < len(lines) and lines[t].startswith("  "):
        titles.append(lines[t].strip())
        t += 1
    d, tags = after("DESCRIPTION:"), after("TAGS (") - 1
    pin = after("PINNED COMMENT:")
    translations = []
    if any(line.startswith("TRANSLATED") for line in lines):
        for i in range(after("TRANSLATED"), len(lines)):
            line = lines[i]
            if line.startswith("  [") and i + 1 < len(lines):
                code, title = line.strip()[1:].split("] ", 1)
                translations.append({"code": code, "title": title,
                                     "description": lines[i + 1].strip()})
    return {
        "titles": titles,
        "description": "\n".join(lines[d:tags]).strip(),
        "tags": lines[tags + 1].strip(),
        "pinned": lines[pin].strip(),
        "translations": translations,
    }


def slot(day: str, date: str, number: int, item: str) -> dict[str, Any]:
    time, kind, film = item.split(":")
    post = ud.post_of(film)
    name = f"{number:02d} {time} {ud.KINDS[kind]} {post['name']}"
    ist = datetime.fromisoformat(f"{date}T{time.replace('-', ':')}")
    out: dict[str, Any] = {
        "id": f"{date}-{number}", "day": day, "date": date, "kind": kind,
        "ist": ist.strftime("%H:%M"),
        "utc": (ist - timedelta(hours=5, minutes=30)).strftime("%H:%M"),
        "title": post.get("title") or post["name"], "files": [], "note": "", "fields": [],
        "more": [], "moreLabel": "",
    }
    if kind == "short":
        out["files"] = [f"{name}.mp4"]
        related = post.get("related", "leave empty")
        out["note"] = f"Related video (field under the description): {related}"
        out["fields"] = [{"label": "Title", "text": post["title"]},
                         {"label": "Description", "text": post["description"].strip()}]
        if post.get("tags"):
            out["fields"].append({"label": "Tags (Show more → Tags)", "text": post["tags"]})
    elif kind == "reel":
        out["title"] = post["caption"].strip().splitlines()[0]
        out["files"] = [f"{name}.mp4", f"{name} - cover.jpg"]
        out["note"] = "Set the cover: Edit cover → Add from camera roll → the - cover.jpg file."
        out["fields"] = [{"label": "Caption", "text": post["caption"].strip()}]
    elif kind == "carousel":
        slides = sorted(ud.release(film).iterdir())
        out["title"] = post["caption"].strip().splitlines()[0]
        out["files"] = [f"{name}/  ({len(slides)} slides, in order)"]
        out["fields"] = [{"label": "Caption", "text": post["caption"].strip()}]
    else:
        kit = kit_sections(ud.kit_v2((ud.release(film) / "kit.txt").read_text(encoding="utf-8-sig"),
                                     post))
        out["title"] = kit["titles"][0]
        out["files"] = [f"{name}.mp4", f"{name} - subtitles and thumbnails/"]
        out["note"] = ("Thumbnail: thumb-a.jpg, then thumb-b and thumb-c under Test & compare. "
                       "Subtitles: subtitles.en.srt (English, with timing).")
        out["fields"] = [
            {"label": "Title", "text": kit["titles"][0]},
            {"label": "Title B (Test & compare)", "text": kit["titles"][1]},
            {"label": "Description", "text": kit["description"]},
            {"label": "Tags (Show more → Tags)", "text": kit["tags"]},
            {"label": "Pinned comment", "text": kit["pinned"]},
        ]
        out["more"] = [{"label": f"[{t['code']}] title", "text": t["title"]}
                       for t in kit["translations"]]
        out["more"] += [{"label": f"[{t['code']}] description", "text": t["description"]}
                        for t in kit["translations"]]
        out["moreLabel"] = f"Translations ({len(kit['translations'])} languages)"
    return out


def main(out: Path) -> None:
    ud.PLAN = "New plan"
    slots = [slot(day, date, n, item) for day, date, items in DAYS
             for n, item in enumerate(items, 1)]
    page = TEMPLATE.read_text(encoding="utf-8").replace(
        "/*DATA*/null", json.dumps({"slots": slots}, ensure_ascii=False).replace("</", "<\\/"))
    out.write_text(page, encoding="utf-8")
    print(out, len(slots), "posts")


if __name__ == "__main__":
    main(Path(sys.argv[1]))

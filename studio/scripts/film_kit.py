r"""The upload kit of a long film: everything to post it by hand, next to the video.

    .venv\Scripts\python.exe studio/scripts/film_kit.py FILM_ID EPISODE_ID T1 T2 T3

Reads studio/public/films/<FILM_ID>/timeline.json and content/episodes/<EPISODE_ID>/episode.yaml;
T1 T2 T3 are the moments of the film (seconds) the three thumbnails are made from. Writes
out/release/<FILM_ID>/: subtitles.en.srt (the exact words, timed by the voice), thumb-a/b/c.jpg in
the layouts of config/brand.yaml, and kit.txt (titles, description with chapters, tags, pinned
comment, the translated titles and descriptions). Nothing is uploaded: the owner posts by hand.
"""

import re
import sys
import tempfile
from pathlib import Path
from typing import Any

import yaml

from channel_os.assemble.thumbnails import draw, layouts
from channel_os.captions.srt import (
    MAX_SECONDS,
    MIN_SECONDS,
    Cue,
    chapters,
    problems,
    to_srt,
    wrap,
)
from channel_os.kit import long_description

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render

ROOT = Path(__file__).resolve().parents[2]
LINGER = 0.5
# The long videos already out (YouTube ids from the launch on 19 October 2026).
LINKS = {"006-payment-system": "https://youtu.be/t2-cmCu12hk"}


def cues(lines: list[dict[str, Any]]) -> list[Cue]:
    """Sentence-level cues of at most two lines of 42 characters and 1 to 7 seconds."""
    out: list[Cue] = []
    for line in lines:
        words: list[dict[str, Any]] = []
        for n, w in enumerate(line["words"]):
            text = " ".join(x["w"] for x in [*words, w])
            if words and (wrap(text) is None or w["e"] - words[0]["s"] > MAX_SECONDS):
                out.append(
                    Cue(words[0]["s"], words[-1]["e"], wrap(" ".join(x["w"] for x in words)) or ())
                )
                words = []
            words.append(w)
            last = n == len(line["words"]) - 1
            ends = re.search(r"[.!?]$", w["w"]) and w["e"] - words[0]["s"] >= MIN_SECONDS
            if last or ends:
                out.append(Cue(words[0]["s"], w["e"], wrap(" ".join(x["w"] for x in words)) or ()))
                words = []
    # each cue lingers a little after its last word, never past the next one
    done: list[Cue] = []
    for n, cue in enumerate(out):
        following = out[n + 1].start if n + 1 < len(out) else cue.end + LINGER
        end = min(
            max(cue.end + LINGER, cue.start + MIN_SECONDS), following, cue.start + MAX_SECONDS
        )
        done.append(Cue(round(cue.start, 3), round(end, 3), cue.lines))
    return done


def main(film_id: str, episode_id: str, times: list[float]) -> None:
    timeline_path = ROOT / "studio" / "public" / "films" / film_id / "timeline.json"
    timeline = yaml.safe_load(timeline_path.read_text(encoding="utf-8"))
    episode = yaml.safe_load(
        (ROOT / "content" / "episodes" / episode_id / "episode.yaml").read_text(encoding="utf-8")
    )
    brand = yaml.safe_load((ROOT / "config" / "brand.yaml").read_text(encoding="utf-8"))
    out = ROOT / "out" / "release" / film_id
    out.mkdir(parents=True, exist_ok=True)

    srt = to_srt(cues(timeline["lines"]))
    issues = problems(srt)
    if issues:
        raise SystemExit("subtitle problems: " + "; ".join(issues[:5]))
    (out / "subtitles.en.srt").write_text(srt, encoding="utf-8")

    titles = {s["id"]: s["title"] for s in episode["segments"]}
    starts = [
        (0.0 if n == 0 else c["start"], titles[c["segment"]])
        for n, c in enumerate(timeline["chapters"])
    ]
    chapter_lines = chapters(starts)
    description = long_description(episode, chapter_lines, None, None, episode["packaging"]["tags"])
    previous = "006-payment-system"
    description = description.replace("[LINK: ]", "").replace(
        "Previous: design a payment system — ",
        f"Previous: design a payment system — {LINKS[previous]}",
    )
    description = description.replace("— coming soon, subscribe", "— out Saturday, subscribe")

    with tempfile.TemporaryDirectory() as work:
        stills = Path(work)
        render.stills(timeline_path, stills, times)
        frames = sorted(stills.iterdir())
        for letter, text, frame, layout in zip(
            "abc",
            episode["packaging"]["thumbnail_texts"],
            frames,
            layouts(brand, len(frames)),
            strict=False,
        ):
            crop = stills / f"crop-{letter}.png"
            subprocess_crop(frame, crop)
            draw(text, crop, layout, out / f"thumb-{letter}.jpg")

    loc = episode.get("localizations") or {}
    kit = [
        f"{episode_id}: the long video, posted by hand on YouTube",
        "",
        "TITLE (pick one; the first two are for YouTube's title test):",
        *[f"  {t}" for t in episode["packaging"]["titles"]],
        "",
        "DESCRIPTION:",
        description.rstrip(),
        "",
        "TAGS (paste into the tags field, comma separated):",
        ", ".join(episode["packaging"]["tags"]),
        "",
        "PINNED COMMENT:",
        episode["packaging"]["pinned_comment"],
        "",
        "SUBTITLES: upload subtitles.en.srt as English (with timing).",
        "THUMBNAIL: thumb-a.jpg (use Test & compare with thumb-b and thumb-c).",
        "ALTERED OR SYNTHETIC CONTENT: Yes (the voice is synthetic).",
        "",
        "TRANSLATED TITLES AND DESCRIPTIONS (Subtitles → Add language → Title & description):",
    ]
    for lang, entry in loc.items():
        kit += [f"  [{lang}] {entry['title']}", f"       {entry['description']}", ""]
    (out / "kit.txt").write_text("\n".join(kit), encoding="utf-8-sig")
    print(out)


def subprocess_crop(frame: Path, crop: Path) -> None:
    """The 3D window of a long film's frame (below the title band), as the thumbnail's picture."""
    import subprocess

    subprocess.run(
        [
            render.ffmpeg(),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(frame),
            "-vf",
            "crop=1920:930:0:150",
            str(crop),
        ],
        check=True,
    )


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], [float(t) for t in sys.argv[3:]])

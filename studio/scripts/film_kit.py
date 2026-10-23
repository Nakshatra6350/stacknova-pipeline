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
LINKS = {"design a payment system": "https://youtu.be/t2-cmCu12hk"}  # posted videos, by name


def merge_short(out: list[Cue]) -> list[Cue]:
    """A cue that cannot stay up for MIN_SECONDS before the next one starts (a short line like
    "Forty days?!" answered at once) joins a neighbour, if the two still fit the track rules."""
    out = list(out)
    n = 0
    while n < len(out):
        room = (out[n + 1].start if n + 1 < len(out) else out[n].end + LINGER) - out[n].start
        if room >= MIN_SECONDS:
            n += 1
            continue
        for other in (n + 1, n - 1):
            if not 0 <= other < len(out):
                continue
            a, b = sorted((n, other))
            lines = wrap(" ".join([*out[a].lines, *out[b].lines]))
            if lines is not None and out[b].end - out[a].start <= MAX_SECONDS:
                out[a : b + 1] = [Cue(out[a].start, out[b].end, lines)]
                n = max(a - 1, 0)
                break
        else:
            n += 1
    return out


def balance(groups: list[list[dict[str, Any]]]) -> None:
    """A group cut off by the line length can be a tail too short to read ("future."): it takes
    words from the end of the group before it, while both still fit and that one stays readable."""
    for n in range(1, len(groups)):
        before, group = groups[n - 1], groups[n]
        if before[-1].get("cut") is not True:
            continue
        while group[-1]["e"] - group[0]["s"] < MIN_SECONDS and len(before) > 1:
            moved = [before[-1], *group]
            if wrap(" ".join(x["w"] for x in moved)) is None:
                break
            if before[-2]["e"] - before[0]["s"] < MIN_SECONDS:
                break
            group[:] = moved
            before.pop()


def cues(lines: list[dict[str, Any]]) -> list[Cue]:
    """Sentence-level cues of at most two lines of 42 characters and 1 to 7 seconds."""
    groups: list[list[dict[str, Any]]] = []
    for line in lines:
        words: list[dict[str, Any]] = []
        for n, w in enumerate(line["words"]):
            text = " ".join(x["w"] for x in [*words, w])
            if words and (wrap(text) is None or w["e"] - words[0]["s"] > MAX_SECONDS):
                words[-1] = {**words[-1], "cut": True}  # the sentence goes on in the next group
                groups.append(words)
                words = []
            words.append(w)
            last = n == len(line["words"]) - 1
            ends = re.search(r"[.!?]$", w["w"]) and w["e"] - words[0]["s"] >= MIN_SECONDS
            if last or ends:
                groups.append(words)
                words = []
    balance(groups)
    out = [Cue(g[0]["s"], g[-1]["e"], wrap(" ".join(x["w"] for x in g)) or ()) for g in groups]
    out = merge_short(out)
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
    # the previous video by its link when it is known, else on the channel; the next one comes
    # out on the day the end card names ("NEXT · TUESDAY")
    lines = description.replace("[LINK: ]", "").split("\n")
    for n, line in enumerate(lines):
        if line.startswith("Previous: ") and line.endswith(" — "):
            lines[n] = line + LINKS.get(line.removeprefix("Previous: ")[:-3], "on the channel")
    day = timeline["film"]["end"]["kicker"].split("·")[-1].strip().capitalize()
    description = "\n".join(lines).replace("— coming soon, subscribe", f"— out {day}, subscribe")

    with tempfile.TemporaryDirectory() as work:
        stills = Path(work)
        render.stills(timeline_path, stills, times)
        frames = [stills / f"t{t:06.2f}.jpg" for t in times]  # T1 goes with the first text
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

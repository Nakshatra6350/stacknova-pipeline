"""The upload kit: what a person needs to post an episode by hand.

Usage: python -m channel_os.kit --episode ID [--out DIR] [--images [--variants]]

Launch week (19 October 2026) is posted by hand, before the publishing milestones exist, so
everything the publish workflows will one day send is written down instead: the English
subtitle track of every video, the long video's chapters, and a kit.md with every title,
description, tag, caption and hashtag, ready to paste. Reads timing.json from the voice stage
(in --out, as the scenes stage does). With --images it also draws the thumbnails and the
carousel slides (assemble/thumbnails.py, assemble/carousel.py) over stills of the episode's own
scenes, which needs the browser; --variants also writes every thumbnail layout for comparison.

Nothing here talks to a platform. Links between episodes are not known until the videos are
up, so the kit marks each one as [LINK: <episode id>] for the person posting to fill in.
"""

import argparse
import json
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from channel_os.captions.srt import Cue, chapters, problems, to_srt, track, unit_cues, unit_starts
from channel_os.scenes.formats import FPS
from channel_os.scenes.plan import LONG, VideoPlan, declared_theme, plan_video, welcome_line
from channel_os.validate import InputError, load_json, load_yaml
from channel_os.voice.narrate import all_targets, select_units

BRAND_CONFIG = Path("config") / "brand.yaml"
REACH_CONFIG = Path("config") / "reach.yaml"
THEMES_CONFIG = Path("config") / "themes.yaml"
EPISODES = Path("content") / "episodes"
LANGUAGE_NAMES = {"hi": "Hindi", "es": "Spanish", "pt": "Portuguese", "id": "Indonesian",
                  "vi": "Vietnamese", "ar": "Arabic"}


def link(episode_id: str) -> str:
    return f"[LINK: {episode_id}]"


def subtitles(episode: Mapping[str, Any], target: str, entry: Mapping[str, Any],
              plan: VideoPlan, brand: Mapping[str, Any]) -> list[Cue]:
    """The English subtitle cues of one target, on the video's clock."""
    welcome = welcome_line(brand) if target == LONG else None
    timed = {segment["id"]: segment for segment in entry["segments"]}
    starts = unit_starts(plan)
    units = []
    for unit in select_units(episode, target, welcome):
        segment = timed[unit.id]
        words = [(int(o), float(a), float(b)) for o, a, b in segment.get("words") or ()]
        pauses = [(float(a), float(b)) for a, b in segment.get("pauses") or ()]
        units.append((starts[unit.id], unit_cues(unit.text, segment["duration"], pauses, words)))
    return track(units)


def chapter_lines(episode: Mapping[str, Any], plan: VideoPlan) -> list[str]:
    """YouTube chapters of the long video: each segment's title where its first scene starts.
    The hook's chapter starts at 0:00 and holds the logo intro and the welcome line."""
    starts = unit_starts(plan)
    found = [(starts[segment["id"]], segment["title"]) for segment in episode["segments"]
             if segment["id"] in starts]
    return chapters([(0.0, found[0][1]), *found[1:]])


def _neighbours(episode_id: str, root: Path) -> tuple[str | None, str | None]:
    """The episodes before and after this one, by their next_episode links."""
    after: str | None = None
    before: str | None = None
    for path in sorted((root / EPISODES).glob("*/episode.yaml")):
        other = load_yaml(path)
        if other["id"] == episode_id:
            after = other.get("next_episode")
        elif other.get("next_episode") == episode_id:
            before = other["id"]
    if after and not (root / EPISODES / after).is_dir():
        after = None  # not written yet
    return before, after


def long_description(episode: Mapping[str, Any], chapter_text: Sequence[str],
                     before: str | None, after: str | None, tags: Sequence[str]) -> str:
    # The template's prose is wrapped for reading in YAML; a description wants one line a
    # paragraph. Paragraphs with a placeholder or a list keep their lines.
    paragraphs = str(episode["packaging"]["description"]).strip().split("\n\n")
    template = "\n\n".join(
        part if "{" in part or part.lstrip().startswith("-") else " ".join(part.split())
        for part in paragraphs)
    sources = "\n".join(f"- {source['title']}: {source['url']}" for source in episode["sources"])
    filled = (template.replace("{chapters}", "\n".join(chapter_text))
              .replace("{sources}", sources)
              .replace("{previous_link}", link(before) if before else "")
              .replace("{next_link}", link(after) if after else "coming soon, subscribe"))
    return filled.rstrip() + "\n\n" + " ".join(tags[:3]) + "\n"


def _block(text: str) -> str:
    return "```text\n" + text.rstrip("\n") + "\n```"


SETTINGS = ("category Education · language English · not made for kids · altered or synthetic "
            "content: Yes (the narration is a cloned voice, docs/CONTENT_RULES.md)")


def kit_data(episode: Mapping[str, Any], reach: Mapping[str, Any], brand: Mapping[str, Any],
             chapter_text: Sequence[str], before: str | None, after: str | None,
             durations: Mapping[str, float]) -> dict[str, Any]:
    """Every word to paste when posting the episode by hand, and the file each one goes with."""
    eid = str(episode["id"])
    packaging = episode["packaging"]
    handles = (brand.get("handles") or {}).get("confirmed") or {}
    instagram = handles.get("instagram", "")
    sets = reach.get("hashtag_sets") or {}
    long_tags = list(sets.get(episode["pillar"], []))
    titles = packaging["titles"]
    translations = []
    for code, text in (episode.get("localizations") or {}).items():
        if (text or {}).get("title") and (text or {}).get("description"):
            translations.append({"code": code, "language": LANGUAGE_NAMES.get(code, code),
                                 "title": text["title"], "description": text["description"]})
    shorts, reels = [], []
    for short in episode["shorts"]:
        sid = short["id"]
        tags = list(sets.get(short.get("pillar_hashtags", episode["pillar"]), long_tags))
        shorts.append({
            "id": sid, "video": f"preview.{sid}.mp4", "seconds": round(durations.get(sid, 0)),
            "subtitles": f"{sid}.en.srt", "title": short["youtube_title"],
            "description": (f"{short['hook_on_screen']}\n\nThe full animated deep dive: "
                            f"{link(eid)}\n\n#Shorts " + " ".join(tags[:3]))})
        reels.append({
            "id": sid, "video": f"preview.{sid}.mp4",
            "caption": (str(short["instagram_caption"]).rstrip()
                        + "\n\nThe full animated deep dive is on YouTube: StackNova (link in bio)."
                        f"\nFollow {instagram} for two deep dives a week.\n\n" + " ".join(tags))})
    slides = (episode.get("carousel") or {}).get("slides") or []
    carousel = None
    if slides:
        first = slides[0]
        carousel = {
            "slides": [f"carousel-{n:02}.jpg" for n in range(1, len(slides) + 1)],
            "caption": (f"{first['headline']}: {first['body']}. Swipe through, then save it for "
                        "your next system design interview.\n\nThe full animated deep dive is "
                        f"on YouTube: StackNova (link in bio).\nFollow {instagram} for more.\n\n"
                        + " ".join(long_tags))}
    return {
        "episode": eid, "release": f"ep-{eid}",
        "long": {
            "video": "preview.long.mp4", "minutes": round(durations.get(LONG, 0) / 60, 1),
            "subtitles": "long.en.srt", "thumbnails": ["thumb-a.jpg", "thumb-b.jpg", "thumb-c.jpg"],
            "settings": SETTINGS, "title": titles[0], "title_b": titles[1],
            "description": long_description(episode, chapter_text, before, after, long_tags),
            "tags": ", ".join(packaging["tags"]), "pinned_comment": packaging["pinned_comment"],
            "translations": translations},
        "shorts": shorts, "reels": reels, "carousel": carousel}


def kit_markdown(data: Mapping[str, Any]) -> str:
    """kit_data as a page to read and copy from, in posting order."""
    eid, long = data["episode"], data["long"]
    out: list[str] = [f"# {eid}: {long['title']}", ""]
    out += [f"Files are in the draft Release `{data['release']}`. Links between episodes are "
            "marked `[LINK: <episode>]`: paste the YouTube link of that episode once it is up.",
            ""]
    out += ["## YouTube: the long video", ""]
    out += [f"- Video: `{long['video']}` ({long['minutes']:.1f} min)",
            f"- Subtitles: `{long['subtitles']}` (Subtitles → Add language → English → Upload "
            "file, with timing)",
            f"- Thumbnail: `{long['thumbnails'][0]}`; for Test & compare add "
            + " and ".join(f"`{name}`" for name in long["thumbnails"][1:]),
            "- Settings: " + long["settings"].replace("Yes", "**Yes**")
            + " · end screen: the next episode + subscribe", ""]
    out += ["**Title**", "", _block(long["title"]), ""]
    out += ["**Title B for Test & compare**", "", _block(long["title_b"]), ""]
    out += ["**Description**", "", _block(long["description"]), ""]
    out += ["**Tags**", "", _block(long["tags"]), ""]
    out += ["**Pinned comment**", "", _block(long["pinned_comment"]), ""]
    if long["translations"]:
        out += ["**Translations** (Languages → Add language → title and description)", ""]
        for text in long["translations"]:
            out += [f"*{text['language']} ({text['code']})*", "", _block(text["title"]), "",
                    _block(text["description"]), ""]
    out += ["## YouTube Shorts", ""]
    for short in data["shorts"]:
        out += [f"### {short['id']}: {short['title']}", "",
                f"- Video: `{short['video']}` ({short['seconds']} s) · subtitles: "
                f"`{short['subtitles']}` (optional, the captions are burned in) · related video: "
                "the long video · altered or synthetic content: **Yes**", "",
                _block(short["title"]), "", _block(short["description"]), ""]
    out += ["## Instagram Reels", "",
            "The same files as the Shorts. Share to the feed too; add the AI label if you "
            "want Instagram to match YouTube.", ""]
    for reel in data["reels"]:
        out += [f"### Reel from {reel['id']}", "", f"- Video: `{reel['video']}`", "",
                _block(reel["caption"]), ""]
    if data["carousel"]:
        files = ", ".join(f"`{name}`" for name in data["carousel"]["slides"])
        out += ["## Instagram carousel", "", f"- Slides: {files}", "",
                _block(data["carousel"]["caption"]), ""]
    return "\n".join(out).rstrip() + "\n"


def _images(root: Path, episode: Mapping[str, Any], plan: VideoPlan, brand: Mapping[str, Any],
            kit: Path, variants: bool) -> list[Path]:
    """Thumbnails and carousel slides over stills of the long video's own scenes, in its theme.
    Imported here: they need the scenes dependency group and a browser."""
    from channel_os.assemble.carousel import draw_carousel, idea_texts
    from channel_os.assemble.frames import for_texts, picks, still, stills
    from channel_os.assemble.thumbnails import draw_thumbnails
    from channel_os.scenes.theme import load_themes, pick_theme

    theme = pick_theme(load_themes(root / THEMES_CONFIG), str(episode["id"]), LONG,
                       declared_theme(episode, LONG))
    kit = kit.resolve()  # the templates load the stills by file URI
    hook = picks(plan, episode, 1)
    if not hook:
        raise ValueError("the long video has no scene to take a still of")
    texts = episode["packaging"]["thumbnail_texts"]
    shots = stills(for_texts(texts, plan, episode), theme, kit / "stills")
    cover = still(hook[0], theme, kit / "stills" / "cover.png")
    ideas: list[Path] = []
    if (brand.get("carousel") or {}).get("scenes_on_every_slide"):
        ideas = [still(clip, theme, kit / "stills" / f"slide-{index + 2}.png", widest=3.0)
                 for index, clip in enumerate(for_texts(idea_texts(episode), plan, episode))]
    return [*draw_thumbnails(episode, shots, brand, kit, variants),
            *draw_carousel(episode, cover, kit, ideas)]


def build(root: Path, episode_id: str, out_dir: Path, images: bool = False,
          variants: bool = False) -> list[Path]:
    """Write the kit for one episode into out_dir/kit and return the files written."""
    episode = load_yaml(root / EPISODES / episode_id / "episode.yaml")
    brand = load_yaml(root / BRAND_CONFIG)
    reach = load_yaml(root / REACH_CONFIG)
    timing = load_json(out_dir / "timing.json")
    kit = out_dir / "kit"
    kit.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    chapter_text: list[str] = []
    durations: dict[str, float] = {}
    for target in all_targets(episode):
        entry = timing["targets"].get(target)
        if entry is None:
            raise InputError(f"{target}: timing.json has no narration for it; render the voice")
        plan = plan_video(episode, target, entry, brand)
        durations[target] = plan.frames / FPS
        text = to_srt(subtitles(episode, target, entry, plan, brand))
        broken = problems(text)
        if broken:
            raise ValueError(f"{target}: the subtitle track breaks its rules: {broken[:3]}")
        path = kit / f"{target}.en.srt"
        path.write_text(text, encoding="utf-8", newline="\n")
        written.append(path)
        if target == LONG:
            chapter_text = chapter_lines(episode, plan)
            if images:
                written += _images(root, episode, plan, brand, kit, variants)
    before, after = _neighbours(episode_id, root)
    data = kit_data(episode, reach, brand, chapter_text, before, after, durations)
    path = kit / "kit.md"
    path.write_text(kit_markdown(data), encoding="utf-8", newline="\n")
    written.append(path)
    path = kit / "kit.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8",
                    newline="\n")
    written.append(path)
    return written


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m channel_os.kit", description=__doc__.split(
        "\n\n")[0])
    parser.add_argument("--episode", required=True)
    parser.add_argument("--out", type=Path, default=None, help="default: out/<episode>")
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--images", action="store_true",
                        help="also draw thumbnails and carousel slides (needs the browser)")
    parser.add_argument("--variants", action="store_true",
                        help="with --images, also write every thumbnail layout to compare")
    args = parser.parse_args(argv)
    out_dir: Path = args.out or args.root / "out" / args.episode
    try:
        written = build(args.root, args.episode, out_dir, args.images, args.variants)
    except (InputError, OSError, KeyError, ValueError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    for path in written:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

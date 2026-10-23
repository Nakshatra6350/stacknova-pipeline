r"""Fill one day of the owner's upload folder with the new-look videos and what to paste.

    .venv\Scripts\python.exe studio/scripts/upload_day.py "Fri 23 Oct" \
        18-30:short:007-p1 20-00:reel:007-p1

Each item is TIME:KIND:ID. A short or reel copies out/release/<id>-<kind>.mp4; a carousel copies
the slides in out/release/<id>/. The texts come from studio/films/<id>/post.yaml. Anything already
in the day folder from the earlier plan is moved, not deleted, to "z Old style, not posted/<day>".
Writes "00 WHAT TO POST.txt" (every file in order, India time, platform, the exact text to paste).
Nothing is posted: the owner posts by hand.

With --plan="New plan" (the reach plan of 22 Oct 2026) the day goes to "StackNova Launch/New plan/
<day>" instead, leaving the first folders as they are, and each item prefers its edited video in
out/release/v2/ (polish.py), its post-v2.yaml texts, its Reel cover (packshots.py) and, for a long
video, the search-first titles and opening paragraph of post-v2.yaml in its kit.
"""

import shutil
import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
LAUNCH = Path.home() / "Desktop" / "StackNova Launch"
RELEASE = ROOT / "out" / "release"
KINDS = {
    "short": "YouTube Short",
    "reel": "Instagram Reel",
    "carousel": "Instagram carousel",
    "long": "YouTube video",
}
PLAN = ""  # --plan=NAME: a separate folder of days with the v2 videos and texts


def post_of(film: str) -> dict[str, Any]:
    films = ROOT / "studio" / "films" / film
    v2 = films / "post-v2.yaml"
    path = v2 if PLAN and v2.exists() else films / "post.yaml"
    loaded: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8"))
    return loaded


def release(name: str) -> Path:
    """out/release/<name>, or its edited version in out/release/v2/ in a plan."""
    v2 = RELEASE / "v2" / name
    return v2 if PLAN and v2.exists() else RELEASE / name


def gift_of(post: dict[str, Any]) -> dict[str, Any] | None:
    """The free pack an Instagram post offers (owner, 23 Oct 2026): `gift: <episode id>` in its
    post-v2.yaml names the episode whose pack.yaml (pack.py) a follower gets for "follow + comment
    KEYWORD". Returns the keyword, the PDF to attach and the texts of the automated DM."""
    if not post.get("gift"):
        return None
    pack = yaml.safe_load((ROOT / "content" / "episodes" / post["gift"] / "pack.yaml")
                          .read_text(encoding="utf-8"))
    kw, title = pack["keyword"], pack["title"]
    return {
        "keyword": kw,
        "pdf": RELEASE / "packs" / f"{pack['file']}.pdf",
        "top": f"💬 Follow @stacknova.dev and comment {kw}: the free {title} pack (PDF) "
               "lands in your DMs.",
        "bottom": f"📩 Comment {kw} for the free PDF. Follow first, so the DM can reach you.",
        "reply": "Sent 📩 Check your DMs!",
        "gate": f"Hey 👋 Your free {title} pack is ready. Follow @stacknova.dev first, "
                "then tap the button below and it's yours.",
        "ask": "Where should we send the next free pack when it drops? Reply with your email 📧 "
               "(only new free packs, never spam; unsubscribe anytime).",
        "send": f"Here's your free {title} pack 📘 The mechanism, the code, interview "
                "questions with answers, and a checklist. Send it to a friend who's preparing 🙌",
    }


def caption_with_gift(caption: str, gift: dict[str, Any] | None) -> str:
    """The caption with the pack's call to action under its first line and above its hashtags."""
    parts = caption.strip().split("\n\n")
    if not gift:
        return "\n\n".join(parts)
    tags = len(parts) - 1 if parts[-1].lstrip().startswith("#") else len(parts)
    return "\n\n".join([parts[0], gift["top"], *parts[1:tags], gift["bottom"], *parts[tags:]])


def pack_files(folder: Path, name: str, gift: dict[str, Any] | None) -> list[str]:
    """Copies the free pack next to the post and returns its AUTO-DM block (nothing without one)."""
    if not gift:
        return []
    pdf = f"{name} - free pack.pdf"
    shutil.copy2(gift["pdf"], folder / pdf)
    return ["", *auto_dm(gift, pdf)]


def auto_dm(gift: dict[str, Any], pdf: str) -> list[str]:
    """What to set in the comment-to-DM tool for this post (once, when posting it)."""
    return [
        "AUTO-DM (set in ReplyKaro when you post this):",
        f"  Keyword in a comment:   {gift['keyword']}",
        f"  Reply under the comment: {gift['reply']}",
        f"  Follow gate (on):        {gift['gate']}",
        f"  Ask for the email:       {gift['ask']}",
        f"  Then send the PDF:       {pdf}",
        f"  with the message:        {gift['send']}",
    ]


def kit_v2(kit: str, post: dict[str, Any]) -> str:
    """The kit with the plan's titles in place of the old ones and its opening paragraph."""
    lines = kit.splitlines()
    if post.get("titles"):
        start = next(i for i, line in enumerate(lines) if line.startswith("TITLE"))
        end = next(i for i in range(start + 1, len(lines)) if not lines[i].startswith("  "))
        lines[start + 1 : end] = [f"  {title}" for title in post["titles"]]
    if post.get("lead"):
        at = lines.index("DESCRIPTION:") + 1
        lines[at] = " ".join(post["lead"].split())
    if post.get("hashtags"):
        # the description's last line was a bare keyword list; hashtags do that job visibly
        tags = next(i for i, line in enumerate(lines) if line.startswith("TAGS ("))
        last = max(i for i in range(tags) if lines[i].strip())
        if lines[last].startswith("- ") or "http" in lines[last]:
            lines[last + 1 : last + 1] = ["", post["hashtags"]]
        else:
            lines[last] = post["hashtags"]
    # the tags people search for and the pinned question, when the plan has its own
    for head, key in (("TAGS (", "tags"), ("PINNED COMMENT:", "pinned")):
        if post.get(key):
            at = next(i for i, line in enumerate(lines) if line.startswith(head)) + 1
            lines[at] = " ".join(post[key].split())
    return "\n".join(lines)


def main(day: str, items: list[str]) -> None:
    folder = LAUNCH / PLAN / day if PLAN else LAUNCH / day
    folder.mkdir(parents=True, exist_ok=True)
    # files this script wrote before are replaced; anything else is the earlier plan's, kept aside
    ours = [
        yaml.safe_load(p.read_text(encoding="utf-8"))["name"]
        for p in (ROOT / "studio" / "films").glob("*/post.yaml")
    ]
    old = []
    for p in folder.iterdir():
        if p.name == "00 WHAT TO POST.txt" or any(name in p.name for name in ours):
            shutil.rmtree(p) if p.is_dir() else p.unlink()
        else:
            old.append(p)
    if old and not PLAN:
        keep = LAUNCH / "z Old style, not posted" / day
        keep.mkdir(parents=True, exist_ok=True)
        for p in old:
            shutil.move(str(p), str(keep / p.name))
        print(f"moved {len(old)} earlier files to {keep}")
    text = [
        f"{day}: what to post. All times are India time (IST).",
        "Short = YouTube.  Reel and carousel = Instagram.",
        "",
    ]
    for number, item in enumerate(items, 1):
        time, kind, film = item.split(":")
        post = post_of(film)
        name = f"{number:02d} {time} {KINDS[kind]} {post['name']}"
        hh, mm = time.split("-")
        text += ["=" * 72, f"{number:02d}.  {hh}:{mm} IST   {KINDS[kind].upper()}"]
        if kind == "long":
            # the video, and beside it a folder with its subtitles, thumbnails and kit
            shutil.copy2(release(f"{film}.mp4"), folder / f"{name}.mp4")
            extras = folder / f"{name} - subtitles and thumbnails"
            shutil.copytree(release(film), extras)
            kit = (extras / "kit.txt").read_text(encoding="utf-8-sig")
            if PLAN:
                kit = kit_v2(kit, post)
                (extras / "kit.txt").write_text(kit, encoding="utf-8-sig")
            text += [f"FILE: {name}.mp4", f"FOLDER: {extras.name}", "", kit.strip()]
        elif kind == "carousel":
            src = release(film)
            dest = folder / name
            shutil.copytree(src, dest)
            slides = sorted(dest.iterdir())
            text += [
                f"FOLDER: {name}",
                "",
                f"UPLOAD: all {len(slides)} slides in this folder, in order "
                f"{slides[0].stem} to {slides[-1].stem}",
                "",
                "CAPTION:",
                caption_with_gift(post["caption"], gift_of(post)),
            ]
            text += pack_files(folder, name, gift_of(post))
        else:
            shutil.copy2(release(f"{film}-{kind}.mp4"), folder / f"{name}.mp4")
            text += [f"FILE: {name}.mp4", ""]
            cover = release(f"{film}-cover.jpg")
            if kind == "reel" and PLAN and cover.exists():
                shutil.copy2(cover, folder / f"{name} - cover.jpg")
                text += [
                    f"COVER: {name} - cover.jpg (Edit cover > Add from camera roll; it is "
                    "what the profile grid shows)",
                    "",
                ]
            if kind == "short":
                text += [
                    "TITLE:",
                    post["title"],
                    "",
                    "DESCRIPTION:",
                    post["description"].strip(),
                    "",
                    "RELATED VIDEO (field under the description): "
                    + post.get("related", "leave empty"),
                ]
                if post.get("tags"):
                    text += ["", "TAGS (Show more > Tags, comma separated):", post["tags"]]
            else:
                text += ["CAPTION:", caption_with_gift(post["caption"], gift_of(post))]
                text += pack_files(folder, name, gift_of(post))
        text.append("")
    out = folder / "00 WHAT TO POST.txt"
    out.write_text("\n".join(text), encoding="utf-8-sig")
    print(out)


if __name__ == "__main__":
    for arg in list(sys.argv):
        if arg.startswith("--plan="):
            PLAN = arg.split("=", 1)[1]
            sys.argv.remove(arg)
    main(sys.argv[1], sys.argv[2:])

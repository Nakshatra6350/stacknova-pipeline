r"""Fill one day of the owner's upload folder with the new-look videos and what to paste.

    .venv\Scripts\python.exe studio/scripts/upload_day.py "Fri 23 Oct" \
        18-30:short:007-p1 20-00:reel:007-p1

Each item is TIME:KIND:ID. A short or reel copies out/release/<id>-<kind>.mp4; a carousel copies
the slides in out/release/<id>/. The texts come from studio/films/<id>/post.yaml. Anything already
in the day folder from the earlier plan is moved, not deleted, to "z Old style, not posted/<day>".
Writes "00 WHAT TO POST.txt" (every file in order, India time, platform, the exact text to paste).
Nothing is posted: the owner posts by hand.
"""

import shutil
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
LAUNCH = Path.home() / "Desktop" / "StackNova Launch"
KINDS = {
    "short": "YouTube Short",
    "reel": "Instagram Reel",
    "carousel": "Instagram carousel",
    "long": "YouTube video",
}


def main(day: str, items: list[str]) -> None:
    folder = LAUNCH / day
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
    if old:
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
        post = yaml.safe_load(
            (ROOT / "studio" / "films" / film / "post.yaml").read_text(encoding="utf-8")
        )
        name = f"{number:02d} {time} {KINDS[kind]} {post['name']}"
        hh, mm = time.split("-")
        text += ["=" * 72, f"{number:02d}.  {hh}:{mm} IST   {KINDS[kind].upper()}"]
        if kind == "long":
            # the video, and beside it a folder with its subtitles, thumbnails and kit
            shutil.copy2(ROOT / "out" / "release" / f"{film}.mp4", folder / f"{name}.mp4")
            extras = folder / f"{name} - subtitles and thumbnails"
            shutil.copytree(ROOT / "out" / "release" / film, extras)
            kit = (extras / "kit.txt").read_text(encoding="utf-8-sig")
            text += [f"FILE: {name}.mp4", f"FOLDER: {extras.name}", "", kit.strip()]
        elif kind == "carousel":
            src = ROOT / "out" / "release" / film
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
                post["caption"].strip(),
            ]
        else:
            src = ROOT / "out" / "release" / f"{film}-{kind}.mp4"
            shutil.copy2(src, folder / f"{name}.mp4")
            text += [f"FILE: {name}.mp4", ""]
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
            else:
                text += ["CAPTION:", post["caption"].strip()]
        text.append("")
    out = folder / "00 WHAT TO POST.txt"
    out.write_text("\n".join(text), encoding="utf-8-sig")
    print(out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])

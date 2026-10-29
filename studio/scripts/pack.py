r"""The free PDF pack of an episode (owner, 23 Oct 2026): what a follower gets in the DM for
"follow + comment KEYWORD" on an Instagram post.

    .venv\Scripts\python.exe studio/scripts/pack.py EPISODE_ID [--style=dark|light]

Reads content/episodes/<id>/pack.yaml and the episode's `sources`, cuts each code excerpt out of the
episode's samples by line range (so the pack always shows the tested code), lays it out with
studio/covers/pack.html and prints out/release/packs/<file>.pdf in A5 pages, sized for reading on a
phone. Fails if any text would be cut off. Nothing is uploaded.
"""

import sys
import textwrap
from pathlib import Path
from typing import Any

import yaml

from channel_os.assemble.thumbnails import fonts
from channel_os.scenes.browser import open_page
from channel_os.scenes.theme import EMBLEM

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "studio" / "covers" / "pack.html"
A5 = (560, 794)  # 148 x 210 mm at 96 dpi


def excerpt(episode: Path, ref: dict[str, Any]) -> dict[str, Any]:
    """The lines a pack points at: {from, lines: [first, last]} from a sample, or inline {code}."""
    if "code" in ref:
        return {"lines": [{"n": None, "text": t} for t in ref["code"].splitlines()]}
    first, last = ref["lines"]
    text = (episode / ref["from"]).read_text(encoding="utf-8").splitlines()[first - 1 : last]
    if len(text) != last - first + 1 or not "".join(text).strip():
        raise SystemExit(f"{ref['from']} has no code at lines {first}-{last}")
    text = textwrap.dedent("\n".join(text)).splitlines()
    return {"file": Path(ref["from"]).name,
            "lines": [{"n": first + i, "text": t} for i, t in enumerate(text)]}


def data(episode_id: str, style: str) -> dict[str, Any]:
    # an episode id (content/episodes/<id>) or, for look v4, a folder such as content/v4/001-last-seat
    folder = ROOT / episode_id if (ROOT / episode_id / "pack.yaml").exists() else ROOT / "content" / "episodes" / episode_id
    pack = yaml.safe_load((folder / "pack.yaml").read_text(encoding="utf-8"))
    episode_file = folder / "episode.yaml"
    episode = yaml.safe_load(episode_file.read_text(encoding="utf-8")) if episode_file.exists() else {}
    for section in pack["sections"]:
        if section["kind"] == "code":
            section["code"] = excerpt(folder, section)
        for rule in section.get("rules", []):
            rule["bug"], rule["fix"] = excerpt(folder, rule["bug"]), excerpt(folder, rule["fix"])
        # listings inside text blocks, cards and the blocks after a section (look v4 guides)
        for block in [*section.get("blocks", []), *section.get("after", []), *section.get("items", [])]:
            if isinstance(block, dict) and ("from" in block or "code" in block):
                block["listing"] = excerpt(folder, block)
    sources = [*episode.get("sources", []), *pack.get("extra_sources", [])]
    return {**pack, "style": style, "sources": sources, "tag": f"{pack['keyword']} PACK",
            "emblem": EMBLEM.as_uri(), "fonts": fonts()}


def build(episode_id: str, style: str = "dark", preview: Path | None = None) -> Path:
    """Prints the PDF; with `preview`, also saves each page as page-NN.png there to look at."""
    d = data(episode_id, style)
    name = d["file"] if style == "dark" else f"{d['file']}-{style}"
    out = ROOT / "out" / "release" / "packs" / f"{name}.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open_page(TEMPLATE, *A5) as page:
        laid = page.evaluate("d => window.draw(d)", d)
        if laid["overflow"]:
            raise SystemExit("text would be cut off: " + "; ".join(laid["overflow"]))
        page.pdf(path=str(out), prefer_css_page_size=True, print_background=True)
        if preview:
            preview.mkdir(parents=True, exist_ok=True)
            boxes = page.evaluate(
                "() => [...document.querySelectorAll('.page')].map((p) => {"
                " const r = p.getBoundingClientRect();"
                " return {x: r.x, y: r.y + scrollY, width: r.width, height: r.height}; })")
            for n, box in enumerate(boxes, 1):
                page.screenshot(path=str(preview / f"page-{n:02d}.png"), full_page=True, clip=box)
    print(out, f"{laid['pages']} pages")
    return out


if __name__ == "__main__":
    opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--"))
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    build(args[0], opts.get("style", "dark"), Path(opts["preview"]) if "preview" in opts else None)

"""Colour themes and fonts for scenes, read from config/themes.yaml (M2).

Scene code never names a colour or a font; it asks the theme. Which theme an asset gets is a
rotation over the configured list unless episode.yaml names one, because the owner wants a
mixture across videos and Shorts.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

import yaml

_SHORT = re.compile(r"^short-(\d+)$")


@dataclass(frozen=True)
class Theme:
    name: str
    bg: str
    surface: str
    line: str
    strong: str
    ink: str
    muted: str
    accent: str
    soft: str
    packet: str
    reply: str
    retry: str
    ok: str
    bad: str


@dataclass(frozen=True)
class Themes:
    rotation: tuple[str, ...]
    themes: Mapping[str, Theme]
    mono: str
    sans: str
    display: str


def load_themes(path: Path) -> Themes:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    themes = {name: Theme(name=name, **colours) for name, colours in raw["themes"].items()}
    rotation = tuple(raw["rotation"])
    missing = [name for name in rotation if name not in themes]
    if missing:
        raise ValueError(f"rotation names unknown theme(s): {', '.join(missing)}")
    return Themes(rotation=rotation, themes=themes, **raw["fonts"])


def pick_theme(
    themes: Themes, episode_id: str, target: str, override: str | None = None
) -> Theme:
    """The theme for one asset: the named one, else the rotation by episode and target."""
    if override is not None:
        if override not in themes.themes:
            known = ", ".join(sorted(themes.themes))
            raise ValueError(f"unknown theme {override!r}; config/themes.yaml has: {known}")
        return themes.themes[override]
    number = int(episode_id.split("-", 1)[0])
    short = _SHORT.match(target)
    index = number - 1 + (int(short.group(1)) if short else 0)
    return themes.themes[themes.rotation[index % len(themes.rotation)]]

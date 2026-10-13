"""Colour themes and fonts for scenes, read from config/themes.yaml (M2, look v2).

The page never names a colour; it uses CSS variables and the theme supplies them. Which theme
an asset gets is a rotation over the configured list unless episode.yaml names one, because the
owner wants the looks alternated across videos and Shorts.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

import yaml

_SHORT = re.compile(r"^short-(\d+)$")
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
# Every theme must define these; the stylesheet uses each of them.
COLOURS = (
    "stage", "stage2", "panel", "panel2", "line", "ink", "muted", "dim", "code",
    "client", "a", "b", "c", "d", "ok", "err", "retry", "jk", "js", "jn",
)
# The bundled faces: (family, weight, file in assets/fonts). Text is drawn only in these.
FACES = (
    ("Inter Display", 800, "InterDisplay-ExtraBold.ttf"),
    ("Inter", 400, "Inter-Regular.ttf"),
    ("Inter", 500, "Inter-Medium.ttf"),
    ("Inter", 600, "Inter-SemiBold.ttf"),
    ("Inter", 700, "Inter-Bold.ttf"),
    ("JetBrains Mono", 400, "JetBrainsMono-Regular.ttf"),
    ("JetBrains Mono", 700, "JetBrainsMono-Bold.ttf"),
)


@dataclass(frozen=True)
class Theme:
    name: str
    colours: Mapping[str, str]

    def css(self) -> dict[str, str]:
        """The theme as CSS custom properties."""
        return {f"--{key}": value for key, value in self.colours.items()}


@dataclass(frozen=True)
class Themes:
    rotation: tuple[str, ...]
    themes: Mapping[str, Theme]
    mono: str
    sans: str
    display: str


def load_themes(path: Path) -> Themes:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    themes: dict[str, Theme] = {}
    for name, colours in raw["themes"].items():
        missing = [key for key in COLOURS if key not in colours]
        bad = [key for key, value in colours.items() if not _HEX.match(str(value))]
        if missing or bad:
            raise ValueError(
                f"theme {name!r}: missing {', '.join(missing) or 'nothing'}; "
                f"not a #rrggbb colour: {', '.join(bad) or 'nothing'}"
            )
        themes[name] = Theme(name, {key: str(colours[key]) for key in COLOURS})
    rotation = tuple(raw["rotation"])
    unknown = [name for name in rotation if name not in themes]
    if unknown:
        raise ValueError(f"rotation names unknown theme(s): {', '.join(unknown)}")
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

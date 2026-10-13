"""Themes come from config/themes.yaml and rotate across assets unless one is named."""

from pathlib import Path
from typing import Any

import pytest

from channel_os.scenes.theme import COLOURS, FACES, load_themes, pick_theme


@pytest.fixture
def themes(repo_root: Path) -> Any:
    return load_themes(repo_root / "config" / "themes.yaml")


def test_both_looks_load_with_every_colour(themes: Any) -> None:
    assert themes.rotation == ("control", "nova")
    for name in themes.rotation:
        theme = themes.themes[name]
        assert theme.name == name
        assert tuple(theme.colours) == COLOURS
        # The page takes a theme as CSS variables and names no colour of its own.
        assert theme.css()["--stage"] == theme.colours["stage"]
        assert len(theme.css()) == len(COLOURS)


def test_the_two_looks_differ(themes: Any) -> None:
    control, nova = (themes.themes[name].colours for name in ("control", "nova"))
    assert control["stage"] != nova["stage"]
    assert control["a"] != nova["a"]


def test_fonts_are_the_brand_families(themes: Any, repo_root: Path) -> None:
    assert (themes.mono, themes.sans, themes.display) == (
        "JetBrains Mono",
        "Inter",
        "Inter Display",
    )
    # Every face the page loads is a file in the repo, so no machine draws a fallback.
    for family, _, name in FACES:
        assert family in (themes.mono, themes.sans, themes.display)
        assert (repo_root / "assets" / "fonts" / name).is_file(), name


def test_neighbouring_assets_get_different_themes(themes: Any) -> None:
    picked = [pick_theme(themes, "001-idempotency", t).name for t in ("long", "short-1", "short-2")]
    assert picked == ["control", "nova", "control"]
    assert pick_theme(themes, "002-outbox-pattern", "long").name == "nova"


def test_a_named_theme_wins(themes: Any) -> None:
    assert pick_theme(themes, "001-idempotency", "long", override="nova").name == "nova"


def test_an_unknown_theme_is_rejected(themes: Any) -> None:
    with pytest.raises(ValueError, match="unknown theme"):
        pick_theme(themes, "001-idempotency", "long", override="sunset")


def test_a_theme_missing_a_colour_does_not_load(tmp_path: Path, repo_root: Path) -> None:
    text = (repo_root / "config" / "themes.yaml").read_text(encoding="utf-8")
    broken = tmp_path / "themes.yaml"
    broken.write_text(text.replace("retry:", "retri:", 1), encoding="utf-8")
    with pytest.raises(ValueError, match="missing retry"):
        load_themes(broken)

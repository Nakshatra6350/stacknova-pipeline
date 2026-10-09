"""Themes come from config/themes.yaml and rotate across assets unless one is named."""

import re
from dataclasses import fields
from pathlib import Path
from typing import Any

import pytest

from channel_os.scenes.theme import Theme, load_themes, pick_theme

HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


@pytest.fixture
def themes(repo_root: Path) -> Any:
    return load_themes(repo_root / "config" / "themes.yaml")


def test_both_themes_load_with_every_colour(themes: Any) -> None:
    assert themes.rotation == ("brand", "navy")
    for name in themes.rotation:
        theme = themes.themes[name]
        assert theme.name == name
        for field in fields(Theme):
            if field.name != "name":
                assert HEX.match(getattr(theme, field.name)), f"{name}.{field.name}"


def test_fonts_are_the_brand_families(themes: Any) -> None:
    assert (themes.mono, themes.sans, themes.display) == (
        "JetBrains Mono",
        "Inter",
        "Inter Display",
    )


def test_neighbouring_assets_get_different_themes(themes: Any) -> None:
    picked = [pick_theme(themes, "001-idempotency", t).name for t in ("long", "short-1", "short-2")]
    assert picked == ["brand", "navy", "brand"]
    assert pick_theme(themes, "002-outbox-pattern", "long").name == "navy"


def test_a_named_theme_wins(themes: Any) -> None:
    assert pick_theme(themes, "001-idempotency", "long", override="navy").name == "navy"


def test_an_unknown_theme_is_rejected(themes: Any) -> None:
    with pytest.raises(ValueError, match="unknown theme"):
        pick_theme(themes, "001-idempotency", "long", override="sunset")

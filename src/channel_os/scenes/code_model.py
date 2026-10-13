"""The code stage without drawing: a short listing, its tokens and what its steps may say (M2).

Listings are written for the screen: a handful of short lines, original to the episode. The
page draws them (`scenes/web/code.js`) with the tokens found here, and lays them out with CSS.
"""

import re
from collections.abc import Mapping, Sequence
from typing import Any

from channel_os.scenes.vocabulary import STATUSES

ACTIONS = frozenset({"show", "highlight", "note", "focus"})
MAX_LINES = 10
MAX_CHARS = 60  # a longer line would have to shrink too far to stay readable in portrait
COMMENT = {"sql": "--", "go": "//", "java": "//", "js": "//", "python": "#", "text": None}
# Words coloured as keywords, per language. A listing shows a few of them, not a grammar.
_WORDS = {
    "sql": (
        "select insert into values update set delete from where and or not null on conflict "
        "do nothing returning create table primary key unique begin commit rollback as join "
        "left order by limit default constraint if exists for"
    ),
    "go": (
        "func return if else for range var const type struct interface package import defer "
        "go switch case default nil err map chan select break continue true false"
    ),
    "java": (
        "class interface record public private protected static final void return if else "
        "for while new try catch finally throw throws null true false var import package this"
    ),
    "js": (
        "const let var function return if else for while async await new try catch finally "
        "throw null undefined true false import export from class this"
    ),
    "python": (
        "def return if elif else for while in not and or with as try except finally raise "
        "None True False import from class lambda async await pass"
    ),
    "text": "",
}
KEYWORDS = {language: frozenset(words.split(" ")) - {""} for language, words in _WORDS.items()}
_STRING = r"'[^']*'|\"[^\"]*\"|`[^`]*`"
_NUMBER = r"\$\d+|\b\d+(?:\.\d+)?\b"
_WORD = r"[A-Za-z_][A-Za-z_0-9]*"


def tokens(line: str, language: str) -> list[tuple[int, int, str]]:
    """Coloured stretches of a line as (start, end, kind): comment, string, number, keyword."""
    marker = COMMENT[language]
    parts = [f"(?P<string>{_STRING})", f"(?P<number>{_NUMBER})", f"(?P<word>{_WORD})"]
    if marker:
        parts.insert(0, f"(?P<comment>{re.escape(marker)}.*$)")
    keywords = KEYWORDS[language]
    found: list[tuple[int, int, str]] = []
    for match in re.finditer("|".join(parts), line):
        kind = match.lastgroup or ""
        if kind == "word":
            word = match.group().lower() if language == "sql" else match.group()
            if word not in keywords:
                continue
            kind = "keyword"
        found.append((match.start(), match.end(), kind))
    return found


def line_range(target: str, count: int) -> range:
    """`3`, `2-4` or `all` as zero-based line indexes. Raises ValueError when out of range."""
    if target == "all":
        return range(count)
    first, _, last = target.partition("-")
    start, end = int(first), int(last or first)
    if not 1 <= start <= end <= count:
        raise ValueError(f"lines {target!r} are not within 1-{count}")
    return range(start - 1, end)


def problems(decl: Mapping[str, Any], steps: Sequence[Mapping[str, Any]]) -> list[str]:
    """Everything wrong with a code declaration and its steps. Empty means drawable."""
    found: list[str] = []
    lines = decl.get("lines", [])
    if not 1 <= len(lines) <= MAX_LINES:
        found.append(f"a listing has 1 to {MAX_LINES} lines, not {len(lines)}")
    for number, line in enumerate(lines, start=1):
        if len(str(line)) > MAX_CHARS:
            found.append(f"line {number} has {len(str(line))} characters; {MAX_CHARS} fit")
    language = decl.get("language", "text")
    if language not in KEYWORDS:
        found.append(f"unknown language {language!r}; use {', '.join(sorted(KEYWORDS))}")
    if found:
        return found
    for index, step in enumerate(steps):
        action, target = step["action"], step["target"]
        params = step.get("params") or {}
        issue: str | None = None
        if action not in ACTIONS:
            issue = f"action {action!r} is not one the code stage knows"
        elif "status" in params and params["status"] not in STATUSES:
            issue = f"status {params['status']!r} is not one of {', '.join(STATUSES)}"
        elif action == "focus" and target != "all":
            issue = f"focus targets 'all', not {target!r}"
        elif action == "note" and not params.get("text"):
            issue = "note needs params.text"
        else:
            try:
                line_range(target, len(lines))
            except ValueError as exc:
                issue = str(exc) if "within" in str(exc) else f"{target!r} is not a line range"
        if issue:
            found.append(f"step {index + 1} ({action} at {step['at']!r}): {issue}")
    return found

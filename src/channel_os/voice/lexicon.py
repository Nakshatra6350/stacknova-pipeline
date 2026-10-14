"""How words are written for the voice model, when it reads the written form wrong (M1).

The model learns pronunciation from spelling, so some words come out wrong: "retry" as
"re-tree", the HTTP method "PUT" as "putt". `config/pronunciation.yaml` lists a spelling that
it reads correctly for each, or several to try in turn. Only the text sent to the model
changes: scripts, captions and the timing of visuals keep the written form.
"""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


def _spellings(spoken: str | Sequence[str]) -> tuple[str, ...]:
    return (spoken,) if isinstance(spoken, str) else tuple(spoken)


def _pattern(written: str) -> re.Pattern[str]:
    exact = written != written.lower()
    return re.compile(rf"(?<![\w-]){re.escape(written)}(?![\w-])", 0 if exact else re.IGNORECASE)


@dataclass(frozen=True)
class Lexicon:
    # Written form -> the form the model reads, or several such forms, the best one first.
    say: Mapping[str, str | Sequence[str]] = field(default_factory=dict)
    terms: tuple[str, ...] = ()  # jargon speech recognition cannot spell (see voice/listen.py)

    def respell(self, text: str, turn: int = 0) -> str:
        """`text` as it should be sent to the voice model.

        A key in lowercase matches the word in any casing, and a capitalised word stays
        capitalised. A key with a capital in it matches only as written, so `PUT` (the HTTP
        method) is respelled and the verb "put" is left alone. `turn` picks among a word's
        spellings: 0 is the first, and a reading that is done again takes the next one.
        """
        for written, spoken in self.say.items():
            exact = written != written.lower()
            choices = _spellings(spoken)
            choice = choices[turn % len(choices)]

            def replace(found: re.Match[str], choice: str = choice, exact: bool = exact) -> str:
                keep_capital = not exact and found.group()[0].isupper()
                return choice[0].upper() + choice[1:] if keep_capital else choice

            text = _pattern(written).sub(replace, text)
        return text

    def spellings(self, text: str) -> int:
        """How many different ways `text` can be written for the voice."""
        return max((len(_spellings(spoken)) for written, spoken in self.say.items()
                    if _pattern(written).search(text)), default=1)


def load_lexicon(path: Path) -> Lexicon:
    """Read config/pronunciation.yaml. A missing file is an empty lexicon."""
    if not path.is_file():
        return Lexicon()
    raw: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    say = raw.get("say") or {}
    terms = raw.get("terms") or []
    for written, spoken in say.items():
        choices = [spoken] if isinstance(spoken, str) else spoken
        if not isinstance(written, str) or not isinstance(choices, list) or not choices or not all(
            isinstance(choice, str) and choice.strip() for choice in choices
        ):
            raise ValueError(f"{path.name}: `say` maps a written word to how to write it for "
                             f"the voice, and {written!r}: {spoken!r} is not that")
    if not all(isinstance(term, str) for term in terms):
        raise ValueError(f"{path.name}: `terms` is a list of words")
    return Lexicon({written: _spellings(spoken) for written, spoken in say.items()}, tuple(terms))

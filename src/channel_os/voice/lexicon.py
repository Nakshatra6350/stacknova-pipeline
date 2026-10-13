"""How words are written for the voice model, when it reads the written form wrong (M1).

The model learns pronunciation from spelling, so some words come out wrong: "retry" as
"re-tree", the HTTP method "PUT" as "putt". `config/pronunciation.yaml` lists a spelling that
it reads correctly for each. Only the text sent to the model changes: scripts, captions and
the timing of visuals keep the written form.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True)
class Lexicon:
    say: Mapping[str, str] = field(default_factory=dict)  # written form -> form the model reads
    terms: tuple[str, ...] = ()  # jargon speech recognition cannot spell (see voice/listen.py)

    def respell(self, text: str) -> str:
        """`text` as it should be sent to the voice model.

        A key in lowercase matches the word in any casing, and a capitalised word stays
        capitalised. A key with a capital in it matches only as written, so `PUT` (the HTTP
        method) is respelled and the verb "put" is left alone.
        """
        for written, spoken in self.say.items():
            exact = written != written.lower()
            pattern = re.compile(rf"(?<![\w-]){re.escape(written)}(?![\w-])",
                                 0 if exact else re.IGNORECASE)

            def replace(found: re.Match[str], spoken: str = spoken, exact: bool = exact) -> str:
                keep_capital = not exact and found.group()[0].isupper()
                return spoken[0].upper() + spoken[1:] if keep_capital else spoken

            text = pattern.sub(replace, text)
        return text


def load_lexicon(path: Path) -> Lexicon:
    """Read config/pronunciation.yaml. A missing file is an empty lexicon."""
    if not path.is_file():
        return Lexicon()
    raw: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    say = raw.get("say") or {}
    terms = raw.get("terms") or []
    for written, spoken in say.items():
        if not isinstance(written, str) or not isinstance(spoken, str) or not spoken.strip():
            raise ValueError(f"{path.name}: `say` maps a written word to how to write it for "
                             f"the voice, and {written!r}: {spoken!r} is not that")
    if not all(isinstance(term, str) for term in terms):
        raise ValueError(f"{path.name}: `terms` is a list of words")
    return Lexicon(dict(say), tuple(terms))

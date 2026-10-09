"""Pack narration into chunks small enough for one model call."""

import re

_SENTENCE_END = re.compile(r"""(?:(?<=[.!?])|(?<=[.!?]["')]))\s+""")
_CLAUSE_END = re.compile(r"(?<=[,;:])\s+")


def _split_long(sentence: str, max_chars: int) -> list[str]:
    """Break one over-long sentence at clause boundaries, then between words."""
    pieces: list[str] = []
    for clause in _CLAUSE_END.split(sentence):
        if len(clause) <= max_chars:
            pieces.append(clause)
            continue
        current = ""
        for word in clause.split():
            candidate = f"{current} {word}".strip()
            if current and len(candidate) > max_chars:
                pieces.append(current)
                current = word
            else:
                current = candidate
        if current:
            pieces.append(current)
    return pieces


def chunk_text(text: str, max_chars: int) -> list[str]:
    """Pack whole sentences into chunks of at most max_chars characters, keeping every word."""
    units: list[str] = []
    for sentence in _SENTENCE_END.split(" ".join(text.split())):
        if not sentence:
            continue
        units.extend([sentence] if len(sentence) <= max_chars else _split_long(sentence, max_chars))
    chunks: list[str] = []
    for unit in units:
        if chunks and len(chunks[-1]) + 1 + len(unit) <= max_chars:
            chunks[-1] = f"{chunks[-1]} {unit}"
        else:
            chunks.append(unit)
    return chunks

"""Words every stage shares: what a message can be, and what state a thing can be in (M2)."""

ROLES = ("request", "reply", "retry", "error")
STATUSES = ("ok", "bad", "info")


def edge(target: str) -> tuple[str, str] | None:
    """`from->to` as (from, to), or None when the target is not written that way."""
    source, arrow, destination = target.partition("->")
    return (source.strip(), destination.strip()) if arrow else None

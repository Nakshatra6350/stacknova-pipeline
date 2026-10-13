"""The cards, fan-in, sequence and code stages on the page, asked what is on screen.

Like tests/test_page.py: the real page in a headless browser (the scenes dependency group),
read through the DOM.
"""

from pathlib import Path
from typing import Any

import pytest
import yaml

pytest.importorskip("playwright.sync_api", reason="needs the scenes dependency group")

from channel_os.scenes import browser
from channel_os.scenes.formats import LANDSCAPE, PORTRAIT, Format
from channel_os.scenes.plan import plan_video
from channel_os.scenes.preview import clip_data
from channel_os.scenes.theme import load_themes

Data = dict[str, Any]
ROOT = Path(__file__).resolve().parents[1]
SCRIPT = "You tapped Pay and got an error. So you tapped again. The fix is one key per payment."


def at(seconds: float, action: str, target: str, **params: Any) -> Data:
    """A step at an exact time: `start` plus a delay."""
    return {"at": "start", "action": action, "target": target,
            "params": {"delay": seconds, **params}}


CARDS: Data = {
    "layout": "cards",
    "header": ["IDEMPOTENT?", "DO IT TWICE"],
    "title": "twice is the same as once",
    "joins": ["+", "="],
    "cards": [
        {"id": "set", "title": "SET email = x",
         "lines": [{"id": "v", "key": "email", "value": "old"}]},
        {"id": "add", "title": "balance += 100",
         "lines": [{"id": "v", "key": "balance", "value": "$0"}]},
        {"id": "sum", "title": "the result", "text": "what you end with", "hidden": True},
    ],
    "steps": [
        at(1.0, "apply", "add", line="v", value="$100"),
        at(1.6, "apply", "add", line="v", value="$200", status="bad", role="retry"),
        at(2.0, "set", "set.v", value="x", status="ok"),
        at(2.5, "mark", "add", status="bad"),
        at(3.0, "badge", "add", text="NOT IDEMPOTENT", status="bad"),
        at(3.5, "show", "sum"),
        at(4.2, "dim", "set"),
        at(5.0, "focus", "all"),
    ],
}
FANIN: Data = {
    "layout": "fanin",
    "header": ["WHO RETRIES?", "EVERYONE"],
    "sources": [{"id": "http", "label": "HTTP client"}, {"id": "user", "label": "the user"},
                {"id": "queue", "label": "message queue"}],
    "target": {"id": "api", "label": "your service", "title": "api"},
    "counter": "copies of one request",
    "steps": [
        at(0.5, "tag", "api", text="never retry?"),
        at(1.0, "fire", "http"),
        at(2.0, "fire", "user", role="retry"),
        at(3.0, "badge", "api", text="AT-LEAST-ONCE", status="info"),
        at(3.5, "highlight", "queue"),
    ],
}
SEQUENCE: Data = {
    "layout": "sequence",
    "header": ["THE RACE", "CHECK, THEN CHARGE"],
    "actors": [{"id": "r1", "label": "request #1", "kind": "client"},
               {"id": "db", "label": "keys table", "kind": "store"},
               {"id": "r2", "label": "the retry", "kind": "client"}],
    "steps": [
        at(1.0, "message", "r1->db", text="seen 7f3c?"),
        at(2.0, "message", "db->r1", text="no", role="reply"),
        at(3.0, "note", "r1", text="charge $100", status="bad"),
        at(3.0, "note", "r2", text="charge $100", status="bad", same_row=True),
        at(4.0, "divider", "all", text="later"),
        at(4.5, "badge", "db", text="TWO CHARGES", status="bad"),
    ],
}
CODE: Data = {
    "layout": "code",
    "header": ["THE FIX", "LET THE DATABASE DECIDE"],
    "title": "claim_key.sql",
    "language": "sql",
    "reveal": True,
    "lines": ["INSERT INTO keys (key, status)", "VALUES ($1, 'in_progress')",
              "ON CONFLICT (key) DO NOTHING;", "-- 0 rows means someone else has it"],
    "steps": [
        at(1.0, "show", "1-2"),
        at(2.0, "highlight", "2"),
        at(2.5, "note", "2", text="the first INSERT wins the key", status="ok"),
        at(3.0, "show", "3-4"),
        at(4.0, "focus", "all"),
    ],
}
VISUALS = {"cards": CARDS, "fanin": FANIN, "sequence": SEQUENCE, "code": CODE}
# A sum of three cards with lines and verdicts is too tall for a phone screen, and the page
# says so. Four cards two by two is how a Short compares things.
GRID: Data = {
    "layout": "cards",
    "title": "which of these is safe to retry?",
    "cards": [{"id": name.lower(), "title": name,
               "lines": [{"id": "v", "key": "result", "value": "?"}]}
              for name in ("GET", "PUT", "DELETE", "POST")],
    "steps": [at(1.0, "mark", "get", status="ok"), at(2.0, "apply", "post", line="v", value="2"),
              at(3.0, "badge", "post", text="+ IDEMPOTENCY KEY", status="info")],
}


@pytest.fixture(scope="module")
def brand() -> Data:
    loaded: Data = yaml.safe_load((ROOT / "config" / "brand.yaml").read_text("utf-8"))
    loaded["video"]["transition"] = "none"  # these tests read settled scenes
    return loaded


@pytest.fixture(scope="module")
def theme() -> Any:
    return load_themes(ROOT / "config" / "themes.yaml").themes["control"]


def clip(brand: Data, visual: Data) -> Any:
    episode = {"id": "001-test", "segments": [],
               "shorts": [{"id": "short-1", "source": "standalone", "script": SCRIPT,
                           "visual": visual, "hook_on_screen": "This retry charged you twice"}]}
    entry = {"duration": 8.0,
             "segments": [{"id": "short-1", "start": 0.0, "duration": 8.0, "pauses": []}]}
    (planned,) = plan_video(episode, "short-1", entry, brand).clips
    return planned


def seen(brand: Data, theme: Any, visual: Data, times: dict[str, float], script: str,
         fmt: Format = LANDSCAPE) -> Data:
    return browser.probe(clip_data(clip(brand, visual), fmt, theme), fmt, times, script)


HELPERS = r"""
  const $ = id => document.getElementById(id);
  const text = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const number = value => value === '' ? 1 : parseFloat(value);
"""


@pytest.mark.parametrize("fmt", [LANDSCAPE, PORTRAIT], ids=lambda fmt: fmt.name)
@pytest.mark.parametrize("layout", sorted(VISUALS))
def test_every_stage_fits_both_formats(brand: Data, theme: Any, layout: str, fmt: Format) -> None:
    # Opening a clip runs the page's own checks: the content area, and nothing spilling out of
    # its box at any moment of the story.
    visual = GRID if (layout, fmt) == ("cards", PORTRAIT) else VISUALS[layout]
    found = seen(brand, theme, visual, {"late": 6.0},
                 "document.querySelectorAll('[data-in]').length", fmt)
    assert found["late"] >= 2


def test_a_scene_too_tall_for_a_phone_is_refused(brand: Data, theme: Any) -> None:
    with pytest.raises(browser.SceneError, match="leaves the portrait content area"):
        seen(brand, theme, CARDS, {"late": 6.0}, "1", PORTRAIT)


def test_cards_change_as_operations_are_applied(brand: Data, theme: Any) -> None:
    script = f"""(() => {{ {HELPERS}
      const card = id => ({{ text: text($('c-' + id)), opacity: number($('c-' + id).style.opacity),
                             value: text($('c-' + id).querySelector('.cl .v')) }});
      return {{ set: card('set'), add: card('add'), sum: card('sum'),
                joins: all('.join').map(el => number(el.style.opacity)),
                head: text(document.querySelector('.shead')) }};
    }})()"""
    times = {"start": 0.0, "landing": 1.1, "applied": 1.4, "twice": 2.2, "marked": 3.3,
             "shown": 4.1, "dimmed": 4.8, "back": 5.6}
    view = seen(brand, theme, CARDS, times, script)
    assert view["start"]["head"] == "IDEMPOTENT? · DO IT TWICE twice is the same as once"
    # A value changes a beat after the operation lands on the card.
    assert view["start"]["add"]["value"] == "$0" and view["landing"]["add"]["value"] == "$0"
    assert view["applied"]["add"]["value"] == "$100" and "×1" in view["applied"]["add"]["text"]
    assert view["twice"]["add"]["value"] == "$200" and "×2" in view["twice"]["add"]["text"]
    assert view["twice"]["set"]["value"] == "x"
    marked = view["marked"]["add"]["text"]
    assert "✗" in marked and "NOT IDEMPOTENT" in marked
    # A hidden card, and the join before it, are not there until it is shown.
    assert view["start"]["sum"]["opacity"] == 0 and view["start"]["joins"] == [1, 0]
    assert view["shown"]["sum"]["opacity"] == 1 and view["shown"]["joins"] == [1, 1]
    assert view["dimmed"]["set"]["opacity"] < 0.4 and view["dimmed"]["add"]["opacity"] == 1
    assert view["back"]["set"]["opacity"] == 1


def test_a_fan_in_counts_what_arrives(brand: Data, theme: Any) -> None:
    script = f"""(() => {{ {HELPERS}
      const box = el => el.getBoundingClientRect();
      return {{ count: text(document.querySelector('.tgt .num')), target: text($('tgt')),
                packets: all('.pkt').map(el => ({{ shown: !el.hidden, x: parseFloat(el.style.left),
                                                  text: text(el) }})),
                from: box($('s-http')).right, to: box($('tgt')).left,
                hot: all('.src.hot').map(el => el.id), wires: all('.wires line').length }};
    }})()"""
    times = {"start": 0.0, "flying": 1.35, "landed": 1.9, "second": 2.9, "stamped": 3.3,
             "lit": 3.9}
    view = seen(brand, theme, FANIN, times, script)
    assert view["start"]["count"] == "0" and view["start"]["wires"] == 3
    flying = view["flying"]["packets"][0]
    assert flying["shown"] and view["flying"]["from"] < flying["x"] < view["flying"]["to"]
    assert view["flying"]["count"] == "0", "it counts on arrival, not on sending"
    assert view["landed"]["count"] == "1" and not view["landed"]["packets"][0]["shown"]
    assert view["second"]["count"] == "2"
    assert view["flying"]["packets"][0]["text"] == "request"
    assert "never retry?" in view["landed"]["target"]
    assert "COPIES OF ONE REQUEST" in view["landed"]["target"]
    assert "AT-LEAST-ONCE" in view["stamped"]["target"]
    assert "AT-LEAST-ONCE" not in view["second"]["target"]
    assert view["lit"]["hot"] == ["s-queue"]


def test_a_sequence_draws_its_messages_row_by_row(brand: Data, theme: Any) -> None:
    script = f"""(() => {{ {HELPERS}
      const mid = el => {{ const r = el.getBoundingClientRect(); return (r.left + r.right) / 2; }};
      return {{ messages: all('.msg').map(el => ({{ width: parseFloat(el.style.width),
                                                   top: parseFloat(el.style.top),
                                                   back: el.classList.contains('rtl'),
                                                   dashed: el.classList.contains('reply') }})),
                labels: all('.mt').map(text), notes: all('.nt2').map(el => ({{ text: text(el),
                  top: parseFloat(el.style.top) }})),
                rule: text(document.querySelector('.rt')),
                actors: Object.fromEntries(all('.actor').map(el => [el.id, text(el)])),
                span: Math.abs(mid($('a-db')) - mid($('a-r1'))), lives: all('.life').length }};
    }})()"""
    times = {"start": 0.5, "drawing": 1.15, "drawn": 1.8, "reply": 2.8, "notes": 3.6,
             "end": 5.2}
    view = seen(brand, theme, SEQUENCE, times, script)
    assert view["start"]["messages"] == [] and view["start"]["lives"] == 3
    assert 0 < view["drawing"]["messages"][0]["width"] < view["drawing"]["span"]
    first = view["drawn"]["messages"][0]
    assert first["width"] == pytest.approx(view["drawn"]["span"], abs=1)
    assert not first["back"] and not first["dashed"]
    reply = view["reply"]["messages"][1]
    assert reply["back"] and reply["dashed"] and reply["top"] > first["top"]
    assert view["reply"]["labels"] == ["seen 7f3c?", "no"]
    # Two notes that share a row sit at the same height, below the reply.
    one, two = view["notes"]["notes"]
    assert one["text"] == two["text"] == "charge $100" and one["top"] == two["top"] > reply["top"]
    assert view["end"]["rule"] == "LATER"
    assert view["start"]["actors"]["a-db"] == "keys table STORE"
    assert view["end"]["actors"]["a-db"] == "keys table TWO CHARGES"


def test_a_listing_is_shown_lit_and_explained_line_by_line(brand: Data, theme: Any) -> None:
    script = f"""(() => {{ {HELPERS}
      return {{ lines: all('.ln').map(el => ({{ opacity: number(el.style.opacity),
                                               on: el.classList.contains('on'),
                                               pinned: !!el.querySelector('.pin') }})),
                code: all('.ln code').map(el => el.textContent),
                keywords: all('.ln .tk-keyword').map(el => el.textContent),
                strings: all('.ln .tk-string').map(el => el.textContent),
                comments: all('.ln .tk-comment').map(el => el.textContent),
                tab: text(document.querySelector('.codewin .ph')),
                note: text($('callout')), noted: number($('callout').style.opacity) }};
    }})()"""
    times = {"start": 0.5, "two": 1.8, "lit": 2.4, "noted": 2.9, "four": 3.8, "all": 4.6}
    view = seen(brand, theme, CODE, times, script)
    assert view["start"]["tab"] == "claim_key.sql SQL"
    assert [line["opacity"] for line in view["start"]["lines"]] == [0, 0, 0, 0]
    assert [line["opacity"] for line in view["two"]["lines"]] == [1, 1, 0, 0]
    assert view["two"]["code"] == CODE["lines"]
    # The page colours a listing with the validator's tokens.
    assert view["two"]["keywords"][:4] == ["INSERT", "INTO", "key", "VALUES"]
    assert view["two"]["strings"] == ["'in_progress'"]
    assert view["two"]["comments"] == ["-- 0 rows means someone else has it"]
    lit = view["lit"]["lines"]
    assert [line["on"] for line in lit] == [False, True, False, False]
    assert lit[0]["opacity"] < 0.5 and lit[1]["opacity"] == 1, "the other lines go quiet"
    assert view["lit"]["noted"] == 0
    assert view["noted"]["note"] == "LINE 2 the first INSERT wins the key"
    assert view["noted"]["lines"][1]["pinned"] and view["noted"]["noted"] > 0.9
    assert [line["opacity"] for line in view["all"]["lines"]] == [1, 1, 1, 1]
    assert not any(line["on"] for line in view["all"]["lines"])

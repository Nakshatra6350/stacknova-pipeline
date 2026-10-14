"""The page that draws scenes, asked what is on screen at chosen moments.

These open the real page in a headless browser (the scenes dependency group) and read the DOM,
which says what a viewer would see without comparing pixels.
"""

import json
import subprocess
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
WIRE = {"title": "Create payment", "method": "POST", "path": "/v1/payments",
        "headers": {"Content-Type": "application/json", "Idempotency-Key": "7f3c-91ab"},
        "body": {"amount": 100, "currency": "USD"}}


def at(seconds: float, action: str, target: str, **params: Any) -> Data:
    """A step at an exact time: `start` plus a delay."""
    return {"at": "start", "action": action, "target": target,
            "params": {"delay": seconds, **params}}


VISUAL: Data = {
    "layout": "console",
    "phone": {"title": "Checkout", "total": "$100.00", "method": "Visa 4242"},
    "systems": [
        {"id": "api", "name": "API server", "idle": "listening"},
        {"id": "store", "name": "Key store"},
        {"id": "gateway", "name": "Payment gateway"},
    ],
    "panels": [
        {"id": "keys", "kind": "table", "title": "idempotency_keys",
         "columns": ["key", "status"], "unique": "key", "lane": "store"},
        {"id": "charges", "kind": "list", "title": "charges", "unit": "charged",
         "empty": "No money has moved.", "lane": "gateway"},
    ],
    "steps": [
        at(0.3, "tap", "phone"),
        at(0.5, "send", "phone->gateway", label="POST /payments", wire=WIRE),
        at(1.0, "log", "api", text="POST /payments"),
        at(2.0, "item", "charges", text="#1 pay_A19", value="$100.00"),
        at(2.5, "send", "gateway->phone", label="201 Created", role="reply", lost=0.5,
           response={"status": "201 Created", "body": {"id": "pay_A19"}}),
        at(4.0, "screen", "phone", state="error", text="Try again.", attempt="no reply"),
        at(4.3, "row", "keys", key="7f3c", cells=["in_progress"], status="info"),
        at(4.5, "row", "keys", key="7f3c", cells=["completed"], status="ok"),
        at(4.7, "row", "keys", key="7f3c", cells=["completed"], conflict=True,
           message="key already claimed"),
        at(5.0, "stamp", "charges", text="CHARGED ONCE", status="ok"),
        # A step may wait at most 5 s after its phrase, so this one hangs on a later phrase:
        # "The fix" is spoken 54/85 of the way through 12 s, at about 7.6 s.
        {"at": "The fix", "action": "highlight", "target": "phone"},
    ],
}

# What a viewer would see, read from the DOM after window.render(t). Text is innerText, so it
# is as displayed: labels styled in capitals read in capitals.
STATE = r"""(() => {
  const $ = id => document.getElementById(id);
  const text = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
  const shown = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
  const box = el => {
    const r = el.getBoundingClientRect();
    return [r.left, r.top, r.right, r.bottom].map(Math.round);
  };
  const style = el => getComputedStyle(el);
  const nodes = [...document.querySelectorAll('.node')];
  const bar = $('capt') && $('capt').parentElement;
  return {
    packets: [...document.querySelectorAll('.pkt')].map(el => ({
      shown: !el.hidden, x: parseFloat(el.style.left), text: text(el),
      dead: el.classList.contains('dead'),
    })),
    centre: Object.fromEntries(nodes.map(el => [el.id, (box(el)[0] + box(el)[2]) / 2])),
    names: Object.fromEntries(nodes.map(el => [el.id, style(el.querySelector('.nt')).color])),
    logs: Object.fromEntries(nodes.map(el => [el.id, text(el.querySelector('.lg'))])),
    phone: shown(document.querySelector('.phone')) ? text($('scr')) : null,
    phoneLit: !!document.querySelector('.phone.hot, #n-phone.hot'),
    wire: text($('wire')),
    items: [...document.querySelectorAll('#p-charges .chg')].map(text),
    stamp: text(document.querySelector('#p-charges .stamp')),
    keys: text($('p-keys')),
    rows: [...document.querySelectorAll('#p-keys table.t tr')].slice(1).map(text),
    visible: ['wire', 'p-keys', 'p-charges'].filter(id => shown($(id))),
    caption: $('capt') ? $('capt').innerHTML : null,
    bar: bar ? {
      text: box($('capt')), align: style(bar).textAlign, justify: style(bar).justifyContent,
      parts: bar.children.length,
    } : null,
    cta: [...document.querySelectorAll('#cta .b')].map(text),
    third: $('third') ? {
      opacity: parseFloat($('third').style.opacity), text: text($('third')), box: box($('third')),
    } : null,
    progress: parseFloat($('prog').style.width),
    stage: getComputedStyle(document.body).getPropertyValue('--stage').trim(),
    faces: [...document.fonts].filter(face => face.status === 'loaded').length,
  };
})()"""

# The first packet flies from 0.55 s to 1.65 s; the reply leaves at 2.55 s and dies at 3.65 s.
TIMES = {"start": 0.0, "flying": 1.05, "arrived": 1.7, "charged": 2.2, "lost": 3.7,
         "error": 4.2, "pending": 4.4, "done": 4.6, "conflict": 4.9, "stamped": 5.6,
         "pointed": 8.2, "end": 11.9}


def rgb(colour: str) -> str:
    return "rgb({}, {}, {})".format(*(int(colour[i:i + 2], 16) for i in (1, 3, 5)))


@pytest.fixture(scope="module")
def brand() -> Data:
    loaded: Data = yaml.safe_load((ROOT / "config" / "brand.yaml").read_text("utf-8"))
    return loaded


@pytest.fixture(scope="module")
def themes() -> Any:
    return load_themes(ROOT / "config" / "themes.yaml")


def short_clip(brand: Data, visual: Data = VISUAL) -> Any:
    episode = {"id": "001-test", "segments": [],
               "shorts": [{"id": "short-1", "source": "standalone", "script": SCRIPT,
                           "visual": visual, "hook_on_screen": "This retry charged you twice"}]}
    entry = {"duration": 12.0,
             "segments": [{"id": "short-1", "start": 0.0, "duration": 12.0, "pauses": []}]}
    (clip,) = plan_video(episode, "short-1", entry, brand).clips
    return clip


def long_plan(brand: Data) -> Any:
    """A long video of two 12 s segments: the hook, the logo, the welcome line (3 s), the second
    segment, the outro."""
    segments = [{"id": unit, "title": title, "narration": SCRIPT, "emphasis": ["one key"],
                 "visual": VISUAL}
                for unit, title in (("s01", "The double charge"), ("s02", "The fix"))]
    episode = {"id": "001-test", "segments": segments, "shorts": [],
               "packaging": {"titles": ["Why Your Payment Got Charged Twice"]},
               "next": {"title": "The Outbox Pattern", "teaser": "Two writes, one transaction."}}
    entry = {"duration": 27.0,
             "segments": [{"id": unit, "start": start, "duration": length, "pauses": []}
                          for unit, start, length in (("s01", 0.0, 12.0), ("welcome", 12.0, 3.0),
                                                      ("s02", 15.0, 12.0))]}
    return plan_video(episode, "long", entry, brand)


def seen(clip: Any, fmt: Format, theme: Any) -> Data:
    return browser.probe(clip_data(clip, fmt, theme), fmt, TIMES, STATE)


@pytest.fixture(scope="module")
def wide(brand: Data, themes: Any) -> Data:
    """The second segment of a long video, in landscape, at each moment of TIMES."""
    return seen(long_plan(brand).clips[3], LANDSCAPE, themes.themes["control"])


@pytest.fixture(scope="module")
def tall(brand: Data, themes: Any) -> Data:
    """A Short, in portrait, at each moment of TIMES."""
    return seen(short_clip(brand), PORTRAIT, themes.themes["nova"])


# ---- the story on screen ----------------------------------------------------------------------


def test_the_page_draws_in_the_bundled_faces_and_the_theme_it_is_given(
    wide: Data, tall: Data, themes: Any
) -> None:
    assert wide["start"]["faces"] == 7
    assert wide["start"]["stage"] == themes.themes["control"].colours["stage"]
    assert tall["start"]["stage"] == themes.themes["nova"].colours["stage"]


def test_each_system_is_drawn_in_its_own_colour(wide: Data, themes: Any) -> None:
    colours = themes.themes["control"].colours
    # The third system once fell back to white: its colour is the theme's `c`, and the page
    # used a variable of the same name for "this element's colour".
    assert wide["start"]["names"] == {
        "n-api": rgb(colours["a"]), "n-store": rgb(colours["b"]), "n-gateway": rgb(colours["c"]),
    }


def test_a_packet_carries_its_label_from_sender_to_receiver(wide: Data) -> None:
    assert not wide["start"]["packets"][0]["shown"]
    flying, arrived = wide["flying"]["packets"][0], wide["arrived"]["packets"][0]
    assert flying["shown"] and flying["text"] == "POST /payments"
    assert flying["x"] < arrived["x"]
    assert arrived["x"] == pytest.approx(wide["start"]["centre"]["n-gateway"], abs=2)
    assert not wide["charged"]["packets"][0]["shown"]


def test_a_lost_reply_stops_on_the_way_and_says_so(wide: Data) -> None:
    lost = wide["lost"]["packets"][1]
    assert lost["shown"] and lost["dead"] and lost["text"] == "✕ lost"
    assert lost["x"] < wide["start"]["centre"]["n-gateway"] - 100
    assert not wide["pending"]["packets"][1]["shown"]
    assert "never reached Client" in wide["lost"]["wire"]


def test_the_phone_follows_the_taps(wide: Data) -> None:
    assert "Pay $100.00" in wide["start"]["phone"]
    assert "Attempt" not in wide["start"]["phone"]
    busy, failed = wide["flying"]["phone"], wide["error"]["phone"]
    assert "Processing" in busy and "Attempt 1" in busy and "sending…" in busy
    assert "Something went wrong" in failed and "Try again." in failed
    assert "no reply" in failed and "Processing" not in failed


def test_the_wire_shows_the_request_and_then_the_response(wide: Data) -> None:
    assert wide["start"]["wire"] == "ON THE WIRE Nothing has been sent yet."
    arrived = wide["arrived"]["wire"]
    assert "Client → API server → Key store → Payment gateway" in arrived
    assert "Create payment POST /v1/payments" in arrived
    assert "Idempotency-Key 7f3c-91ab" in arrived
    assert '"amount": 100' in arrived and "waiting…" in arrived
    assert "201 Created" in wide["lost"]["wire"] and '"id": "pay_A19"' in wide["lost"]["wire"]


def test_a_list_grows_and_takes_a_stamp(wide: Data) -> None:
    assert wide["arrived"]["items"] == []
    assert wide["charged"]["items"] == ["#1 pay_A19 $100.00"]
    assert wide["conflict"]["stamp"] is None
    assert wide["stamped"]["stamp"] == "CHARGED ONCE"


def test_a_table_row_changes_in_place_and_refuses_a_second_insert(wide: Data) -> None:
    assert wide["error"]["rows"] == []
    assert wide["pending"]["rows"] == ["7f3c in_progress"]
    assert wide["done"]["rows"] == ["7f3c completed"]
    assert wide["conflict"]["rows"] == ["7f3c completed"]
    assert "1 row" in wide["conflict"]["keys"]
    assert "key already claimed" in wide["conflict"]["keys"]
    assert "key already claimed" not in wide["done"]["keys"]


def test_a_highlight_on_the_phone_shows_in_both_formats(wide: Data, tall: Data) -> None:
    # The phone itself in landscape, the card that stands in for it in portrait.
    for view in (wide, tall):
        assert view["pointed"]["phoneLit"]
        assert not view["stamped"]["phoneLit"] and not view["end"]["phoneLit"]
    # The real phone glows only when a step points at it, not each time a packet leaves it:
    # its screen already shows that. The card lights up with its packets, as every card does.
    assert not wide["flying"]["phoneLit"]
    assert tall["flying"]["phoneLit"]


def test_logs_show_what_each_system_last_did(wide: Data) -> None:
    assert wide["start"]["logs"]["n-api"] == "› listening"
    assert wide["arrived"]["logs"]["n-api"] == "› POST /payments"


def test_a_long_video_shows_the_whole_room(wide: Data) -> None:
    for moment in TIMES:
        assert wide[moment]["visible"] == ["wire", "p-keys", "p-charges"]
    assert wide["end"]["cta"] == []


# ---- what the planner puts around the story ---------------------------------------------------


def test_captions_are_centred_and_carry_no_step_number(wide: Data, tall: Data) -> None:
    # The owner's request of 12 October 2026: captions in the middle, no step counter.
    for view, frame in ((wide, 1920), (tall, 1080)):
        bar = view["flying"]["bar"]
        assert (bar["align"], bar["justify"], bar["parts"]) == ("center", "center", 1)
        left, _, right, _ = bar["text"]
        assert (left + right) / 2 == pytest.approx(frame / 2, abs=3)
    assert wide["start"]["caption"] == "You tapped Pay and got an error."
    assert wide["end"]["caption"] == "The fix is <b>one key</b> per payment."
    assert tall["end"]["caption"] == "The fix is one key per payment."


def test_a_short_keeps_its_caption_in_the_middle_band(tall: Data) -> None:
    # docs/CAPTIONS_SPEC.md: captions sit near y=1180, clear of the scene above (to y=1040)
    # and of the platform's buttons below (from y=1440).
    _, top, _, bottom = tall["flying"]["bar"]["text"]
    assert top >= 1040 and bottom <= 1300
    assert (top + bottom) / 2 == pytest.approx(1180, abs=30)


# ---- transitions ------------------------------------------------------------------------------

MOVES_STATE = r"""(() => {
  const $ = id => document.getElementById(id), scene = $('scene'), veil = $('veil');
  const blocks = [...document.querySelectorAll('[data-in]')].filter(el => el.offsetParent);
  const number = value => value === '' ? 1 : parseFloat(value);
  return {
    scene: { opacity: number(scene.style.opacity), transform: scene.style.transform,
             filter: scene.style.filter },
    blocks: blocks.map(el => number(el.style.opacity)),
    light: $('stage').style.filter,
    title: number($('partt').style.opacity),
    veil: veil.hidden ? null : { width: parseFloat(veil.style.width),
                                 height: parseFloat(veil.style.height), black: veil.className },
  };
})()"""
LAST = 12.0 - 1 / 30  # the last frame of a 12 s clip
MOMENTS = {"first": 0.0, "arriving": 0.2, "settled": 2.0, "last": LAST}


def moving(brand: Data, style: str) -> Data:
    return {**brand, "video": {**brand["video"], "transition": style}}


def test_a_scene_arrives_block_by_block_and_slides_away(brand: Data, themes: Any) -> None:
    # The second segment of a long video: it follows the logo and is followed by the outro,
    # so it also comes up from black and goes back to it.
    clip = long_plan(moving(brand, "slide")).clips[3]
    view = browser.probe(clip_data(clip, LANDSCAPE, themes.themes["control"]), LANDSCAPE,
                         MOMENTS, MOVES_STATE)
    assert set(view["first"]["blocks"]) == {0} and view["first"]["light"] == "brightness(0)"
    assert view["first"]["title"] == 0
    arriving = view["arriving"]["blocks"]
    assert arriving == sorted(arriving, reverse=True) and arriving[0] > arriving[-1]
    settled = view["settled"]
    assert set(settled["blocks"]) == {1} and settled["light"] == "" and settled["title"] == 1
    assert settled["scene"] == {"opacity": 1, "transform": "", "filter": ""}
    last = view["last"]
    assert last["scene"]["opacity"] == 0 and last["scene"]["transform"] == "translateX(-130px)"
    assert last["light"] == "brightness(0)" and last["title"] == 0
    assert all(moment["veil"] is None for moment in view.values())


def test_a_short_is_whole_on_its_first_and_last_frame(brand: Data, themes: Any) -> None:
    visual = [VISUAL, {**VISUAL, "from": "The fix",
                       "steps": [{"at": "one key", "action": "tap", "target": "phone"}]}]
    episode = {"id": "001-test", "segments": [],
               "shorts": [{"id": "short-1", "source": "standalone", "script": SCRIPT,
                           "visual": visual, "hook_on_screen": "This retry charged you twice"}]}
    entry = {"duration": 12.0,
             "segments": [{"id": "short-1", "start": 0.0, "duration": 12.0, "pauses": []}]}
    first, second = plan_video(episode, "short-1", entry, moving(brand, "slide")).clips
    theme = themes.themes["nova"]
    opening = browser.probe(clip_data(first, PORTRAIT, theme), PORTRAIT,
                            {"first": 0.0, "last": first.frames / 30 - 1 / 30}, MOVES_STATE)
    assert set(opening["first"]["blocks"]) == {1} and opening["first"]["scene"]["opacity"] == 1
    assert opening["last"]["scene"]["opacity"] == 0 and opening["last"]["light"] == ""
    closing = browser.probe(clip_data(second, PORTRAIT, theme), PORTRAIT,
                            {"first": 0.0, "last": second.frames / 30 - 1 / 30}, MOVES_STATE)
    assert set(closing["first"]["blocks"]) == {0}
    # It ends as a whole picture, so the loop back to frame 1 is clean.
    assert set(closing["last"]["blocks"]) == {1} and closing["last"]["scene"]["opacity"] == 1


def test_a_scene_can_arrive_in_one_style_and_leave_in_another(brand: Data, themes: Any) -> None:
    # The owner asked for the three styles mixed, so the two ends of a scene often differ.
    data = clip_data(long_plan(moving(brand, "slide")).clips[3], LANDSCAPE,
                     themes.themes["control"])
    data["chrome"].update(enter="scene", enter_style="wipe", exit="scene", exit_style="zoom",
                          from_black=False, to_black=False)
    view = browser.probe(data, LANDSCAPE, MOMENTS, MOVES_STATE)
    assert view["first"]["veil"]["width"] == 1920 and view["first"]["veil"]["height"] < 1080
    assert view["first"]["scene"]["transform"] == "" and set(view["first"]["blocks"]) == {1}
    assert view["settled"]["veil"] is None
    assert view["settled"]["scene"] == {"opacity": 1, "transform": "", "filter": ""}
    assert view["last"]["veil"] is None
    assert view["last"]["scene"]["transform"] == "scale(1.07)"
    assert view["last"]["scene"]["opacity"] == 0


def test_the_wipe_covers_the_frame_and_the_zoom_dissolves_the_scene(
    brand: Data, themes: Any
) -> None:
    theme = themes.themes["control"]
    wipe = browser.probe(clip_data(long_plan(moving(brand, "wipe")).clips[3], LANDSCAPE, theme),
                         LANDSCAPE, MOMENTS, MOVES_STATE)
    # A change of segment is wiped across the whole frame, in black next to a brand scene.
    assert wipe["first"]["veil"] == {"width": 1920, "height": 1080, "black": "veil back black"}
    assert wipe["settled"]["veil"] is None
    assert wipe["last"]["veil"] == {"width": 1920, "height": 1080, "black": "veil black"}
    assert wipe["first"]["light"] == "" and set(wipe["first"]["blocks"]) == {1}
    zoom = browser.probe(clip_data(long_plan(moving(brand, "zoom")).clips[3], LANDSCAPE, theme),
                         LANDSCAPE, MOMENTS, MOVES_STATE)
    assert zoom["first"]["scene"]["transform"] == "scale(0.93)"
    assert zoom["first"]["scene"]["opacity"] == 0 and "blur" in zoom["first"]["scene"]["filter"]
    assert zoom["settled"]["scene"] == {"opacity": 1, "transform": "", "filter": ""}
    assert zoom["last"]["scene"]["transform"] == "scale(1.07)"


def test_a_short_shows_one_panel_at_a_time_and_no_phone(tall: Data) -> None:
    # The panel on screen is the one the story last touched.
    assert tall["arrived"]["visible"] == ["wire"]
    assert tall["charged"]["visible"] == ["p-charges"]
    assert tall["lost"]["visible"] == ["wire"]
    assert tall["done"]["visible"] == ["p-keys"]
    assert tall["stamped"]["visible"] == ["p-charges"]
    assert tall["start"]["phone"] is None
    # The phone's card says in a few words what its screen would show.
    assert tall["start"]["logs"]["n-phone"] == "› ready to pay"
    assert tall["flying"]["logs"]["n-phone"] == "› sending…"
    assert tall["error"]["logs"]["n-phone"] == "› ✕ no reply"


def test_a_short_ends_by_asking_for_the_subscribe(tall: Data) -> None:
    # The owner's words: "like, comment, share, subscribe". The last word comes from
    # config/brand.yaml, so the Reel cut of a Short can say Follow.
    assert tall["stamped"]["cta"] == []
    assert tall["end"]["cta"] == ["Like", "Comment", "Share", "Subscribe"]


def test_the_instagram_handle_slides_in_and_out_again(wide: Data, brand: Data) -> None:
    # The planner put it 0.5 s to 5.5 s into this scene (see test_plan).
    handle = brand["handles"]["confirmed"]["instagram"]
    assert wide["start"]["third"]["opacity"] == 0
    assert wide["charged"]["third"]["opacity"] == pytest.approx(1.0)
    assert wide["charged"]["third"]["text"] == f"FOLLOW ON INSTAGRAM {handle}"
    assert wide["charged"]["third"]["box"][2] <= 1920
    assert wide["end"]["third"]["opacity"] == 0


def test_the_progress_bar_moves_with_the_video(wide: Data, tall: Data) -> None:
    assert tall["start"]["progress"] == 0
    assert tall["end"]["progress"] == pytest.approx(100, abs=1.5)
    assert 0 < wide["start"]["progress"] < wide["end"]["progress"] < 100


# ---- the brand scenes -------------------------------------------------------------------------

BRAND_STATE = r"""(() => {
  const $ = id => document.getElementById(id);
  const text = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
  return {
    light: $('stage').style.filter,
    emblem: $('em') ? parseFloat($('em').style.opacity) : null,
    word: text(document.querySelector('.word')),
    tagline: text($('tt')),
    asks: [...document.querySelectorAll('.act')].map(el => ({
      text: text(el), on: el.classList.contains('on'), opacity: parseFloat(el.style.opacity),
    })),
    next: text($('next')),
    page: text($('stage')),
  };
})()"""


def test_the_intro_raises_the_logo_and_fades_to_black(brand: Data, themes: Any) -> None:
    intro = long_plan(brand).clips[1]
    assert intro.unit == "intro"
    times = {"first": 0.0, "lit": 3.0, "last": intro.frames / 30 - 0.05}
    view = browser.probe(clip_data(intro, LANDSCAPE, themes.themes["control"]), LANDSCAPE,
                         times, BRAND_STATE)
    assert view["first"]["light"] == "brightness(0)" and view["first"]["emblem"] == 0
    assert view["lit"]["light"] == "brightness(1)" and view["lit"]["emblem"] == 1
    assert view["lit"]["word"] == "StackNova"
    assert view["lit"]["tagline"] == "LIGHT UP YOUR WHOLE STACK."
    assert view["last"]["light"] == "brightness(0)"


def test_the_welcome_line_follows_the_logo_in_and_out_of_black(brand: Data, themes: Any) -> None:
    # The owner's choice, 14 October 2026: a welcome line in every long video, after the logo.
    welcome = long_plan(brand).clips[2]
    assert welcome.unit == "welcome" and welcome.spec.layout == "brand"
    times = {"first": 0.0, "lit": 1.5, "last": welcome.frames / 30 - 0.05}
    view = browser.probe(clip_data(welcome, LANDSCAPE, themes.themes["control"]), LANDSCAPE,
                         times, BRAND_STATE)
    assert view["first"]["light"] == "brightness(0)"
    assert view["lit"]["light"] == "brightness(1)"
    assert view["lit"]["page"] == brand["video"]["welcome"]["text"]
    assert view["last"]["light"] == "brightness(0)"


def test_the_outro_asks_one_thing_at_a_time_and_ends_on_instagram(
    brand: Data, themes: Any
) -> None:
    outro = long_plan(brand).clips[-1]
    view = browser.probe(clip_data(outro, LANDSCAPE, themes.themes["nova"]), LANDSCAPE,
                         {"comment": 1.5, "subscribe": 5.6, "instagram": 9.5}, BRAND_STATE)
    handles = brand["handles"]["confirmed"]
    asks = view["instagram"]["asks"]
    for ask, opening in zip(asks, ["Got a question?", "Did this help?", "Subscribe", "Share it",
                                   handles["instagram"]], strict=True):
        assert ask["text"].startswith(opening)
        assert ask["opacity"] == 1
    assert handles["youtube"] in asks[2]["text"]
    assert [ask["on"] for ask in view["comment"]["asks"]] == [True, False, False, False, False]
    assert [ask["on"] for ask in view["subscribe"]["asks"]] == [False, False, True, False, False]
    assert asks[4]["on"]
    assert view["comment"]["next"] == "The Outbox Pattern"
    assert "Thanks for watching." in view["comment"]["page"]
    # Phase 1 is content only: the outro sells nothing and links nowhere.
    assert "http" not in view["instagram"]["page"] and "$" not in view["instagram"]["page"]


# ---- what the page refuses to draw ------------------------------------------------------------


def test_a_panel_with_more_in_it_than_fits_stops_the_render(brand: Data, themes: Any) -> None:
    crowded = {**VISUAL, "steps": [at(0.2 * n, "item", "charges", text=f"#{n} charge")
                                   for n in range(1, 16)]}
    data = clip_data(short_clip(brand, crowded), LANDSCAPE, themes.themes["control"])
    with pytest.raises(browser.SceneError, match="p-charges has more in it than fits at"):
        browser.probe(data, LANDSCAPE, {"start": 0.0}, "1")


def test_a_caption_too_long_for_its_bar_stops_the_render(brand: Data, themes: Any) -> None:
    data = clip_data(short_clip(brand), PORTRAIT, themes.themes["control"])
    data["chrome"]["captions"] = [[0.0, "one key per payment " * 12]]
    with pytest.raises(browser.SceneError, match=r"the caption at 0\.0 s does not fit its bar"):
        browser.probe(data, PORTRAIT, {"start": 0.0}, "1")


def test_a_layout_the_page_cannot_draw_stops_the_render(brand: Data, themes: Any) -> None:
    data = clip_data(short_clip(brand), PORTRAIT, themes.themes["control"])
    data["stage"] = "hologram"
    with pytest.raises(browser.SceneError, match='no stage draws layout "hologram" yet'):
        browser.probe(data, PORTRAIT, {"start": 0.0}, "1")


# ---- frames -----------------------------------------------------------------------------------


def test_a_clip_is_rendered_to_exactly_the_frames_asked_for(
    brand: Data, themes: Any, tmp_path: Path
) -> None:
    data = clip_data(short_clip(brand), PORTRAIT, themes.themes["nova"])
    clip = browser.render_clip(data, PORTRAIT, 7, tmp_path / "clips" / "000.mp4", quality=0.25)
    assert browser.count_frames(clip) == 7
    probed = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=codec_name,width,height,pix_fmt,r_frame_rate,color_range,color_space",
         "-of", "json", str(clip)],
        capture_output=True, text=True, check=True,
    )
    (stream,) = json.loads(probed.stdout)["streams"]
    # Limited-range BT.709 is what players and YouTube expect; a screenshot is full-range, and
    # left that way it plays washed out or too dark depending on the player.
    wanted = {"codec_name": "h264", "width": 270, "height": 480, "pix_fmt": "yuv420p",
              "r_frame_rate": "30/1", "color_range": "tv", "color_space": "bt709"}
    assert {key: stream[key] for key in wanted} == wanted

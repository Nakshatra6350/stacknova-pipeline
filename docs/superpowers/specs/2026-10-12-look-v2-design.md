# Look v2 — design

Date: 12 October 2026. Extends M2 (scenes). Supersedes the drawing layer described in
`2026-10-09-m2-scenes-design.md`; the timing, planning, validation and render-command parts of
that design stand.

## Why

After watching all of episode 001 in the first M2 look (thin-rail schematics drawn with Manim),
the owner sent a reference film and said the current animation and colours were "5/10 in front
of this ... this is the level I want to achieve". The reference is a dense "control room": a real
phone UI, systems as coloured cards that glow when active, labelled packets, the actual request
and response typed out, live state panels, a caption bar. It is HTML and CSS driven by one
`render(time)` function. A sample in that style with our content (`out/look-v2/`, not in git) was
shown and the owner decided:

1. Two looks, alternated across videos: **control room** (neutral dark stage, one colour per
   system) and **nova night** (brand violet, pink, gold).
2. Scenes are drawn as **HTML in a headless browser**, not Manim.
3. Long videos: **the hook first, always, then the logo intro**.
4. The outro has **no voice**; it has soothing background music.
5. Intro sound and outro music: the owner picks from options (original, synthesised here).
6. The M2 branch is merged only after this is in and approved.

Also asked for: the Instagram handle shown mid-video on long videos; an outro asking for
comments, likes, subscribe, share and an Instagram follow; a like/comment/share/follow prompt on
Shorts.

## What stays, what goes

| Stays | Goes |
|---|---|
| `episode.yaml` `visual` blocks with steps tied to spoken phrases | Manim, PyAV, the Pango font work-arounds |
| `phrases.py`, `spec.py`, `plan.py`, `theme.py`, `formats.py` | `kit.py`, `stage.py`, `render.py` (Manim harness) |
| each stage's `<name>_model.py` (what a declaration may say) | each stage's Manim drawing module and its pixel layout maths |
| `python -m channel_os.render --stage scenes`, `render.yml`, `ci.yml` jobs | the `flow` stage, replaced by `console` |
| one process per clip, `--jobs` | the private label-cache copies (no label cache any more) |

## Architecture

```
episode.yaml ──spec.py/plan.py──▶ clips: [{stage, decl, steps(timed), frames, captions, chrome}]
                                      │  JSON
                                      ▼
src/channel_os/scenes/web/    index.html + stage.css + runtime.js + one module per stage
   window.render(t)  ◀── every property on screen is a function of t (as before)
                                      │  screenshot per frame (Playwright → Chromium)
                                      ▼
scenes/browser.py  ──frames──▶ ffmpeg ──▶ clip.mp4 ──preview.py──▶ preview/<target>.mp4
```

- **`scenes/web/`** holds the page. `runtime.js` has the shared pieces (easing, typed text, JSON
  colouring, packets, the chrome); each stage is one module exporting `build(spec)` and
  `render(t)`. This is the one place the project uses JavaScript: the animation has to run where
  the layout engine is. It stays small, has no dependencies and no build step.
- **`scenes/browser.py`** opens the page with the clip's JSON, asks for each frame's time, takes
  a screenshot and pipes it to ffmpeg. The frame count is checked afterwards, as now. The browser
  is the installed Chrome or Edge (`channel`), falling back to Playwright's Chromium.
- **Python keeps the judgement**: phrase timing, clip planning, validation, themes, formats.
  The page is given finished numbers; it never reads YAML or audio.
- **Fonts** are the bundled Inter and JetBrains Mono through `@font-face`. A missing face cannot
  be silently replaced: the page waits for `document.fonts` and the harness fails if a declared
  face did not load.
- **Safe area**: after building a scene the harness measures every element marked `data-safe`
  and fails the render if one leaves the format's content area (the rule M2 already had).

## Stages

| Stage | Draws | Status |
|---|---|---|
| `console` | The control room: systems row, labelled packets, optional phone with an app screen, a wire panel (request/response), state panels (table, list), stamps | new, replaces `flow` |
| `sequence` | Actors and lifelines, messages over time | re-skinned |
| `cards` | Compared panels, tallies, a + b = c | re-skinned |
| `fanin` | Many senders, one receiver, a count | re-skinned |
| `code` | A listing with reveal, highlight, note | re-skinned |
| `brand` | Intro, outro (not written in episodes; added by the planner) | new |

**Landscape** carries the full control room. **Portrait** keeps to y 260-1040 and shows the
systems row plus one panel at a time (the stage picks the panel each step touches), because the
dense layout cannot be read on a phone.

### `console` in episode.yaml

```yaml
- layout: console
  systems:
    - {id: api, name: "API server", sub: "POST /v1/payments"}
    - {id: store, name: "Key store", sub: "PostgreSQL · idempotency_keys"}
    - {id: gateway, name: "Payment gateway", sub: "moves the money"}
  phone: {app: checkout, total: "$100.00", items: [["Headphones", "$89.00"], ["Shipping", "$11.00"]]}
  panels:
    - {id: keys, kind: table, title: idempotency_keys, columns: [key, status, response], unique: key}
    - {id: charges, kind: list, title: "gateway · charges"}
  steps:
    - {at: "one random ID", action: tap, target: phone}
    - {at: "one random ID", action: send, target: "phone->api", params: {label: "POST /payments · key 7f3c",
        wire: {method: POST, path: /v1/payments, headers: {Idempotency-Key: 7f3c-91ab-4e02}, body: {amount: 100, currency: USD}}}}
    - {at: "The server stores", action: row, target: keys, params: {key: "7f3c…", cells: [in_progress, "—"]}}
```

Actions: `tap`, `send` (label, role, lost, back, wire), `reply` (status, body, lost), `log`,
`row` (insert or change in place), `item`, `stamp`, `screen` (phone state), `note`, `highlight`.
`docs/VISUAL_DSL.md` is rewritten as the reference.

## Chrome and brand moments

Added by the planner from `config/brand.yaml`; episodes do not write them.

- **Top bar** (all formats): emblem, part n of N, segment title, episode pill.
- **Captions** (all formats): the sentence being spoken, centred, with the segment's `emphasis`
  words coloured and no step counter (the owner's request, 12 October 2026). Times come from the
  phrase anchors. On a long video they sit in a bar under the scene. On a Short they are bare
  text in the middle band `docs/CAPTIONS_SPEC.md` reserves (near y=1180), in shorter pieces;
  that is a stand-in for the word-by-word captions burned in later, and the planner stops
  sending it once those exist. A caption that does not fit its bar fails the render.
- **Progress bar**: the whole video, in the brand gradient.
- **Instagram handle** (long videos): a lower third, twice, at about 35% and 70% of the content.
  One that would fall in the hook, or be cut short by a scene change, waits for the next scene
  with room for it; if no scene has room it is left out.
- **Intro** (long videos): the first segment plays (the hook), then a 4.3 s logo scene, then the
  rest. Narration is cut at the start of the second segment. The intro has no sound yet: two
  rounds of synthesised stings were rejected, so the owner will pick a licensed one. It goes in
  the private repo (`brand/intro.wav` or `brand/intro.mp3`), the render workflow fetches it like
  the voice reference, and `--intro-sound` lays it under the logo.
- **Outro** (long videos): 12 s, no voice, the chosen music; comment, like, subscribe, share,
  Instagram, and a frame for YouTube's next-video element. The next episode's title comes from a
  new optional `next: {title, teaser}` in `episode.yaml`.
- **Shorts prompt**: like, comment, share, follow over the last 3 s. No intro and no end card on
  Shorts (`docs/REACH_PLAYBOOK.md`: no logo intro, endings loop).
- **Sound**: the outro's music (`lofi-nod`, the owner's pick) is generated at render time by
  `brand/sound.py` from sine waves and noise, so nothing licensed enters the repo and nothing
  can be claimed on YouTube. A brand sound longer than its scene fades out; it is never cut.

Nothing here sells or links to anything (Phase 1).

## Themes

`config/themes.yaml` is rewritten: `control` and `nova`, each with stage, panel, line, ink, a
colour per system slot (client, a, b, c, d), status colours and code colours. The rotation rule
is unchanged: long video of episode n gets `rotation[(n-1) mod k]`, Short j gets
`rotation[(n-1+j) mod k]`.

## Testing

- Pure tests as now (models, planning, timing).
- Stage tests open the page in the browser and ask the DOM, not pixels: at time t, is this
  packet on screen and where, does this table row say `completed`, is this system `hot`, is every
  `data-safe` element inside the content area. Faster and sharper than brightness checks.
- One render test per stage checks the frame count of a real clip.
- CI installs Playwright and uses the runner's Chrome.
- The page itself refuses what it cannot draw well, and the render fails with the reason: a
  `data-safe` element outside the content area, a panel whose content does not fit at some
  moment of the story, a caption too long for its bar, a layout with no stage.
- Clips are encoded as limited-range BT.709 (screenshots are full-range), so colours play the
  same in a player and on YouTube.

## Order of work

1. **Engine + `console` + brand scenes**: `short-1` and the opening of the long video (hook,
   intro, next segment) render through the real pipeline in both looks. Owner looks.
   *Built on 12 October 2026.* Segments s01 and s02 and `short-1` of episode 001 are written
   as `console` scenes; the other segments still name the old layouts, which validate but
   cannot be drawn until step 2.
2. **The other four stages**, episode 001 rewritten, workflow and CI updated, acceptance run on
   GitHub. Owner approves; `m2-scenes` and this work merge together.

## Acceptance

- [ ] `preview/long.mp4` (1920x1080, 30 fps): hook, intro (with the owner's sound once chosen),
      the remaining segments, outro with music; handle shown twice; centred captions throughout.
- [ ] The five Shorts (1080x1920) with the follow prompt, no intro.
- [ ] Frame count equals narration plus intro and outro, exactly.
- [ ] Both looks used, per the rotation.
- [ ] Nothing outside the content area in either format.
- [ ] `pytest`, `ruff`, `mypy` pass; CI green; rendered on GitHub.
- [ ] The owner approves the look.

## Out of scope

Word-by-word captions on Shorts, the hook card, thumbnails, final cuts and encoding (M3).

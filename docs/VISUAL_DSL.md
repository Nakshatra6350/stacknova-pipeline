# Visual DSL — how an episode describes its animation

Every narrated unit of an episode (a segment, or a standalone Short's `script`) carries a
`visual`. The renderer turns it into animation timed to the voice. Nobody writes page code for
an episode: you describe **what happens when a phrase is spoken**, and the stage draws it.

This is the reference for whoever writes `episode.yaml` (the night agent, or a person).
Design background: `docs/superpowers/specs/2026-10-12-look-v2-design.md`.

## 1. Shape of a `visual`

A `visual` is one scene, or a list of scenes.

```yaml
visual:
  - layout: console         # which stage draws this scene
    systems: [...]          # stage-specific keys sit beside layout/steps
    steps:
      - {at: "tapped Pay", action: tap, target: phone}
  - layout: console
    from: "The fix"         # this scene takes over when the phrase is spoken
    systems: [...]
    steps: [...]
```

- The first scene starts with the narration. Every later scene needs `from`.
- Use a second scene when the picture must start again from a clean state (before / after,
  problem / fix), or when another stage tells the next part better.

### Steps

| Key | Meaning |
|---|---|
| `at` | A phrase from the narration, copied exactly, or `start`. The step fires when it is spoken. |
| `action` | What happens. Each stage has its own list. |
| `target` | What it happens to. |
| `params` | Details of the action (optional). |

Rules:

1. **Steps are listed in spoken order.** A phrase is searched from where the previous step's
   phrase was found, so a repeated word means its *next* occurrence. Several steps may share
   one phrase.
2. Phrases are matched ignoring case and line breaks; punctuation must be as in the script.
   Pick 2-4 words that occur where you mean.
3. `params.delay` (0 to 5 seconds) makes a step wait that long after its phrase. Use it to
   order steps that share a phrase: the tap, then the packet, then the row it writes.
4. Motion takes time. A packet needs half a second per hop, so anchor a `send` to the phrase
   that *starts* the idea and give what it causes a `delay`.
5. Something should change at least every 4 seconds in a Short (`docs/REACH_PLAYBOOK.md`).

### How a phrase becomes a time

The voice stage listens to each finished segment and stores when each word is said in
`timing.json` (`words`, matched to the script by `captions/align.py`). A phrase lands on its
first word; a word the recogniser did not catch is placed between the timed words around it.
Captions are timed the same way, so a caption appears as its first word is said.

A narration rendered without listening (`--no-listen`) has no word times. Then clause ends in
the text are matched to the pauses measured in the audio and a phrase is interpolated between
them. That is an estimate: on episode 001 it slipped by a clause and showed a run of captions
three seconds early, which is why word times replaced it on 14 October 2026.

## 2. Formats, safe area and looks

| | Size | Content area (pixels) |
|---|---|---|
| Shorts / Reels (portrait) | 1080 x 1920 | x 60-1020, y 260-1040 |
| Long video (landscape) | 1920 x 1080 | x 40-1880, y 0-1040 |

The same `visual` renders in both. In portrait, everything above y 260 and below y 1040 belongs
to the captions and the platform's own buttons, so scenes stay out of it.

**The page refuses what it cannot draw well, and the render fails with the reason:**

- a block that leaves the content area (a scene too tall for a phone screen, for example);
- a panel, card or listing with more in it than fits **at any moment of the story**;
- a caption too long for its bar.

Fix those in the episode: shorter labels, fewer rows, a second scene.

Colours come from `config/themes.yaml`, which holds two looks: `control` (a neutral control
room) and `nova` (the same room in the StackNova colours). With no `theme` in the episode, the
long video of episode *n* uses `rotation[(n - 1) mod k]` and its Short *j* uses
`rotation[(n - 1 + j) mod k]`, so neighbouring assets differ. Set `theme: nova` (or `control`)
on the episode or on one Short to pin it. A scene never names a colour: it says
`status: ok | bad | info` or `role: request | reply | retry | error` and the look decides.
Text is drawn only in the bundled faces (Inter, Inter Display, JetBrains Mono).

### What you do not write

The planner adds these from `config/brand.yaml`; an episode never describes them:

- the top bar (logo, part number, the segment's `title`, the episode);
- captions, from the narration, with the segment's `emphasis` words coloured;
- the progress bar;
- on a long video: the logo intro after the first segment (the hook always comes first), the
  welcome line said right after it (`video.welcome`, the owner's choice of 14 October 2026), the
  outro, and the Instagram handle sliding in twice;
- on a Short: like, comment, share, subscribe over the last 3 seconds;
- the transition from one scene to the next.

Top-level `next: {title, teaser}` in `episode.yaml` names the next episode on the outro.

## 3. Stage `console`

A control room for one request's journey: a row of systems, packets that carry their own label
along a track, an optional phone with an app screen, the request and response on the wire, and
up to two panels of state. Use it whenever something travels between systems.

```yaml
- layout: console
  phone:                                   # optional: a checkout screen on the left
    title: Checkout
    total: "$100.00"
    method: "Visa •••• 4242"
    items: [["Headphones", "$89.00"], ["Shipping", "$11.00"]]
  systems:                                 # 1 to 4, left to right
    - {id: api, name: "API server", sub: "POST /v1/payments", idle: "listening on :8080"}
    - {id: store, name: "Key store", sub: "PostgreSQL · idempotency_keys"}
    - {id: gateway, name: "Payment gateway", sub: "moves the money"}
  panels:                                  # 0 to 2, beside the wire
    - {id: keys, kind: table, title: idempotency_keys, columns: [key, status, response], unique: key, lane: store}
    - {id: charges, kind: list, title: "gateway · charges", unit: charged, empty: "No money has moved.", lane: gateway}
  steps: [...]
```

- A system has a `name`, a `sub` line and an `idle` line shown until it logs something.
- A panel is a `table` (`columns`, and `unique` to mark one of them) or a `list` (`unit` for
  its counter, `empty` for what it says before anything arrives). `lane` gives it the colour
  of a system.
- In portrait there is no room for the phone or for every panel: the phone becomes a small
  card that says what its screen would show, and **one panel is on screen at a time**, the one
  the latest step was about. Four cards in a row (the phone and three systems) show names and
  the latest log line only.

| Action | Target | Params | What you see |
|---|---|---|---|
| `tap` | `phone` | | The button is pressed; the phone shows "Processing…" and adds an attempt |
| `send` | `from->to` | `label` (required), `role`, `lost`, `wire`, `response` | A packet with its label travels the track, through the systems in between |
| `log` | a system | `text` | A line in the system's log (the last two stay) |
| `row` | a table panel | `key`, `cells`, `status`, `conflict`, `message` | A row is written; the same `key` again changes it in place |
| `item` | a list panel | `text`, `value`, `status` | A line is added to the list |
| `stamp` | a panel | `text`, `status` | A verdict stamped on the panel: `CHARGED TWICE` |
| `screen` | `phone` | `state`, `title`, `text`, `warn`, `attempt`, `chip` | What the phone's screen shows |
| `note` | `wire` | `text`, `status` | A remark under the request on the wire |
| `highlight` | a system, a panel, `panel.unique`, `phone` | | A glow, about a second and a half |

`send` params:

- `role: request | reply | retry | error` picks the packet's colour; a reply is drawn dashed.
- `lost: 0.8` makes the packet die that far along its way, marked "✕ lost".
- `wire: {title, tag, bad, method, path, headers, hi, body}` puts the request on the wire
  panel, with its body typed out. A header whose value is `null` is shown as not sent. `hi`
  lists the headers to pick out (default `Idempotency-Key`); `tag` is a note in the corner
  (`RETRY · SAME KEY`), red when `bad: true`.
- `response: {status, body, bad}` puts the answer under the request it belongs to. If that
  packet is `lost`, the wire says it never reached its receiver.

`row` params: `cells` are the values after the key, one per remaining column. `status` colours
the first of them. `conflict: true` with a `message` shows an insert being refused: the row
stays as it was and flashes.

`screen` params: `state: idle | error | success`. An error shows a toast (`title`, `text`) and
turns the button into "Try again"; a success shows a tick with `text`, and `warn` in red under
it. `attempt` is what the attempts list says about the last tap (`no reply`, `paid`).
`chip: {label, value, status}` shows a value the phone holds, such as its idempotency key.

Limits: 1 to 4 systems (one system alone needs the phone); 2 panels; ids must differ, and
`phone` and `wire` are taken.

## 4. Stage `sequence`

Who tells whom what, in which order. Two to four actors stand side by side, each with a
lifeline under it; time runs down. Use it for races, handshakes, retries, transactions.

```yaml
- layout: sequence
  header: ["THE RACE", "CHECK, THEN CHARGE"]     # optional label line above the scene
  actors:
    - {id: r1, label: "request #1", kind: client}
    - {id: db, label: "keys table", kind: store}
    - {id: r2, label: "the retry", kind: client}
  steps:
    - {at: "still running", action: message, target: "r1->db", params: {text: "seen 7f3c?"}}
    - {at: "Both charge", action: note, target: r1, params: {text: "charge $100", status: bad}}
```

Actor `kind` is `client`, `service` (the default) or `store`; it is written under the name.

| Action | Target | Params | What you see |
|---|---|---|---|
| `message` | `a->b` | `text`, `role`, `status`, `same_row` | An arrow grows from one lifeline to the other, its words riding on it. A reply is dashed. |
| `note` | an actor | `text`, `status`, `same_row` | A pill on that actor's lifeline: what it does or decides |
| `divider` | `all` | `text` | A rule across every lifeline, for "later" or a change of phase |
| `badge` | an actor | `text`, `status` | A verdict under the actor's name |
| `highlight` | an actor | | The actor's head glows |

Each message, note and divider takes the next row down; `same_row: true` keeps a step on the
row above (two things at the same moment). **A sequence has 7 rows.** The validator counts them;
for a longer story cut to a second scene with `from`.

## 5. Stage `cards`

One to four things compared side by side. A card has a `title`, an optional line of `text`
and up to four `lines` (`key`, `value`) whose values can change. Use it for before/after and
this-versus-that, checklists, quizzes and `a + b = c` statements.

```yaml
- layout: cards
  header: ["IDEMPOTENT?", "DO IT TWICE"]           # optional label line
  title: "twice has the same effect as once"       # optional statement above the cards
  joins: ["+", "="]                                # optional glyph between neighbours
  cards:
    - id: add
      title: "balance += 100"
      hidden: true                                 # stays out of sight until a `show`
      lines: [{id: state, key: balance, value: "$0"}]
  steps:
    - {at: "Add a hundred", action: show, target: add}
    - {at: "do it twice", action: apply, target: add, params: {line: state, value: "$200", status: bad}}
```

| Action | Target | Params | What you see |
|---|---|---|---|
| `show` | a card | | A `hidden` card pops in; a join appears once the cards on both sides of it are there |
| `apply` | a card | `role`, and optionally `line`, `value`, `status` | A ring leaves the card and its `×1, ×2, ...` count ticks up; the named line takes the new value a beat later |
| `set` | `card.line` | `value`, `status` | The line's value changes at once, with a flash |
| `mark` | a card | `status` | A tick or a cross in the card's corner and a frame in that colour |
| `badge` | a card | `text`, `status` | A verdict stamped at the foot of the card |
| `highlight` | a card or `card.line` | | A glow on the card, or a flash on the line |
| `dim` / `focus` | a card or `all` | | `dim x` lowers x; `focus x` brings x up and lowers the rest; `focus all` brings everything back |

Arrangement is automatic: a row in landscape (two by two for four cards that each carry text
and lines); in portrait a row for two cards, a column for three or for anything with `joins`,
a two-by-two grid for four. `arrange: row | column | grid` overrides it. Few cards are drawn
larger. An `apply` whose value does not change is how an idempotent operation looks.

A sum of three cards that also carry lines and verdicts is too tall for a phone screen; the
page says so. Keep a sum's cards to a title and a line of text when it must work as a Short.

## 6. Stage `fanin`

Many senders, one receiver. Two to six `sources` each have a wire to one `target`, which counts
what arrives. Use it for retry storms, many producers, many clients.

```yaml
- layout: fanin
  header: ["WHO RETRIES?", "EVERYONE"]
  sources:
    - {id: http, label: "HTTP client"}
    - {id: user, label: "the user"}
  target: {id: api, label: "your service", title: api}
  counter: "copies of one request"                 # caption under the count
  steps:
    - {at: "Your HTTP client", action: fire, target: http}
```

| Action | Target | Params | What you see |
|---|---|---|---|
| `fire` | a source | `role`, `text` | A packet runs down the source's wire; the count ticks up when it arrives |
| `tag` | the target | `text` | A line in the target's log (the last two stay) |
| `badge` | the target | `text`, `status` | A verdict stamped on the target |
| `highlight` | a source or the target | | A glow |

## 7. Stage `code`

A short listing in an editor window. Write it for the screen: **at most 10 lines of at most 60
characters**, original to the episode, and true to the sample under `samples/`. Keywords,
strings, numbers and comments are coloured for `language: sql | go | java | js | python | lua |
text` (Lua for scripts that run inside Redis).

```yaml
- layout: code
  title: claim_key.sql            # the file name on the window
  language: sql
  reveal: true                    # lines stay hidden until a `show`
  lines:
    - "INSERT INTO idempotency_keys (key, status)"
    - "VALUES ($1, 'in_progress')"
    - "ON CONFLICT (key) DO NOTHING;"
  steps:
    - {at: "inserts a row", action: show, target: "1-3"}
    - {at: "the database refuses", action: highlight, target: "3"}
    - {at: "the database refuses", action: note, target: "3", params: {text: "0 rows: someone else owns it", status: bad}}
```

| Action | Target | Params | What you see |
|---|---|---|---|
| `show` | lines `3`, `2-4` or `all` | | Those lines arrive one after another (only with `reveal: true`) |
| `highlight` | lines | | Those lines light up; the others go quiet |
| `note` | lines | `text`, `status` | A remark pinned to the line: beside the listing in landscape, under it in portrait |
| `focus` | `all` | | Every line back to full strength |

## 8. A worked example

Episode 001 uses every stage. `short-1` is two `console` scenes over a 33-second script, cut at
"The fix". Segment `s06` is a `sequence` (the race), a `code` scene (the constraint) and a
second `sequence` (the race again, now with one winner). `s04`, `s05`, `s07` and `s08` each end
with a Go walkthrough: a `code` scene taken line by line, the way every long video explains its
code (`docs/CONTENT_RULES.md` §4). `s04`, `s07`, `s10` and `short-5` are
`cards`, `s03` is a `fanin`, and `s01`, `s02`, `s05` and `s08` are `console` scenes. Read them
in `content/episodes/001-idempotency/episode.yaml`.

## 9. Checking and previewing

```bash
uv run python -m channel_os.validate content/episodes/001-idempotency/episode.yaml
```

reports an unknown layout, action or target, a phrase that is not spoken and steps out of spoken
order (errors at every status), and a standalone Short without a visual (a warning on a draft,
an error at `ready_to_render`). What only the page can know (does it fit?) is reported by the
render.

Previews need the narration first (the voice stage writes `out/<episode>/timing.json` and the
audio), then:

```bash
uv run --group scenes python -m channel_os.render --episode 001-idempotency --stage scenes --only short-1 --allow-draft
```

writes `out/001-idempotency/preview/short-1.mp4`: the animation with the narration under it.
Add `--quality 0.5` for a quick half-size look, `--format landscape` to see the other format
(saved beside it as `short-1.landscape.mp4`), `--theme control` to try the other look,
`--jobs 2` to draw two scenes at a time. Scenes are drawn in a headless Chrome or Edge that is
already installed; nothing is downloaded.

On GitHub the `render` workflow does both stages (voice, then scenes) and stores
`preview.<target>.mp4` in the episode's draft Release.

## 10. Adding a stage

The stages are `console`, `sequence`, `cards`, `fanin` and `code`; any other `layout` is an
error (`visual-stage`). When a topic needs a picture none of them can draw, add a stage rather
than bending one:

1. `src/channel_os/scenes/<name>_model.py`: its `ACTIONS` and `problems(decl, steps)` for the
   validator. No geometry: the page lays things out.
2. `src/channel_os/scenes/web/<name>.js`: `SN.stages.<name> = {build(clip, root), render(t)}`.
   Everything on screen is a function of `t`; nothing is remembered between frames. Mark each
   block `data-in` (it arrives when the scene comes on), `data-safe` (it must stay in the
   content area) and `data-fit` (its content must fit it).
3. Register the model in `spec.STAGES`, the name in `preview.DRAWN` and the script in
   `web/index.html`; add its actions to the schema's enum (a test keeps them in step).
4. Page tests in `tests/` that read the DOM at chosen moments, and a section here.

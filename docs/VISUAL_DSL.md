# Visual DSL — how an episode describes its animation

Every narrated unit of an episode (a segment, or a standalone Short's `script`) carries a
`visual`. The renderer turns it into animation timed to the voice. Nobody writes Manim code for
an episode: you describe **what happens when a phrase is spoken**, and the stage draws it.

This is the reference for whoever writes `episode.yaml` (the night agent, or a person).
Design background: `docs/superpowers/specs/2026-10-09-m2-scenes-design.md`.

## 1. Shape of a `visual`

A `visual` is one scene, or a list of scenes.

```yaml
visual:
  - layout: flow            # which stage draws this scene
    nodes: [...]            # stage-specific keys sit beside layout/steps
    steps:
      - {at: "tapped Pay", action: press, target: you}
  - layout: flow
    from: "The fix"         # this scene takes over, with a hard cut, when the phrase is spoken
    nodes: [...]
    steps: [...]
```

- The first scene starts with the narration. Every later scene needs `from`.
- Use a second scene when the picture must start again from a clean state (before / after,
  problem / fix). Keep the same nodes in the same order and the cut reads as a reset, not a jump.

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
   one phrase; they fire together.
2. Phrases are matched ignoring case and line breaks; punctuation must be as in the script.
   Pick 2-4 words that occur where you mean.
3. Motion takes time. A packet needs about 0.4 s per rail, so anchor a `send` to the phrase
   that *starts* the idea, and let its result (`row`, `chip`, `mark`) land by itself.
4. Something should change at least every 4 seconds in a Short (`docs/REACH_PLAYBOOK.md`).

### How a phrase becomes a time

The voice stage measures the pauses in each narration and stores them in `timing.json`. Clause
ends in the text are matched to those pauses; a phrase's time is interpolated between them. A
phrase right after a pause is exact; one in the middle of a long clause can be a few tenths of
a second off. Word-level alignment arrives with captions in M3 and needs no change here.

## 2. Formats, safe area and themes

| | Size | Content area (pixels) |
|---|---|---|
| Shorts / Reels (portrait) | 1080 x 1920 | x 60-1020, y 260-1040 |
| Long video (landscape) | 1920 x 1080 | x 160-1760, y 110-970 |

The same `visual` renders in both. In portrait, everything above y 260 and below y 1040 belongs
to the hook, the burned-in captions (M3) and the platform's own buttons, so scenes stay out of
it. **A part that leaves the content area fails the render** and the error names it. Text is
shrunk to fit its slot down to 60% and fails below that: shorten the label.

Colours and fonts come from `config/themes.yaml`. With no `theme` in the episode, the long video
of episode *n* uses `rotation[(n - 1) mod k]` and its Short *j* uses
`rotation[(n - 1 + j) mod k]`, so neighbouring assets differ. Set `theme: navy` (or `brand`) on
the episode or on one Short to pin it. A scene never names a colour: it says `status: ok | bad |
info` or `role: request | reply | retry` and the theme decides.

## 3. Stage `flow`

A row of 2-4 nodes joined by rails, with requests travelling along them. Below the row there is
room for **lanes** (the same journey replayed as alternative stories) or a **table** owned by one
node. Not both in one scene.

```yaml
- layout: flow
  header: ["PAYMENT / RETRY", "REQ #4171"]     # optional: small text top-left and top-right
  nodes:
    - {id: you, kind: phone, label: you, amount: "$100.00", button: Pay}
    - {id: server, kind: service, label: server, title: api}
    - {id: bank, kind: ledger, label: bank, title: ledger}
  lanes:                                        # optional
    title: "no reply. two possible stories:"
    rows:
      - {id: a, label: "1  never arrived"}
      - {id: b, label: "2  charged, reply lost"}
  # table: {title: idempotency_keys, owner: server}   # optional, instead of lanes
  steps: [...]
```

### Node kinds

| `kind` | Looks like | Keys |
|---|---|---|
| `phone` | A handset with an amount and a button | `label`, `amount`, `button` (default `Pay`) |
| `service` | A panel with a title bar and blinking status lights | `label`, `title` |
| `ledger` | A panel that collects numbered rows (up to 3) | `label`, `title` |

`label` is the name under the node. Nodes are laid out left to right in the order listed.

### Targets

| Target | Means |
|---|---|
| `you` | A node, by id |
| `you->bank` | The path from one node to another along the main row. It may pass through nodes in between. |
| `b:you->bank` | The same path on lane `b` |
| `main`, `lanes`, `table` | A whole group |
| `a` | One lane, by id |
| `table:k` | The table row whose `id` is `k` |

### Actions

| Action | Target | Params | What you see |
|---|---|---|---|
| `press` | a phone | | The button flashes and a ring spreads from it |
| `send` | a path | `role`, `tag`, `lost`, `row`, `chip`, `mark` | A packet travels the path; dashes march along the rails it uses |
| `row` | a ledger, or `table` | ledger: `text`, `status`; table: `id`, `cells: [key, value]`, `status` | A row is written |
| `chip` | a node | `text`, `status`, or `clear: true` | A small status pill on a phone's screen (under the name of other nodes) |
| `badge` | a node, or `table` | `text`, `status` | A bold pill above the node, with a ring; on a table, in its title bar |
| `tag` | a node | `text`, `status` | A light pill above the node (what it is carrying) |
| `block` | a path between neighbours | `text` | A red bar across the rail for about 2.5 s: this attempt stops here |
| `dim` | a group or a lane | | Fades it back so the eye goes elsewhere |
| `focus` | a group or a lane | | Brings it back to full strength |
| `title` | `lanes` or `table` | | Reveals the lower area |
| `timeout` | `lanes` | | A ring next to the lanes title sweeps round like a clock running out |
| `highlight` | a node, `table`, `table:<id>`, a lane | | A pulse: an outline on a node or table, a glow on a table row. On a ledger with a bad row it pulses that row too. On a lane it brings in the lane's label. |

`send` params:

- `role: request | reply | retry` picks the packet's colour (default `request`).
- `tag: "7f3c"` writes a small label that rides with the packet.
- `lost: 0.55` makes the packet die that far along its last rail, with a red cross. Nothing
  arrives, so `row` and `mark` are ignored; a `chip` is what the receiver shows instead (for
  example `{text: error, status: bad}` when a reply never comes).
- `row: {text: "$100", status: ok}` writes a ledger row when the packet arrives.
- `chip: {text: paid, status: ok}` shows a chip on the receiver when it arrives.
- `mark: ok` (a tick) or any short text such as `x2` appears above the receiver. Lanes only.

Things that share a place replace each other: a new chip replaces the node's chip, and a `tag`
and a `badge` share the spot above a node.

The lower area stays hidden until a `title` or `timeout` step reveals it. A lane's label appears
when the lane is first used. If no step reveals the lower area, it is simply there from the start.

A row with neither lanes nor a table sits in the middle of the frame. With three or more lanes
the main row is drawn smaller to give the lanes room.

### Limits

- 2 to 4 nodes; a ledger holds 3 rows; the table holds 3 rows.
- `press` needs a phone; `row` needs a ledger or the table.
- A step the stage cannot draw fails the render and names the step and its phrase.

A `row` on the table with an `id` that already exists changes that row's value in place
(`in progress` becoming `completed`).

## 4. Stage `sequence`

Who tells whom what, in which order. Two to four actors stand side by side, each with a
lifeline under it; time runs down. Use it for races, handshakes, retries, transactions.

```yaml
- layout: sequence
  header: ["THE RACE", "CHECK, THEN CHARGE"]
  actors:
    - {id: r1, label: "request #1", kind: client}
    - {id: db, label: "keys table", kind: store}
    - {id: r2, label: "the retry", kind: client}
  steps:
    - {at: "still running", action: message, target: "r1->db", params: {text: "seen 7f3c?"}}
    - {at: "Both charge", action: note, target: r1, params: {text: "charge $100", status: bad}}
```

Actor `kind` is `client` (a pill with a ring), `service` (a panel with status lights, the
default) or `store` (a panel with a stack mark).

| Action | Target | Params | What you see |
|---|---|---|---|
| `message` | `a->b` | `text`, `role`, `status`, `lost`, `same_row` | An arrow grows from one lifeline to the other behind a packet and stays. `lost` stops it short with a cross. |
| `note` | an actor | `text`, `status`, `same_row` | A pill on that actor's lifeline: what it does or decides |
| `divider` | `all` | `text` | A dashed rule across every lifeline, for "later" or a change of phase |
| `badge` | an actor | `text`, `status` | A bold pill above the actor |
| `highlight` | an actor | | The actor's head pulses |

Each message, note and divider takes the next row down; `same_row: true` keeps a step on the
row above (two things at the same moment). **A sequence has 7 rows.** The validator counts them;
for a longer story cut to a second scene with `from`.

## 5. Stage `cards`

One to four panels compared side by side. A card has a `title`, an optional line of `text`
and up to four `lines` (`key`, `value`) whose values can change. Use it for before/after and
this-versus-that, checklists, quizzes and `a + b = c` statements.

```yaml
- layout: cards
  title: "twice has the same effect as once"      # optional line above the cards
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
| `show` | a card | | A `hidden` card (and the join before it) fades in |
| `apply` | a card | `role`, and optionally `line`, `value`, `status` | A packet drops into the card and its `x1, x2, ...` tally ticks up; the named line takes the new value as it lands |
| `set` | `card.line` | `value`, `status` | The line's value changes with a glow |
| `mark` | a card | `status` | A tick or a cross in the card's corner and a frame in that colour |
| `badge` | a card | `text`, `status` | A bold pill above the card |
| `highlight` | a card or `card.line` | | An outline pulse, or a glow on the line |
| `dim` / `focus` | a card or `all` | | Fade back / bring back |

Arrangement is automatic: a row in landscape (two by two for four cards too wordy to share a
row); in portrait a row for two cards, a column for three or for anything with `joins`, a
two-by-two grid for four. `arrange: row | column | grid` overrides it. Cards grow to fill the
frame as far as their longest title, text and line allow (up to 1.6 times), so short labels
make big, readable cards. An `apply` whose value does not change is how an idempotent
operation looks.

## 6. Stage `fanin`

Many senders, one receiver. Two to six `sources` stack on the left, each with a rail to one
`target`; a counter under the target counts arrivals. Use it for retry storms, many producers,
many clients.

```yaml
- layout: fanin
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
| `fire` | a source | `role` (default `retry`) | The source appears the first time, its packet runs into the target and the count ticks up |
| `badge` | the target | `text`, `status` | A bold pill above the target |
| `tag` | the target | `text`, `status` | A light pill above the target (shares the badge's spot) |
| `highlight` | a source or the target | | An outline pulse |

## 7. Stage `code`

A short listing in an editor panel. Write it for the screen: **at most 10 lines of at most 60
characters**, original to the episode, and true to the sample under `samples/`. Keywords,
strings, numbers and comments are coloured for `language: sql | go | java | js | python | text`.

```yaml
- layout: code
  title: claim_key.sql
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
| `highlight` | lines | | A band behind those lines; the others fade |
| `note` | lines | `text`, `status` | A pill under the panel saying what the line means |
| `focus` | `all` | | Every line back to full strength, the band gone |

## 8. A worked example

Episode 001 uses every stage. `short-1` is two `flow` scenes over a 33-second script, cut at
"The fix". Segment `s06` is a `sequence` (the race), a `code` scene (the constraint) and a
second `sequence` (the race again, now with one winner). `s04` and `short-5` are `cards`, `s03`
is a `fanin`. Read them in `content/episodes/001-idempotency/episode.yaml`.

## 9. Checking and previewing

```bash
uv run python -m channel_os.validate content/episodes/001-idempotency/episode.yaml
```

reports an unknown layout, action or target, a phrase that is not spoken and steps out of spoken
order (errors at every status), and a standalone Short without a visual (a warning on a draft,
an error at `ready_to_render`).

Previews need the narration first (the voice stage writes `out/<episode>/timing.json` and the
audio), then:

```bash
uv run --group scenes python -m channel_os.render --episode 001-idempotency --stage scenes --only short-1 --allow-draft
```

writes `out/001-idempotency/preview/short-1.mp4`: the animation with the narration under it.
Add `--quality 0.5` for a quick half-size look, `--format landscape` to see the other format
(saved beside it as `short-1.landscape.mp4`), `--theme brand` to try the other theme, `--jobs 2`
to draw two scenes at a time. Previews have no captions, hook card or watermark; those are
added in assembly (M3).

On GitHub the `render` workflow does both stages (voice, then scenes) and stores
`preview.<target>.mp4` in the episode's draft Release.

## 10. Adding a stage

The stages are `flow`, `sequence`, `cards`, `fanin` and `code`; any other `layout` is an error
(`visual-stage`). When a topic needs a picture none of them can draw, add a stage rather than
bending one: a pure `<name>_model.py` in `src/channel_os/scenes/` (its `ACTIONS`, `problems`
for the validator, `layout` for both formats) and a `<name>.py` that draws it on the shared
`Stage` base. Register both in `spec.STAGES` and `preview.BUILDERS`, add its actions to the
schema's enum (a test keeps the two in step), and document it here.

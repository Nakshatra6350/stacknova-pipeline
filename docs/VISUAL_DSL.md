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

### Limits

- 2 to 4 nodes; a ledger holds 3 rows; the table holds 3 rows.
- `press` needs a phone; `row` needs a ledger or the table.
- A step the stage cannot draw fails the render and names the step and its phrase.

## 4. A worked example

Episode 001, `short-1`, is the reference: two scenes over a 33-second script, cut at "The fix".
Scene 1 shows the double charge and then two lanes for what a timeout hides; scene 2 replays the
payment with a key and a table that stops the retry. Read it in
`content/episodes/001-idempotency/episode.yaml`.

## 5. Checking and previewing

```bash
uv run python -m channel_os.validate content/episodes/001-idempotency/episode.yaml
```

reports an unknown layout, action or target, a phrase that is not spoken, steps out of spoken
order, and a standalone Short without a visual (warnings on a draft, errors at
`ready_to_render`).

Previews need the narration first (the voice stage writes `out/<episode>/timing.json` and the
audio), then:

```bash
uv run --group scenes python -m channel_os.render --episode 001-idempotency --stage scenes --only short-1 --allow-draft
```

writes `out/001-idempotency/preview/short-1.mp4`: the animation with the narration under it.
Add `--quality 0.5` for a quick half-size look, `--format landscape` to see the other format
(saved beside it as `short-1.landscape.mp4`), `--theme brand` to try the other theme. Previews
have no captions, hook card or watermark; those are added in assembly (M3).

## 6. Layouts that have no stage yet

`layout` names other than `flow` are accepted by the schema but cannot be rendered. The
validator reports them as `visual-stage`. New stages are added in `src/channel_os/scenes/`
(a pure model for validation and geometry, and a Manim module that draws it) and registered in
`spec.STAGES` and `preview.BUILDERS`.

# M2 — Scenes: design

Approved by the owner on 9 October 2026, with three instructions:

1. The visuals must look like the owner's portfolio illustrations (animated, concept-specific
   schematics), not basic boxes and arrows. A 14-second prototype in that style was approved.
2. Colours are a mixture: some videos in the brand theme, some in navy. Not every video, Reel
   or Short uses the same one.
3. Every asset must be animated for its whole narration ("full knowledge"), not just the opening.

Source: `docs/BUILD_PLAN.md` M2.

## Acceptance

- `long.mp4` (1920x1080, 30 fps) and 1080x1920 Shorts render for episode 001.
- Each scene lasts exactly as long as its narration, to within one frame. A render whose frame
  count does not match fails.
- Colours and fonts come from config, never from scene code.
- `uv run pytest`, `uv run ruff check`, `uv run mypy src` pass; CI is green.
- The owner approves the look on a complete Short before the remaining layouts are built.

## Delivery stages

1. Style sample — done, approved.
2. One complete Short (`short-1`) rendered by the real engine from `episode.yaml`.
3. The remaining layouts, the long video and all five Shorts, and the workflow integration.

## The visual language

Taken from `Nakshatra-Portfolio/index.html` (inline SVG with CSS and SMIL animation):

- **Rails**: thin lines between parts. **Flows**: dashes that march along a rail while something
  travels on it.
- **Packets**: dots that travel along rails. A failed one stops part-way and is marked with a
  red cross.
- **Concept shapes**, drawn from primitives: phone with a button, service panel with status
  lights, ledger and table with rows, lane rows for alternative stories.
- **Status language**: mono labels, green for success, red for failure, pills and badges,
  expanding ping rings.
- **Never still**: ambient motion (status lights, idle flows) continues between narrated steps.

## Facts this design rests on (prototype, 9 October 2026)

- Manim 0.21.0 renders the style on Python 3.12, and the brand fonts register from files.
- Manim needs `numpy>=2.1`; chatterbox-tts needs `numpy<2`. They are separate, conflicting
  dependency groups, and the workflow runs voice and scenes in sequence.
- A scene driven by one clock and a single `wait` lands on an exact frame count (420 of 420).
- Manim redraws only from the first mobject that has an updater onwards; anything before it is
  painted once and frozen. The clock's driver mobject must be added first. Forgetting this
  renders every frame as the first one.
- On the owner's PC an uncached `Text` takes seconds to rasterise; Manim caches the result, so
  the cache directory must be stable between runs.
- Estimating a phrase's time by its character position alone is up to 0.9 s early inside a
  14-second chunk, because pauses are not evenly spread. Anchoring clause boundaries to the
  pauses measured in the audio removes most of that.

## Architecture

Everything on screen is a function of time. A scene has drawables and a list of tracks; each
track sets one property from the clock. Steps from `episode.yaml` compile into tracks.

| Module (`src/channel_os/scenes/`) | Needs Manim | Does |
|---|---|---|
| `theme.py` | no | Loads `config/themes.yaml`; picks a theme for an asset |
| `phrases.py` | no | Maps a phrase in the narration to a time, using measured pauses |
| `spec.py` | no | Turns a `visual` block into scenes with timed steps; knows the stage registry |
| `formats.py` | no | The two formats, their safe content areas and the frame rate |
| `flow_model.py` | no | The `flow` stage without drawing: what a declaration may say, where each part sits |
| `plan.py` | no | Which clips make up a target and how many frames each gets |
| `kit.py` | yes | Drawables: shapes, text, flows, packets, pings; the opacity registry |
| `flow.py` | yes | The `flow` stage: a row of nodes, optional lanes and table, and its actions |
| `render.py` | yes | Runs a scene with the clock driver first; verifies the frame count |
| `preview.py` | yes | Renders a target's clips and joins them under its narration |

Modules that need Manim are imported only when rendering, so validation and linting keep working
in the light environment.

## The visual DSL

`visual` is one scene or a list of scenes. A later scene in a list starts at its `from` phrase,
which gives a hard cut and lets one narration use several stages.

```yaml
visual:
  - layout: flow
    nodes:
      - {id: you, kind: phone, label: you, amount: "$100.00", button: Pay}
      - {id: server, kind: service, label: server, title: api}
      - {id: bank, kind: ledger, label: bank, title: ledger}
    lanes: {title: "no reply. two possible stories:", rows: [{id: a, label: "1  never arrived"}]}
    steps:
      - {at: "tapped Pay", action: press, target: you}
      - {at: "tapped Pay", action: send, target: "you->bank", params: {via: server}}
  - layout: flow
    from: "The fix"
    steps: []
```

Standalone Shorts gain an optional `visual` (they had none). `theme` is optional on the episode
and on each Short. `docs/VISUAL_DSL.md` is the reference for stages, node kinds and actions.

**Themes.** `config/themes.yaml` holds named palettes and a rotation. With no `theme` given, the
long video uses `rotation[(episode number - 1) mod n]` and Short k uses
`rotation[(episode number - 1 + k) mod n]`, so neighbouring assets differ.

**Timing.** The voice stage records the pauses of each segment in `timing.json`. A step's time is
found by locating its phrase in the text and interpolating between anchors, where anchors are
clause boundaries matched to measured pauses. Word-level alignment in M3 can replace this
without changing the DSL. (It did, on 14 October 2026: the anchors are now the measured start
of each word, `segments[].words` in `timing.json`; pauses remain the fallback. Placed from
pauses, a run of captions in episode 001 came three seconds before their words.)

**Layout safety.** Portrait content stays inside x 60-1020, y 260-1040 so captions (M3) and
platform UI never cover it. Text is fitted to its slot; a part that leaves the content area
fails the render.

## Validation

- Unknown layout, action or target: a gate rule (warning on a draft, error at `ready_to_render`).
- `at` and `from` phrases of a Short's visual must occur in its script.
- A standalone Short without a `visual`: gate rule.

## Out of scope for M2

Captions, hook card, key-term labels and watermark (M3); exact word alignment (M3); new stage
types beyond what episode 001 needs.

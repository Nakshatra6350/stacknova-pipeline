# StackNova Studio (look v3)

The engineer and Nova in explorable 3D software worlds, built with three.js, TypeScript and
Vite. The same scene code serves three purposes:

| Mode | URL | What it is |
|---|---|---|
| explore (default) | `/` | The HashMap world live: orbit with the mouse, click a bucket to look inside, type a key and press **Put**. The engineer hashes it with Java's own `String.hashCode`, it lands in its bucket, and Nova reacts to collisions. |
| story | `/?mode=story` | The HashMap Short played in real time in its 1080 x 1920 frame (with sound if `public/local/hashmap-mix.wav` exists; that folder is not committed). |
| render | `/?mode=render` | For the video renderer: `window.boot(timeline)`, then `window.render(t)` draws the exact frame at t. |
| lab | `/?mode=lab` | A turntable for the characters (used to check poses and faces). |

## Run it

```bash
cd studio
npm install
npm run dev        # http://localhost:5199
npm run build      # type-checks, then builds dist/
```

## Make the video

The video is drawn frame by frame from `dist/` in headless Chrome, with the spoken timeline in
`public/story/hashmap-short.json` (made by `spikes/look-v3/build_timeline.py` from the voice job).
On GitHub, `.github/workflows/look-v3-render.yml` does it on every push to `look-v3`: six parts in
parallel, then it joins them with the sound and stores the result in the draft Release
`look-v3-draft` (never public). Locally:

```bash
python studio/scripts/render.py stills studio/public/story/hashmap-short.json out/stills 12.6 32.5
```

## How it is put together

```
src/
  app/stage.ts              renderer, camera (with a soft fill light), subtle bloom
  characters/types.ts       CharacterRig: the only thing scenes know about a character
  characters/engineer.ts    the engineer, built in code (cel shading, ink lines, drawn face)
  characters/nova.ts        Nova, built in code
  characters/gltf.ts        a rigged glTF/GLB character behind the same contract
  characters/index.ts       picks code-built or glTF per character from public/characters.json
  world/hashmapWorld.ts     16 glass-tube buckets, platform, city, System Vision
  props/cards.ts            key cards, code panels, bits strip, chain nodes, slabs; Java's hash
  story/hashmapShort.ts     the Short: shots, moves, props and HUD as a function of time
  hud/                      the frame: title band, 3D window, caption band (no text on the picture)
  interactive/explore.ts    explore mode (OrbitControls, Raycaster)
```

Every movement is a pure function of time, so any frame can be drawn on its own; that is what
lets the video be drawn in parallel parts.

## The engineer: a VRoid model (VRM)

The engineer is meant to be a real rigged anime model made in VRoid Studio (steps for the owner:
`docs/VROID_ENGINEER.md`). `src/characters/vrm.ts` loads it with GLTFLoader and the VRM plugin
(`@pixiv/three-vrm`) and poses its humanoid bones from the story every frame: walking, breathing,
arms reaching to point, explain, touch the glasses and present the key, head and eye turns,
blinking, lip-sync from the voice, expressions, and the model's own hair physics (settled over a
second whenever time jumps, so video parts match). If the model has no glasses or backpack, the
studio adds them (`glasses`, `backpack`); the glasses are centred on the model's eye bones and set
on the face surface. Camera framing follows the model's head height.

Point the studio at the model with `public/local/characters.json` (git ignores that folder; the
model is kept in the private content repository):

```json
{ "engineer": { "kind": "vrm", "url": "local/engineer.vrm", "glasses": true, "backpack": true },
  "nova": { "kind": "procedural" } }
```

Check it against the reference sheet (six views: front, three-quarter, face, side, beside Nova,
pointing at the HashMap), after `npm run build`:

```bash
python studio/scripts/validate_character.py "reference-sheet.webp" out/character-check.png
```

## Replacing the characters with other models

The code-built engineer and Nova move and talk, but the engineer is only a stylised placeholder,
not the painted look of the reference sheet. To use another rigged model, export it as
`.glb` (for example a VRoid Studio character converted in Blender with the VRM add-on, or a model
from a 3D artist), put it in `public/models/`, and describe it in `public/characters.json`:

```json
{
  "engineer": {
    "kind": "gltf",
    "url": "models/engineer.glb",
    "scale": 1,
    "bones": { "head": "J_Bip_C_Head", "leftHand": "J_Bip_L_Hand", "rightHand": "J_Bip_R_Hand" },
    "clips": { "idle": "Idle", "walk": "Walk", "point": "Point", "explain": "Talking", "think": "Thinking",
               "vision": "TouchGlasses", "present": "OfferPalm", "nod": "Nod", "thumbsUp": "ThumbsUp" },
    "morphs": { "blink": "Fcl_EYE_Close", "mouth": "Fcl_MTH_A", "smile": "Fcl_ALL_Joy", "surprised": "Fcl_ALL_Surprised" }
  },
  "nova": { "kind": "procedural" }
}
```

- `bones`: the model's own bone names for the head and hands (the head turns toward what the
  character looks at; props are held at the hands).
- `clips`: which animation clip plays each action. Clips can come from Mixamo or be authored in
  Blender; they play through an `AnimationMixer` whose time is set from the story, so frames stay
  exact.
- `morphs`: the model's blend shapes for blinking, the mouth (lip-sync from the voice) and
  expressions. VRoid models have these already (the names above are VRoid's).

Nothing else changes: the story, the explore mode and the renderer only use the `CharacterRig`
contract in `src/characters/types.ts`.

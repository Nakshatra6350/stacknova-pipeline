# Making the StackNova engineer in VRoid Studio

The engineer in the videos is a real rigged 3D anime model made once in VRoid Studio (pixiv's free
anime-character maker) and loaded by the studio (`studio/`) through GLTFLoader with the VRM
plugin. VRoid models come with a skeleton, blinking, mouth shapes for lip-sync and facial
expressions, so the engineer can walk, point, talk and react from any camera angle, in every
episode. The reference sheet is the source of truth:
`Desktop\StackNova Launch\0 Character\reference-sheet.webp`.

Files for the outfit (transparent PNGs, also in `brand-assets/character/`): `SN-logo-cyan.png`,
`SN-logo-white.png`, `cyan-stripe.png`.

## Steps (owner)

Free about **2 GB** on C: first (VRoid Studio and its working files need it).

1. Download VRoid Studio from https://vroid.com/en/studio (Windows) and install it.
2. Open it, choose **Create New**, then the **masculine** body.
3. **Face**: pick the face preset closest to the sheet (young adult, soft jaw). Eyes: medium-large,
   slightly sharp outer corners, iris dark brown. Eyebrows: dark, fairly thick. Skin: light peach.
4. **Hairstyle**: pick a short, messy, layered men's preset with bangs falling to the eyebrows.
   Hair colour: near-black (`#15171F`).
5. Cyan-blue streaks: in the hair editor, select 5–8 locks spread over the top and sides, give
   them a second hair material and colour it blue (`#2B4A6F`), with a lighter highlight
   (`#3FA9D6`).
6. **Body**: height to about 180 cm, slim build. Keep the head a little large (anime), but not
   chibi.
7. **Outfit, tops**: a hoodie or parka. Colour it black (`#1E212B`). Open the texture editor,
   import `SN-logo-cyan.png` as a new layer and place it on the left chest. Add
   `cyan-stripe.png` along each sleeve.
8. **Outfit, bottoms**: loose pants (cargo style if there is one), black (`#1C1F28`).
9. **Outfit, shoes**: sneakers, black with a cyan accent (`#2FD3F5`) on the side.
10. **Accessory**: if VRoid offers glasses, pick black rectangular frames. If it does not, skip
    this: the studio adds the glasses in code, attached to his head.
11. Compare him with the sheet from the front and the side, and adjust hair and eyes until he
    reads as the same person.
12. **Export** (top right) → **Export as VRM** → **VRM 1.0**. Title: `StackNova Engineer`, author:
    `StackNova`. Permissions: only the author may use the avatar.
13. Save it as `Desktop\StackNova Launch\0 Character\engineer.vrm` and tell Claude.

## Where the model lives

The `.vrm` is a brand asset, so it is kept in the **private** content repository
(`stacknova-content/characters/engineer.vrm`), not in this public repository. Locally the studio
reads it from `studio/public/local/engineer.vrm` (git ignores that folder); the render workflow
fetches it from the private repository with `CONTENT_REPO_TOKEN`, the same way it fetches the
voice reference.

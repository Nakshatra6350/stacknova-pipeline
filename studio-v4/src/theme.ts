// Look v4 ("Behind the Button", owner's approval of 29 Oct 2026): editor-native. Everything looks
// like a developer's own screen (editor, terminal, simple diagrams) on a near-black canvas, with
// GitHub-dark style colours for meaning: green works, red breaks, amber waits, blue is a request.
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export const C = {
  bg: "#0a0d12",
  surface: "#11161f",
  raised: "#171e2a",
  border: "#262f3d",
  text: "#e8edf3",
  muted: "#8b96a5",
  green: "#3fb950",
  red: "#ff5a52",
  amber: "#e3b341",
  blue: "#58a6ff",
  purple: "#c297ff",
  yellow: "#ffd84d", // the spoken word in captions
  pink: "#ff4d8d", // brand (wordmark only)
  orange: "#ff8a3d",
  gold: "#ffd24d",
};

export const FONT = { ui: "Inter", display: "Inter Display", mono: "JetBrains Mono" };

const faces: [string, string, string][] = [
  [FONT.ui, "Inter-Medium.ttf", "500"],
  [FONT.ui, "Inter-Bold.ttf", "700"],
  [FONT.display, "InterDisplay-ExtraBold.ttf", "800"],
  [FONT.mono, "JetBrainsMono-Regular.ttf", "400"],
  [FONT.mono, "JetBrainsMono-Bold.ttf", "700"],
];
for (const [family, file, weight] of faces) {
  loadFont({ family, url: staticFile(`fonts/${file}`), weight });
}

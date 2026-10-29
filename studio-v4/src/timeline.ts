// The narration's timeline (scripts/narrate.py): each line's scene, start and end in seconds, and
// its caption words. Scenes time their beats to the words they show.
export type Word = { w: string; s: number; e: number };
export type Line = { id: string; scene: string; start: number; end: number; words: Word[] };
export type Timeline = { id: string; keyword: string; voice: string; duration: number; lines: Line[] };

export const FPS = 30;
export const TAIL = 1.2; // seconds after the last word, for the loop back to the hook

export const frames = (seconds: number) => Math.round(seconds * FPS);

/** Seconds from the line's start to the nth word that starts with `prefix` (case-insensitive). */
export function wordAt(line: Line, prefix: string, nth = 1): number {
  const want = prefix.toLowerCase();
  let seen = 0;
  for (const w of line.words) {
    if (w.w.toLowerCase().replace(/^[^a-z0-9]+/, "").startsWith(want) && ++seen === nth) {
      return w.s - line.start;
    }
  }
  throw new Error(`"${prefix}" #${nth} is not in line ${line.id}`);
}

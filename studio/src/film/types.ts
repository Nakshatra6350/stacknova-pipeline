// A film as studio/scripts/build_film.py hands it over: the spoken timeline plus the film's spec,
// every beat's `at` and `until` already turned into seconds. The beat sheet is documented in
// studio/FILMS.md.
import type { Expression, Gesture } from '../characters/types';
import type { Timeline } from '../hud/hud';

export type Vec = [number, number, number];
/** A named place in the world ("bucket:7", "engineer", "nova") or a point. */
export type Place = string | Vec;

export type ShotKind = 'auto' | 'wide' | 'two' | 'engineer' | 'nova' | 'look' | 'follow' | 'orbit' | 'raw';
export interface ShotSpec {
  kind: ShotKind;
  at?: Place;          // look, orbit: what the camera looks at
  prop?: string;       // follow, look: a prop to look at
  dist?: number;       // how far the camera stands from what it looks at
  height?: number;     // camera height above what it looks at
  angle?: number;      // degrees around what it looks at; 0 = from the front
  side?: number;       // engineer, nova, two: -1 left .. 1 right
  fov?: number;
  push?: number;       // share of the distance the camera moves in over the shot
  from?: number;       // orbit: start and end angles, degrees
  to?: number;
  pos?: Vec; look?: Vec; pos2?: Vec; look2?: Vec; // raw
}

export interface CastBeat {
  face?: Expression;
  gesture?: Gesture;
  target?: Place;      // where a gesture points
  look?: Place;        // 'camera', 'speaker', a place
  to?: Place;          // Nova flies there; the engineer reappears there
  dur?: number;
  enter?: boolean;     // the engineer materialises here
  vision?: boolean;    // System Vision: glasses flare, the world shows its structure
}

export interface PropBeat {
  id: string;
  show?: boolean; hide?: boolean;
  place?: Place;       // where it appears (default: where it was)
  to?: Place;          // where it travels, over `dur`
  dur?: number;
  arc?: number;        // how high the path arcs
  scale?: number;
  state?: Record<string, unknown>; // card state changes (numbers tween over `dur`)
  type?: boolean;      // code: type the lines out over `dur`
}

export interface HudBeat { step?: number; callout?: string; tone?: '' | 'amber' | 'red' | 'green'; for?: number; brand?: boolean }

export type WorldOp = Record<string, unknown>;

export interface Beat {
  at: number;
  until?: number;
  shot?: ShotSpec;
  engineer?: CastBeat;
  nova?: CastBeat;
  prop?: PropBeat | PropBeat[];
  world?: WorldOp | WorldOp[];
  hud?: HudBeat;
}

export interface PropSpec {
  kind: 'key' | 'code' | 'bits' | 'label' | 'gauge' | 'mark' | 'node' | 'grid';
  text?: string; sub?: string; tone?: string;
  file?: string; code?: string; width?: number;  // code
  value?: number | string; low?: number; extra?: boolean; result?: string; // bits
  max?: number; limit?: number;                  // gauge
  key?: string; hash?: string;                   // node
  size?: number;                                 // label, mark
}

export interface FilmSpec {
  id: string;
  format: 'short' | 'long';
  world: string;
  title: string;
  episode: string;
  steps: string[];
  hook?: string;
  end?: { kicker: string; head: string; cta?: string };
  props?: Record<string, PropSpec>;
  beats: Beat[];
}

export interface FilmTimeline extends Timeline {
  film: FilmSpec;
  /** Which platform this render is for: the end card asks to subscribe (short) or follow (reel). */
  variant?: 'short' | 'reel';
}

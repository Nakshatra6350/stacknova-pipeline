// Plays a film: reads its beats once, then draws any moment t on its own (camera, cast, world,
// props, HUD). Everything a beat does not say has a sensible default: the listener looks at the
// speaker, the mouth follows the voice, the head dips on stressed syllables, faces hold until the
// next face, and a shot of kind "auto" covers the conversation line by line.
import * as THREE from 'three';
import type { Stage } from '../app/stage';
import type { Cast } from '../characters';
import type { CharacterState, Expression, Gesture, GestureState } from '../characters/types';
import type { FrameHud, Line } from '../hud/hud';
import { keyCard, codePanel, bitsCard, labelCard, gaugeCard, gridCard, dialCard, markCard, nodeCard, type CodeState } from '../props/cards';
import type { Card } from '../util/look';
import { backOut, blinkAt, clamp, deg, lerp, pulse, smooth, smoother, span, wobble, V } from '../util/math';
import { colour } from './code';
import { makeWorld } from './world';
import type { Beat, CastBeat, FilmTimeline, Place, PropBeat, PropSpec, ShotSpec } from './types';

type Who = 'engineer' | 'nova';
interface Framing { pos: THREE.Vector3; look: THREE.Vector3; fov: number }
interface Shot { a: number; b: number; s: ShotSpec }
interface PropTrack {
  card: Card<any>; spec: PropSpec; shows: [number, number][]; places: { t: number; place: Place; dur: number; arc: number }[];
  states: { t: number; patch: Record<string, unknown>; dur: number }[]; types: [number, number][]; scale: [number, number][];
}

const asList = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const SHORT_GESTURES: Gesture[] = ['nod', 'shake'];
// "never" is a time far away, not Infinity: Infinity - Infinity is NaN, and one NaN in the picture
// blacks out the whole frame through the bloom pass
const NEVER = 1e6;

export function playFilm(stage: Stage, cast: Cast, hud: FrameHud, tl: FilmTimeline): (t: number) => void {
  const { scene, camera } = stage;
  const film = tl.film;
  const beats: Beat[] = film.beats;
  const world = makeWorld(film.world, scene);
  const { engineer, nova } = cast;
  scene.add(engineer.root, nova.root);
  const end = tl.events.end ?? tl.duration - 2.6;

  // framing follows the engineer's real head height
  engineer.apply({ t: 0, position: V(), yaw: 0 }); engineer.root.updateMatrixWorld(true);
  const HK = clamp(engineer.headWorld().y / 1.6, 0.8, 1.2);
  const HOME: Record<Who, THREE.Vector3> = { engineer: V(0.45, 0, 1.3), nova: V(-0.25, 1.48 * HK, 1.35) };

  // ---------------------------------------------------------------- props
  const props = new Map<string, PropTrack>();
  for (const [id, spec] of Object.entries(film.props ?? {})) {
    const card = makeProp(spec);
    card.visible = false;
    card.renderOrder = 30; // a film's props are drawn over the world's cards and glass
    scene.add(card);
    props.set(id, { card, spec, shows: [], places: [], states: [], types: [], scale: [] });
  }

  // ---------------------------------------------------------------- reading the beats
  const faces: Record<Who, [number, Expression][]> = { engineer: [[-99, 'calm']], nova: [[-99, 'normal']] };
  const gestures: Record<Who, [Gesture, number, number, Place | undefined][]> = { engineer: [], nova: [] };
  const looks: Record<Who, [number, number, Place][]> = { engineer: [], nova: [] };
  const goes: Record<Who, { t: number; place: Place; dur: number }[]> = { engineer: [], nova: [] };
  const visions: number[] = [];
  let enter: number | null = null;
  const shotBeats: Shot[] = [];
  const steps: number[] = [];
  const callouts: [number, number, string, string][] = [];
  const brands: [number, number][] = [];

  for (const beat of beats) {
    const { at } = beat;
    for (const who of ['engineer', 'nova'] as Who[]) {
      const c: CastBeat | undefined = beat[who];
      if (!c) continue;
      if (c.face) faces[who].push([at, c.face]);
      if (c.gesture) gestures[who].push([c.gesture, at, beat.until ?? at + (SHORT_GESTURES.includes(c.gesture) ? 0.85 : 1.6), c.target]);
      if (c.look) looks[who].push([at, beat.until ?? NEVER, c.look]);
      if (c.to) goes[who].push({ t: at, place: c.to, dur: c.dur ?? 1.0 });
      if (who === 'engineer' && c.enter) enter = at;
      if (who === 'engineer' && c.vision) {
        visions.push(at);
        gestures.engineer.push(['vision', at - 0.9, at + 0.5, undefined]);
        world.op({ vision: 1 }, at);
      }
    }
    for (const op of asList(beat.world)) world.op(op, at, beat.until);
    for (const p of asList<PropBeat>(beat.prop)) {
      const track = props.get(p.id);
      if (!track) throw new Error(`no prop called ${p.id}`);
      if (p.show !== false && (p.show || p.place)) track.shows.push([at, beat.until ?? NEVER]);
      if (p.hide) { const open = track.shows.at(-1); if (open && open[1] === NEVER) open[1] = at; }
      if (p.place) track.places.push({ t: at, place: p.place, dur: 0, arc: 0 });
      if (p.to) track.places.push({ t: at, place: p.to, dur: p.dur ?? 0.8, arc: p.arc ?? 0.15 });
      if (p.state) track.states.push({ t: at, patch: p.state, dur: p.dur ?? 0 });
      if (p.type) track.types.push([at, p.dur ?? 1.2]);
      if (p.scale !== undefined) track.scale.push([at, p.scale]);
    }
    if (beat.shot) shotBeats.push({ a: at, b: NEVER, s: beat.shot });
    if (beat.hud?.step !== undefined) steps[beat.hud.step] = at;
    if (beat.hud?.callout) callouts.push([at, at + (beat.hud.for ?? 1.6), beat.hud.callout, beat.hud.tone ?? '']);
    if (beat.hud?.brand) brands.push([at, at + (beat.hud.for ?? 6)]);
  }
  shotBeats.forEach((s, i) => { s.b = shotBeats[i + 1]?.a ?? NEVER; });
  const shots = expandAuto(shotBeats, tl.lines);

  // ---------------------------------------------------------------- where things are
  const novaAt = (t: number): THREE.Vector3 => {
    let p = HOME.nova.clone();
    for (const g of goes.nova) {
      if (t < g.t) break;
      const to = place(g.place, t, false);
      const k = smoother(span(t, g.t, g.t + g.dur));
      p = p.clone().lerp(to, k).add(V(0, Math.sin(k * Math.PI) * 0.12, 0));
    }
    return p;
  };
  const engineerAt = (t: number): { p: THREE.Vector3; appear: number } => {
    let p = HOME.engineer.clone(), appear = enter === null ? 1 : smooth(span(t, enter, enter + 1.2));
    for (const g of goes.engineer) {
      if (t < g.t) break;
      // a 2.5D engineer cannot walk: he fades out as a hologram and appears at the new place
      const half = g.dur / 2;
      if (t < g.t + half) appear = Math.min(appear, 1 - smooth(span(t, g.t, g.t + half)));
      else { p = place(g.place, t, false).setY(0); appear = Math.min(appear, smooth(span(t, g.t + half, g.t + g.dur))); }
    }
    return { p, appear };
  };

  function place(p: Place, t: number, live = true): THREE.Vector3 {
    if (Array.isArray(p)) return V(...p);
    switch (p) {
      case 'camera': return camera.position.clone();
      case 'engineer': return HOME.engineer.clone().setY(1.0 * HK);
      case 'engineer.head': return live ? engineer.headWorld() : HOME.engineer.clone().setY(1.63 * HK);
      case 'engineer.hand': return live ? engineer.handWorld('L') : HOME.engineer.clone().setY(1.05 * HK);
      case 'nova': return live ? nova.root.position.clone() : novaAt(t);
      case 'nova.home': return HOME.nova.clone();
    }
    if (p.startsWith('prop:')) { const track = props.get(p.slice(5)); return track ? propAt(track, t) : V(); }
    const w = world.place(p);
    if (!w) throw new Error(`no place called ${p}`);
    return w;
  }
  const facing = (p: Place | undefined): THREE.Vector3 => (typeof p === 'string' ? world.facing(p) : V(0, 0, 1));

  // ---------------------------------------------------------------- the camera
  const wide = camera.aspect > 1.3;
  const speakerAt = (t: number): Line | undefined => tl.lines.find((l) => t >= l.start - 0.1 && t <= l.end + 0.1);
  const around = (dir: THREE.Vector3, degrees: number) => dir.clone().applyAxisAngle(V(0, 1, 0), deg(degrees));
  function frameShot(s: ShotSpec, k: number, t: number): Framing {
    const head = engineer.headWorld(), n = novaAt(t);
    let f: Framing;
    switch (s.kind) {
      case 'wide': {
        const look = V(0.1, 1.0, -1.2);
        const pos = look.clone().add(around(V(0.05, 0.25, 1).normalize(), lerp(s.from ?? -6, s.to ?? 6, smooth(k))).multiplyScalar(s.dist ?? 7.6));
        f = { pos, look, fov: s.fov ?? 40 }; break;
      }
      case 'two': {
        const mid = head.clone().add(V(0, -0.1, 0)).lerp(n, 0.5);
        const dist = s.dist ?? Math.max(2.3, head.distanceTo(n) * 2.3);
        f = { pos: mid.clone().add(around(V(0, 0, 1), s.angle ?? (s.side ?? 0.3) * 14).multiplyScalar(dist)).add(V(0, 0.06, 0)), look: mid, fov: s.fov ?? 34 }; break;
      }
      case 'engineer': {
        const look = head.clone().add(V(0, -0.12, 0));
        f = { pos: look.clone().add(around(V(0, 0, 1), s.angle ?? (s.side ?? 0.4) * 18).multiplyScalar(s.dist ?? 1.75)).add(V(0, 0.08, 0)), look, fov: s.fov ?? 30 }; break;
      }
      case 'nova': {
        f = { pos: n.clone().add(around(V(0, 0, 1), s.angle ?? (s.side ?? -0.5) * 26).multiplyScalar(s.dist ?? 1.0)).add(V(0, 0.05, 0)), look: n.clone(), fov: s.fov ?? 34 }; break;
      }
      case 'look': case 'orbit': {
        const target = s.prop ? propAt(props.get(s.prop)!, t) : place(s.at ?? 'center', t);
        const a = s.kind === 'orbit' ? lerp(s.from ?? -20, s.to ?? 20, smooth(k)) : s.angle ?? 0;
        const dir = around(s.prop ? V(0, 0, 1) : facing(s.at), a);
        f = { pos: target.clone().addScaledVector(dir, s.dist ?? 2.2).add(V(0, s.height ?? 0.2, 0)), look: target, fov: s.fov ?? 38 }; break;
      }
      case 'follow': {
        const p = propAt(props.get(s.prop!)!, t);
        f = { pos: p.clone().add(V(0.3, s.height ?? 0.25, s.dist ?? 1.6)), look: p, fov: s.fov ?? 40 }; break;
      }
      default: {
        const kk = smoother(k);
        f = { pos: V(...(s.pos ?? [0, 1.6, 4])).lerp(V(...(s.pos2 ?? s.pos ?? [0, 1.6, 4])), kk),
          look: V(...(s.look ?? [0, 1.2, 0])).lerp(V(...(s.look2 ?? s.look ?? [0, 1.2, 0])), kk), fov: s.fov ?? 38 };
      }
    }
    const push = s.push ?? 0.07;
    f.pos = f.look.clone().add(f.pos.clone().sub(f.look).multiplyScalar(1 - push * smooth(k)));
    // a wide frame puts a single character on a third, not in the middle
    if (wide && (s.kind === 'engineer' || s.kind === 'nova')) {
      const right = f.look.clone().sub(f.pos).cross(V(0, 1, 0)).normalize();
      const third = Math.tan(deg(f.fov / 2)) * camera.aspect * f.pos.distanceTo(f.look) * 0.36;
      f.look.addScaledVector(right, ((s.side ?? (s.kind === 'nova' ? -0.5 : 0.4)) >= 0 ? 1 : -1) * third);
    }
    return f;
  }

  // ---------------------------------------------------------------- the voice
  const mouthOf = (who: Who, t: number) => {
    const l = tl.lines.find((x) => x.who === who && t >= x.start && t <= x.end);
    return l ? l.env[Math.min(l.env.length - 1, Math.floor((t - l.start) * 30))] ?? 0 : 0;
  };
  const talkOf = (who: Who, t: number) =>
    Math.max(0, ...tl.lines.filter((l) => l.who === who).map((l) => pulse(t, l.start - 0.1, l.end + 0.15, 0.25)));
  const stressOf = (who: Who, t: number) => {
    let now = 0, before = 0;
    for (let i = 0; i < 4; i++) now += mouthOf(who, t - i / 30) / 4;
    for (let i = 1; i <= 12; i++) before += mouthOf(who, t - i / 30) / 12;
    return clamp((now - before) * 3);
  };
  const phase = <T>(list: [number, T][], t: number): [T, number] => {
    let i = 0;
    while (i + 1 < list.length && t >= list[i + 1][0]) i++;
    return [list[i][1], t - list[i][0]];
  };
  const gestureAt = (who: Who, t: number): GestureState | undefined => {
    let best: GestureState | undefined;
    for (const [name, a, b, target] of gestures[who]) {
      const w = pulse(t, a, b, SHORT_GESTURES.includes(name) ? 0.2 : 0.35);
      if (w > (best?.weight ?? 0)) best = { name, weight: w, time: t - a, target: target ? place(target, t) : undefined };
    }
    return best;
  };
  const lookOf = (who: Who, t: number): THREE.Vector3 => {
    const set = looks[who].filter(([a, b]) => t >= a && t < b).at(-1);
    const target = set?.[2];
    if (target === 'speaker') {
      const s = speakerAt(t);
      return s && s.who !== who ? place(s.who === 'nova' ? 'nova' : 'engineer.head', t) : camera.position.clone();
    }
    if (target) return place(target, t);
    return who === 'engineer' ? nova.root.position.clone() : engineer.headWorld();
  };

  const STEP_TIMES = film.steps.map((_, i) => steps[i] ?? NEVER);
  const hook = film.hook;
  const firstLine = tl.lines[0]?.start ?? 0.5;

  // ---------------------------------------------------------------- the frame
  return (t: number) => {
    // camera first: the characters look at it
    const shot = shots.find((s) => t >= s.a && t < s.b) ?? shots[shots.length - 1];
    const c = shot ? frameShot(shot.s, span(t, shot.a, Math.min(shot.b, tl.duration)), t) : { pos: V(0, 1.6, 4), look: V(0, 1.2, 0), fov: 38 };
    const near = engineer.minShotDistance;
    if (near && c.look.distanceTo(engineer.headWorld()) < 0.6 && c.pos.distanceTo(c.look) < near) {
      c.pos = c.look.clone().add(c.pos.clone().sub(c.look).setLength(near));
    }
    camera.position.copy(c.pos).add(V(wobble(t * 0.7, 1) * 0.01, wobble(t * 0.6, 4) * 0.008, 0));
    camera.fov = c.fov; camera.updateProjectionMatrix();
    camera.lookAt(c.look);
    camera.updateMatrixWorld(true);

    // the cast
    const at = engineerAt(t);
    const [eFace, eFaceT] = phase(faces.engineer, t);
    const v = visions.filter((x) => t >= x - 0.35).at(-1);
    const ws = world.update(t, camera);
    const glasses = v === undefined ? 0 : span(t, v - 0.35, v) * (1 - span(t, v + 0.5, v + 1.6));
    const eState: CharacterState = {
      t, position: at.p, yaw: -0.05, appear: at.appear, camera: camera.position.clone(),
      gesture: gestureAt('engineer', t), lookAt: lookOf('engineer', t), expression: eFace, expressionTime: eFaceT,
      mouth: mouthOf('engineer', t) * 0.95, talk: talkOf('engineer', t), emphasis: stressOf('engineer', t),
      blink: blinkAt(t, 0.37), vision: Math.max(glasses, ws.vision * 0.15),
    };
    engineer.apply(eState);
    const np = novaAt(t);
    const [nFace] = phase(faces.nova, t);
    const nLook = lookOf('nova', t);
    nova.apply({
      t, position: np, yaw: Math.atan2(nLook.x - np.x, nLook.z - np.z) * 0.7, lookAt: nLook, expression: nFace,
      mouth: mouthOf('nova', t), blink: blinkAt(t, 1.71), gesture: gestureAt('nova', t),
      hop: nFace === 'sparkle' || nFace === 'celebrate' ? Math.abs(Math.sin(t * 8)) * 0.04 : 0, tilt: nFace === 'confused' ? 0.22 : 0,
    });
    scene.updateMatrixWorld(true);

    // props
    for (const track of props.values()) drawProp(track, t);

    stage.renderer.toneMappingExposure = 1.1 + 0.12 * Math.max(0, ...visions.map((x) => pulse(t, x - 0.05, x + 0.4, 0.1)));
    stage.bloom.strength = lerp(0.3, 0.42, ws.vision);

    // HUD
    hud.bars(pulse(t, 0.2, end + 0.2, 0.4));
    hud.steps(STEP_TIMES.map((a, i) => span(t, a, Math.min(STEP_TIMES[i + 1] ?? end, end))));
    hud.caption(t < end ? tl.lines.find((l) => t >= l.start - 0.08 && t <= l.end + 0.3) : undefined, t);
    const co = callouts.filter(([a, b]) => t >= a && t <= b).at(-1);
    if (co) hud.callout(co[2], co[3] as '' | 'amber' | 'red', pulse(t, co[0], co[1], 0.2), co[0], t);
    else if (hook && t < firstLine + 1.4) hud.callout(hook, '', pulse(t, -1, firstLine + 1.4, 0.3), -1, t);
    else hud.callout(null, '', 0, 0, t);
    hud.end(span(t, end, end + 0.6));
    hud.brand(Math.max(0, ...brands.map(([a, b]) => pulse(t, a, b, 0.5))));
  };

  /** Where a prop is at t: the last place it was put, carried on to each later place on an arc. */
  function propAt(track: PropTrack, t: number): THREE.Vector3 {
    let p = V(0, 1.4, 0);
    for (const m of track.places) {
      if (t < m.t) break;
      const to = place(m.place, t);
      if (m.dur <= 0) { p = to; continue; }
      const k = smoother(span(t, m.t, m.t + m.dur));
      p = p.clone().lerp(to, k).add(V(0, Math.sin(k * Math.PI) * m.arc, 0));
    }
    return p;
  }

  function drawProp(track: PropTrack, t: number): void {
    const { card } = track;
    const show = track.shows.find(([a, b]) => t >= a - 0.001 && t < b + 0.3);
    card.visible = !!show;
    if (!show) return;
    const [a, b] = show;
    const fade = Math.min(span(t, a, a + 0.25), 1 - span(t, b, b + 0.3));
    card.position.copy(propAt(track, t));
    let scale = 1;
    for (const [at, s] of track.scale) if (t >= at) scale = s;
    card.scale.setScalar(scale * lerp(0.7, 1, backOut(span(t, a, a + 0.3))));
    card.material.opacity = fade;
    card.quaternion.copy(camera.quaternion);
    // state: patches in order; numbers tween over the beat's dur
    const state: Record<string, unknown> = { ...initialState(track.spec) };
    for (const s of track.states) {
      if (t < s.t) break;
      for (const [key, value] of Object.entries(s.patch)) {
        const prev = state[key];
        state[key] = typeof value === 'number' && typeof prev === 'number' && s.dur > 0 ? lerp(prev, value, smooth(span(t, s.t, s.t + s.dur))) : value;
      }
    }
    if (track.spec.kind === 'code') {
      const rows = (track.spec.code ?? '').replace(/\s+$/, '').split('\n').length;
      const typing = track.types.filter(([at]) => t >= at).at(-1);
      (state as unknown as CodeState).progress = Array.from({ length: rows }, (_, i) =>
        typing ? clamp(span(t, typing[0], typing[0] + typing[1]) * rows - i) : 1);
    }
    if (track.spec.kind === 'gauge' || track.spec.kind === 'bits' || track.spec.kind === 'grid' || track.spec.kind === 'dial') for (const k of Object.keys(state)) if (typeof state[k] === 'number') state[k] = +(state[k] as number).toFixed(2);
    card.set(state);
  }
}

function initialState(spec: PropSpec): Record<string, unknown> {
  switch (spec.kind) {
    case 'key': return { dim: false };
    case 'code': return { hl: -1, progress: [] };
    case 'bits': return { hl: 0, extra: 0, result: 0 };
    case 'label': return { tone: spec.tone ?? 'white' };
    case 'gauge': return { value: 0 };
    case 'mark': return { kind: spec.text === 'check' ? 'check' : 'x' };
    case 'node': return { tone: spec.tone ?? 'cyan', last: true, ok: false };
    case 'grid': return { cells: spec.max ?? 128, filled: 0, moved: 1 };
    case 'dial': return { now: 0.1, frozen: 0.05, warn: 0 };
  }
}

function makeProp(spec: PropSpec): Card<any> {
  switch (spec.kind) {
    case 'key': return keyCard(spec.text ?? '', (spec.tone as 'amber' | 'cyan') ?? 'amber');
    case 'code': return codePanel(spec.file ?? '', colour(spec.code ?? ''), spec.width);
    case 'bits': return bitsCard(typeof spec.value === 'string' ? parseInt(spec.value, 2) | 0 : spec.value ?? 0, spec.low ?? 4, spec.result ?? '');
    case 'label': return labelCard(spec.text ?? '', spec.sub ?? '', spec.tone ?? 'white', spec.size ?? 1);
    case 'gauge': return gaugeCard(spec.text ?? '', spec.max ?? 100, spec.limit ?? 75);
    case 'mark': return markCard(spec.text === 'check' ? 'check' : 'x', spec.size ?? 1);
    case 'node': return nodeCard(spec.key ?? '', spec.text ?? '', spec.hash ?? '');
    case 'grid': return gridCard();
    case 'dial': return dialCard();
  }
}

/** A shot of kind "auto" becomes one framing per line: the speaker close, and now and then both. */
function expandAuto(shots: Shot[], lines: Line[]): Shot[] {
  const out: Shot[] = [];
  for (const s of shots) {
    if (s.s.kind !== 'auto') { out.push(s); continue; }
    const inside = lines.filter((l) => l.end > s.a && l.start < s.b);
    let last = '';
    inside.forEach((l, i) => {
      const a = i === 0 ? s.a : Math.max(s.a, l.start - 0.15);
      const b = i + 1 < inside.length ? Math.max(a + 0.5, inside[i + 1].start - 0.15) : s.b;
      let kind: ShotSpec = l.who === 'nova' ? { kind: 'nova', side: i % 4 < 2 ? -0.5 : 0.4 } : { kind: 'engineer', side: i % 4 < 2 ? 0.4 : -0.3 };
      if (i % 3 === 2 || `${kind.kind}${kind.side}` === last) kind = { kind: 'two', side: i % 2 ? 0.3 : -0.2 };
      last = `${kind.kind}${kind.side}`;
      out.push({ a, b, s: { ...kind, push: s.s.push } });
    });
    if (!inside.length) out.push({ ...s, s: { kind: 'two' } });
  }
  return out;
}

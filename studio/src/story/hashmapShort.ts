// The HashMap quick Short as a function of time: camera shots, what the engineer and Nova do,
// the props, the HUD. Times come from the spoken timeline (lines and events).
import * as THREE from 'three';
import type { Stage } from '../app/stage';
import type { Cast } from '../characters';
import type { CharacterState, Expression, GestureState, Gesture } from '../characters/types';
import { HashMapWorld } from '../world/hashmapWorld';
import { keyCard, codePanel, bitsStrip, nodeCard, EntrySlab, INK, javaHash, spread, bits32, type Token } from '../props/cards';
import { FrameHud, type Timeline } from '../hud/hud';
import { blinkAt, clamp, deg, easeIn, easeOut, lerp, pulse, smooth, smoother, span, wobble, V } from '../util/math';
import { glow, PALETTE } from '../util/look';

type Shot = [number, number, (k: number, t: number) => { pos: THREE.Vector3; look: THREE.Vector3; fov: number }];

export function hashmapShort(stage: Stage, cast: Cast, hud: FrameHud, tl: Timeline): (t: number) => void {
  const { scene, camera } = stage;
  const ev = tl.events;
  const L = Object.fromEntries(tl.lines.map((l) => [l.id, l]));
  const said = (id: string, key: string, which = 0, end = false): number => {
    const hits = L[id].said.filter((w) => w.k === key);
    if (!hits.length) return end ? L[id].end : L[id].start;
    const w = hits[Math.min(which, hits.length - 1)];
    return end ? w.e : w.s;
  };

  const world = new HashMapWorld(scene);
  const { engineer, nova } = cast;
  scene.add(engineer.root, nova.root);

  // ------------------------------------------------------------------ props
  const C = V(0, 1.4, -1.3);                       // where the key is hashed
  const A_IN = C.clone().add(V(0, 0, 0.8)), B_OUT = C.clone().add(V(0, 0, -0.25));
  const ring = new THREE.Group(); ring.position.copy(C); scene.add(ring);
  ring.add(new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.01, 10, 96), glow(PALETTE.cyan, 1.1)));
  const ticks = new THREE.Group(); ring.add(ticks);
  for (let k = 0; k < 24; k++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.045, 0.008), glow(PALETTE.cyanSoft, 1.0));
    const a = (k / 24) * Math.PI * 2; tick.position.set(Math.cos(a) * 0.31, Math.sin(a) * 0.31, 0); tick.rotation.z = a + Math.PI / 2; ticks.add(tick);
  }
  const key1 = keyCard('user:42', 'amber'); scene.add(key1);
  const key2 = keyCard('user:97', 'amber'); scene.add(key2);
  const H42 = javaHash('user:42'), S42 = spread(H42);
  const K = INK.kw, TY = INK.type, STR = INK.str, CM = INK.dim, TX = INK.text, NUM = INK.num;
  const hashCode = codePanel('HashMap.java', [
    [['int ', TY], ['h = ', TX], ['"user:42"', STR], ['.hashCode();', TX]],
    [['// h = ', CM], [String(H42), NUM]],
    [['return ', K], ['h ^ (h >>> 16);', TX], ['  // ', CM], [String(S42), NUM]],
  ] as Token[][]);
  const indexCode = codePanel('HashMap.java', [
    [['int ', TY], ['i = (n - 1) & hash;', TX], ['  // n = 16', CM]],
    [['// i = ', CM], ['7', NUM], ['   → tab[7]', CM]],
  ] as Token[][]);
  const equalsCode = codePanel('HashMap.getNode', [
    [['if ', K], ['(e.hash == hash &&', TX]],
    [['    key.', TX], ['equals', TY], ['(e.key))  ', TX], ['return ', K], ['e;', TX]],
  ] as Token[][]);
  const strip = bitsStrip(bits32(S42), '0111 → bucket 7');
  scene.add(hashCode, indexCode, equalsCode, strip);
  const nodeData: [string, string, string][] = [['user:42', 'alice', String(S42).slice(0, 5) + '…'], ['user:97', 'bob', '…0111'],
    ['user:20', 'cara', '…0111'], ['user:31', 'dev', '…0111'], ['user:53', 'eli', '…0111'], ['user:64', 'fay', '…0111'], ['user:75', 'gus', '…0111'], ['user:86', 'hana', '…0111']];
  const nodes = nodeData.map(([k, v, h]) => { const n = nodeCard(k, v, h); scene.add(n); return n; });
  const links = nodes.slice(1).map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), glow(PALETTE.cyanSoft, 1.0)); scene.add(m); return m; });
  const slab1 = new EntrySlab('user:42'), slab2 = new EntrySlab('user:97');
  scene.add(slab1, slab2);
  const ghosts = Array.from({ length: 15 }, (_, i) => {
    const a = deg(-70 + ((i + 0.5) * 140) / 15);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.1, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x5fb8d8, transparent: true, opacity: 0, wireframe: true, depthWrite: false }));
    m.position.set(4.35 * Math.sin(a), 0.8, -4.35 * Math.cos(a)); scene.add(m); return m;
  });

  const B7 = world.buckets[7];
  const side7 = V(B7.front.z, 0, -B7.front.x);
  const top7 = B7.pos.clone().setY(1.95);
  const flight = new THREE.CatmullRomCurve3([B_OUT.clone(), V(0.45, 2.05, -2.2), V(0.05, 2.15, -3.0), top7.clone(), world.slot(7, 0)]);
  const keyFlight = (t: number) => flight.getPoint(smoother(span(t, ev.seven - 0.9, ev.jump - 0.05)));

  // ------------------------------------------------------------------ the cast's moves
  // framing follows the engineer's real head height (a VRoid model is not exactly 180 cm)
  engineer.apply({ t: 0, position: V(), yaw: 0 }); engineer.root.updateMatrixWorld(true);
  const HK = clamp(engineer.headWorld().y / 1.6, 0.8, 1.2);
  const E = V(0.45, 0, 1.3), NOVA_HOME = V(-0.25, 1.48 * HK, 1.35);
  const WALK: [number, number] = [ev.open2 - 0.2, L.e1.start + 1.9], WALK_FROM = V(1.2, 0, -1.6);
  const walks = engineer.canWalk !== false;
  const engAt = (t: number) => (walks ? WALK_FROM.clone().lerp(E, smoother(span(t, WALK[0], WALK[1]))) : E.clone());
  const engHead = () => engineer.headWorld();

  function novaPos(t: number): THREE.Vector3 {
    const f0 = world.front(0, 0.6, 1.15), f1 = world.front(1, 0.6, 1.15), f2 = world.front(2, 0.6, 1.15);
    if (t < ev.open0 - 0.3) return V(1.0, 2.6, 2.4).lerp(f0, smoother(span(t, 0.2, ev.open0 - 0.4)));
    if (t < ev.open1 - 0.2) return f0.clone().lerp(f1, smoother(span(t, ev.open0 + 0.35, ev.open1 - 0.2)));
    if (t < ev.open2 - 0.2) return f1.clone().lerp(f2, smoother(span(t, ev.open1 + 0.35, ev.open2 - 0.2)));
    if (t < L.n2.start) return f2.clone().lerp(NOVA_HOME, smoother(span(t, L.e1.start + 0.5, L.n2.start - 0.1)));
    if (t < ev.seven - 0.7) return NOVA_HOME.clone();
    const near7 = world.front(7, 0.75, 1.5).addScaledVector(side7, -0.45);
    if (t < L.e5.start + 0.3) return NOVA_HOME.clone().lerp(near7, smoother(span(t, ev.seven - 0.6, ev.jump + 0.2)));
    if (t < ev.drop + 0.4) return near7.clone().lerp(NOVA_HOME, smoother(span(t, L.e5.start + 0.3, L.e5.start + 1.6)));
    const scared = V(0.0, 1.45 * HK, 1.95);
    if (t < L.e6.start) return NOVA_HOME.clone().lerp(scared, smoother(span(t, ev.drop + 0.4, ev.drop + 1.0)))
      .add(V(Math.sin(t * 41) * 0.008 * pulse(t, L.n4.start, L.n4.end), 0, 0));
    const peek = world.front(7, 0.9, 1.95).addScaledVector(side7, -0.62);
    if (t < ev.end) return scared.clone().lerp(peek, smoother(span(t, L.e6.start, L.e6.start + 1.3)));
    return peek.clone().lerp(V(-0.2, 1.45 * HK, 1.45), smoother(span(t, ev.end, ev.end + 0.9)));
  }

  const mouthOf = (who: 'engineer' | 'nova', t: number) => {
    const l = tl.lines.find((x) => x.who === who && t >= x.start && t <= x.end);
    return l ? l.env[Math.min(l.env.length - 1, Math.floor((t - l.start) * 30))] ?? 0 : 0;
  };
  const talkOf = (who: 'engineer' | 'nova', t: number) =>
    Math.max(0, ...tl.lines.filter((l) => l.who === who).map((l) => pulse(t, l.start - 0.1, l.end + 0.15, 0.25)));
  // a stressed syllable: the voice now (last 0.13 s) is louder than over the last 0.4 s
  const stressOf = (who: 'engineer' | 'nova', t: number) => {
    let now = 0, before = 0;
    for (let i = 0; i < 4; i++) now += mouthOf(who, t - i / 30) / 4;
    for (let i = 1; i <= 12; i++) before += mouthOf(who, t - i / 30) / 12;
    return clamp((now - before) * 3);
  };
  /** The entry of a [start, value] list in effect at t, and the seconds since it began. */
  const phase = <T>(list: [number, T][], t: number): [T, number] => {
    let i = 0;
    while (i + 1 < list.length && t >= list[i + 1][0]) i++;
    return [list[i][1], t - list[i][0]];
  };
  const gesture = (t: number, list: [Gesture, number, number, THREE.Vector3?][]): GestureState | undefined => {
    let best: GestureState | undefined;
    for (const [name, a, b, target] of list) {
      const w = pulse(t, a, b, 0.35);
      if (w > (best?.weight ?? 0)) best = { name, weight: w, time: t - a, target };
    }
    return best;
  };
  const vision = (t: number) => smooth(span(t, ev.vision, ev.vision + 1.2));

  function engineerState(t: number): CharacterState {
    const walkK = span(t, WALK[0], WALK[1]);
    const walking = walks && walkK > 0 && walkK < 1;
    let yaw = walking ? Math.atan2(E.x - WALK_FROM.x, E.z - WALK_FROM.z) : -0.05;
    const turn = (to: number, k: number) => { yaw = lerp(yaw, to, smooth(k)); };
    turn(Math.PI - 0.12, span(t, L.e3.start - 0.5, L.e3.start + 0.2));
    turn(-0.15, span(t, L.e5.start - 0.4, L.e5.start + 0.2));
    turn(Math.PI - 0.05, span(t, ev.drop, ev.drop + 0.35));
    turn(-0.7, span(t, ev.drop + 2.1, ev.drop + 2.45));
    turn(Math.PI - 0.08, span(t, L.e6.start - 0.2, L.e6.start + 0.3));
    turn(0.05, span(t, ev.end - 0.1, ev.end + 0.5));
    const [expr, exprTime] = phase<Expression>([
      [-99, 'focus'], [L.n2.start, 'smirk'], [ev.vision - 0.6, 'focus'], [L.e3.start, 'calm'], [L.n3.start, 'smirk'],
      [ev.o1 - 0.3, 'smile'], [ev.drop + 0.95, 'surprised'], [ev.drop + 2.15, 'smirk'], [L.e6.start, 'calm'],
      [L.n5.start, 'thinking'], [L.e7.start, 'smirk'], [ev.end, 'smile'],
    ], t);
    let lookAt: THREE.Vector3 | null = nova.headWorld();
    if (t > L.e2.start - 0.3 && t < ev.vision + 0.6) lookAt = camera.position.clone();
    else if (t > L.e3.start - 0.3 && t < ev.jump + 0.4) lookAt = key1.position.clone();
    else if (t > L.e5.start - 0.2 && t < ev.drop) lookAt = camera.position.clone();
    else if (t > ev.drop && t < ev.drop + 2.1) lookAt = world.slot(7, 1);
    else if (t > L.e6.start - 0.2 && t < ev.end) lookAt = top7.clone().setY(1.6);
    else if (t >= ev.end) lookAt = camera.position.clone();
    const g = gesture(t, [
      ['nod', said('e1', 'stop'), said('e1', 'stop') + 0.8],
      ['shake', said('e1', 'never') - 0.05, said('e1', 'never') + 0.8],
      ['vision', ev.vision - 0.9, ev.vision + 0.5],
      ['present', L.e3.start - 0.3, L.e3.start + 1.2],
      ['explain', L.e3.start + 1.2, ev.seven - 1.0],
      ['point', ev.seven - 1.0, ev.jump + 0.3, world.slot(7, 0)],
      ['nod', ev.jump + 0.1, ev.jump + 1.1],
      ['shake', said('e5', 'none') - 0.05, said('e5', 'none') + 0.8],
      ['explain', ev.o1 - 1.0, L.e5.end],
      ['point', L.e6.start + 0.3, said('e6', 'equals'), world.slot(7, 1)],
      ['explain', said('e6', 'equals'), L.e6.end],
      ['think', L.n5.start, L.e7.start + 0.25],
      ['explain', L.e7.start + 0.25, ev.end - 0.2],
      ['thumbsUp', ev.end + 0.4, 99],
    ]);
    return {
      t, position: engAt(t), yaw, walk: walking ? 1 : 0, walkPhase: walkK * Math.PI * 2 * 2.6,
      appear: walks ? 1 : smooth(span(t, WALK[0] + 0.3, WALK[0] + 1.5)), camera: camera.position.clone(),
      gesture: g, lookAt, expression: expr, expressionTime: exprTime,
      mouth: mouthOf('engineer', t) * 0.95, talk: talkOf('engineer', t), emphasis: stressOf('engineer', t), blink: blinkAt(t, 0.37),
      vision: Math.max(span(t, ev.vision - 0.35, ev.vision) * (1 - span(t, ev.vision + 0.5, ev.vision + 1.6)), vision(t) * 0.15),
    };
  }

  function novaState(t: number): CharacterState {
    const p = novaPos(t);
    const opened = [ev.open0, ev.open1, ev.open2].some((o) => t > o + 0.2 && t < o + 0.9);
    let expr: Expression = 'normal';
    if (t < L.e1.start) expr = opened ? 'confused' : 'normal';
    else if (t < L.n2.start) expr = 'surprised'; else if (t < L.e2.start) expr = 'confused';
    else if (t < ev.vision - 0.2) expr = 'normal'; else if (t < ev.vision + 1.2) expr = 'surprised';
    else if (t < ev.jump) expr = 'normal'; else if (t < L.e5.start) expr = 'sparkle'; else if (t < ev.drop) expr = 'happy';
    else if (t < ev.drop + 0.9) expr = 'surprised'; else if (t < L.e6.start) expr = 'panic'; else if (t < L.n5.start) expr = 'squint';
    else if (t < ev.part2) expr = 'surprised'; else if (t < ev.end) expr = 'sparkle'; else expr = 'celebrate';
    let lookAt: THREE.Vector3 = engHead();
    const searching = [0, 1, 2].find((i) => t < [ev.open0, ev.open1, ev.open2][i] + 0.9);
    if (t < L.e1.start && searching !== undefined) lookAt = world.slot(searching, 2);
    else if (t > L.e3.start && t < ev.jump + 0.2) lookAt = key1.position.clone();
    else if (t > ev.jump && t < L.e5.start) lookAt = camera.position.clone();
    else if (t > ev.drop && t < ev.drop + 1.0) lookAt = world.slot(7, 1);
    else if (t > ev.drop + 1.0 && t < L.e6.start) lookAt = camera.position.clone();
    else if (t > L.e6.start && t < ev.end) lookAt = top7.clone().setY(2.0);
    else if (t >= ev.end) lookAt = camera.position.clone();
    const yawTo = (target: THREE.Vector3) => Math.atan2(target.x - p.x, target.z - p.z);
    const g = gesture(t, [
      ['point', ev.open0 + 0.1, ev.open0 + 0.8], ['point', ev.open1 + 0.1, ev.open1 + 0.8], ['point', ev.open2 + 0.1, ev.open2 + 0.8],
      ['celebrate', ev.jump + 0.1, L.e5.start], ['panic', ev.drop + 0.9, L.e6.start], ['think', L.n5.start - 0.2, said('n5', 'bucket', 0, true)],
      ['explain', L.n2.start, L.n2.end], ['wave', ev.end + 0.5, 99],
    ]);
    return {
      t, position: p, yaw: yawTo(lookAt) * (t < L.e1.start ? 1 : 0.7), lookAt, expression: expr, mouth: mouthOf('nova', t), blink: blinkAt(t, 1.71),
      gesture: g, hop: expr === 'sparkle' || expr === 'celebrate' ? Math.abs(Math.sin(t * 8)) * 0.04 : 0,
      tilt: expr === 'confused' ? 0.22 : 0,
    };
  }

  // ------------------------------------------------------------------ camera shots
  const hand = (t: number) => V(wobble(t * 0.7, 1) * 0.01, wobble(t * 0.6, 4) * 0.008, 0);
  const shots: Shot[] = [
    [0, 2.3, (k) => ({ pos: V(0.3, 2.6, 5.4).lerp(V(-1.1, 1.9, 3.1), smoother(k)), look: V(0, 1.0, -2.4).lerp(V(-2.5, 1.0, -1.4), smoother(k)), fov: 42 })],
    [2.3, 5.2, (_k, t) => { const n = novaPos(t), f = world.buckets[1].front, s = V(f.z, 0, -f.x);
      return { pos: world.buckets[1].pos.clone().addScaledVector(f, -1.5).addScaledVector(s, 0.25).setY(1.3), look: n.clone().add(V(0, -0.08, 0)), fov: 40 }; }],
    [5.2, 8.55, (k, t) => { const w = engAt(t);
      return { pos: V(0.95, 0.6, 5.0).lerp(V(0.8, 0.8, 4.3), smooth(k)), look: V(w.x * 0.85, 1.2 * HK, w.z), fov: 36 }; }],
    [8.55, 11.3, (k) => ({ pos: V(0.12, 1.5 * HK, 4.0).lerp(V(0.12, 1.48 * HK, 3.65), smooth(k)), look: V(0.12, 1.36 * HK, 1.3), fov: 34 })],
    [11.3, ev.vision, (k) => ({ pos: V(0.66, 1.64 * HK, 2.6).lerp(V(0.6, 1.63 * HK, 2.32), smooth(k)), look: V(0.45, 1.58 * HK, 1.3), fov: 30 })],
    [ev.vision, L.e3.start + 0.2, (k) => ({ pos: V(0.6, 1.63 * HK, 2.32).lerp(V(-0.4, 2.3, 4.3), easeOut(k)), look: V(0.45, 1.58 * HK, 1.3).lerp(V(0, 1.3, -1.2), easeOut(k)), fov: lerp(30, 40, easeOut(k)) })],
    [L.e3.start + 0.2, L.e4.start + 0.1, (k) => { const a = lerp(deg(24), deg(-10), smooth(k));
      return { pos: V(C.x + Math.sin(a) * 2.2, 1.62, C.z + Math.cos(a) * 2.2), look: C.clone().add(V(0, 0.26, 0)), fov: 40 }; }],
    [L.e4.start + 0.1, ev.seven - 0.95, (k) => ({ pos: V(0.1, 1.78, C.z + 2.4).lerp(V(0.05, 1.72, C.z + 2.05), smooth(k)), look: C.clone().add(V(0, lerp(0.42, 0.5, k), 0)), fov: 40 })],
    [ev.seven - 0.95, ev.jump + 0.45, (_k, t) => { const p = keyFlight(t), ahead = keyFlight(t + 0.25);
      const back = p.clone().sub(ahead); if (back.lengthSq() < 1e-6) back.set(0, 0, 1); back.normalize();
      return { pos: p.clone().addScaledVector(back, 1.8).add(V(0.25, 0.12, 0)).setY(Math.max(1.5, p.y + 0.1)), look: ahead.clone().lerp(top7, 0.45).setY(Math.max(1.3, ahead.y - 0.05)), fov: 40 }; }],
    [ev.jump + 0.45, L.e5.start, (k, t) => { const n = novaPos(t);
      return { pos: n.clone().add(V(0.75, 0.05, 1.35 - k * 0.15)), look: n.clone().lerp(world.slot(7, 1), 0.3), fov: 38 }; }],
    [L.e5.start, ev.drop, (k) => ({ pos: V(1.15, 1.52 * HK, 3.7).lerp(V(0.98, 1.5 * HK, 3.35), smooth(k)), look: V(0.35, 1.35 * HK, 1.3), fov: 34 })],
    [ev.drop, ev.drop + 1.0, (k) => ({ pos: world.front(7, lerp(2.3, 2.0, smooth(k)), 1.25).addScaledVector(side7, 0.3), look: world.front(7, 0, 0.92), fov: 40 })],
    // the engineer's reaction: a start ("!")
    [ev.drop + 1.0, ev.drop + 2.2, (k) => ({ pos: V(0.8, 1.6 * HK, 3.05).lerp(V(0.74, 1.6 * HK, 2.9), easeOut(k)), look: V(0.42, 1.56 * HK, 1.3), fov: 30 })],
    [ev.drop + 2.2, L.e6.start, (k, t) => { const n = novaPos(t);
      return { pos: n.clone().add(V(0.22, 0.06, 0.95 - k * 0.12)), look: n.clone().add(V(0, -0.03, 0)), fov: 34 }; }],
    [L.e6.start, L.n5.start, (k) => ({ pos: world.front(7, lerp(3.1, 2.7, smooth(k)), 2.12).addScaledVector(side7, 0.25), look: world.front(7, 0.3, 2.06), fov: 40 })],
    [L.n5.start, L.n5.end - 0.2, (k) => ({ pos: world.front(7, lerp(2.7, 4.6, smooth(k)), lerp(2.12, 1.5, k)).addScaledVector(side7, 0.25), look: world.front(7, 0.3, lerp(2.06, 1.25, smooth(k))), fov: 42 })],
    // the engineer thinks it over (a thought bubble), then answers
    [L.n5.end - 0.2, L.e7.start + 0.6, (k) => ({ pos: V(0.56, 1.64 * HK, 3.05).lerp(V(0.54, 1.66 * HK, 2.9), smooth(k)), look: V(0.5, 1.66 * HK, 1.3), fov: 32 })],
    [L.e7.start + 0.6, ev.end, (k) => { const c = world.front(7, 0.3, 1.85); const a = lerp(deg(-16), deg(14), smooth(k));
      return { pos: c.clone().addScaledVector(B7.front, 4.0 * Math.cos(a)).addScaledVector(side7, 4.0 * Math.sin(a)).add(V(0, 0.3, 0)), look: c, fov: 40 }; }],
    [ev.end, 999, (k) => ({ pos: V(0.2, 1.5 * HK, 3.75).lerp(V(0.22, 1.5 * HK, 3.3), smooth(k)), look: V(0.15, 1.32 * HK, 1.3), fov: 36 })],
  ];

  const STEPS: [number, number][] = [[0.55, ev.vision], [ev.vision, L.e4.start], [L.e4.start, ev.drop], [ev.drop, L.e7.start], [L.e7.start, ev.end]];
  const chainAt = (i: number) => world.front(7, 0.32, 2.25 - i * 0.29);
  const TREE: [number, number][] = [[0, 2.5], [-0.62, 2.05], [0.62, 2.05], [-0.93, 1.6], [-0.31, 1.6], [0.31, 1.6], [0.93, 1.6], [-1.08, 1.15]];
  const treeAt = (i: number) => world.front(7, 0.32, TREE[i][1]).addScaledVector(side7, TREE[i][0]);
  const PARENT = [0, 0, 0, 1, 1, 2, 2, 3];

  // ------------------------------------------------------------------ the frame
  return (t: number) => {
    // camera first: the characters look at it
    const shot = shots.find(([a, b]) => t >= a && t < b) ?? shots[shots.length - 1];
    const c = shot[2](span(t, shot[0], Math.min(shot[1], tl.duration)), t);
    const shake = pulse(t, ev.drop + 0.45, ev.drop + 0.85, 0.05) * 0.02;
    // keep a 2.5D engineer from being filmed closer than its art allows
    const near = engineer.minShotDistance;
    if (near && c.look.distanceTo(engineer.headWorld()) < 0.6 && c.pos.distanceTo(c.look) < near) {
      c.pos = c.look.clone().add(c.pos.clone().sub(c.look).setLength(near));
    }
    camera.position.copy(c.pos).add(hand(t)).add(V(Math.sin(t * 73) * shake, Math.sin(t * 61) * shake, 0));
    camera.fov = c.fov; camera.updateProjectionMatrix();
    camera.lookAt(c.look);
    camera.updateMatrixWorld(true);
    // characters first: props hang off their hands and heads
    engineer.apply(engineerState(t));
    nova.apply(novaState(t));
    scene.updateMatrixWorld(true);

    // world: buckets, System Vision
    const v = vision(t);
    world.setVision(v, span(t, ev.vision, ev.vision + 1.5), t);
    [ev.open0, ev.open1, ev.open2].forEach((o, i) => world.setTone(i, t > o - 0.05 && t < ev.vision ? 'searched' : 'idle'));
    world.setTone(7, t > ev.drop + 0.45 && t < L.e6.start ? 'alarm' : t > ev.jump - 0.2 ? 'active' : 'idle');
    B7.group.position.copy(B7.pos).addScaledVector(side7, Math.sin(t * 60) * 0.015 * pulse(t, ev.drop + 0.45, ev.drop + 0.9, 0.05));
    ghosts.forEach((g, i) => { g.material.opacity = pulse(t, said('e7', 'grows') - 0.1 + i * 0.03, said('e7', 'tree') - 0.4, 0.2) * 0.35; });

    // the ring and the key
    ring.visible = t > ev.vision + 0.6 && t < ev.seven;
    ring.scale.setScalar(Math.max(0.001, easeOut(span(t, ev.vision + 0.6, L.e3.start + 0.6)) * (1 - span(t, ev.seven - 1.0, ev.seven - 0.6))));
    ticks.rotation.z = t * (t > ev.hash - 0.4 && t < ev.mix + 1 ? 3.5 : 0.6);
    ring.lookAt(camera.position);
    key1.visible = t > L.e3.start - 0.3 && t < ev.jump + 0.4;
    if (key1.visible) {
      let p: THREE.Vector3;
      if (t < L.e3.start + 1.2) p = engineer.handWorld('L').add(V(0, 0.12, 0)).lerp(A_IN, smoother(span(t, L.e3.start + 0.2, L.e3.start + 1.2)));
      else if (t < ev.hash + 0.1) p = A_IN.clone().lerp(B_OUT, smoother(span(t, ev.hash - 0.9, ev.hash + 0.1)));
      else if (t < ev.seven - 0.9) p = B_OUT.clone().add(V(0, Math.sin(t * 2) * 0.015, 0));
      else p = keyFlight(t);
      key1.position.copy(p);
      key1.scale.setScalar(lerp(1, 0.5, span(t, ev.jump - 0.4, ev.jump)));
      key1.material.opacity = 1 - span(t, ev.jump - 0.1, ev.jump + 0.3);
    }
    slab1.visible = t > ev.jump - 0.15 && t < ev.end + 0.3;
    slab1.position.copy(world.slot(7, 0)); slab1.lookAt(slab1.position.clone().add(B7.front));
    slab1.tone(t > ev.drop + 0.45 && t < L.e6.start ? 'red' : 'amber');
    key2.visible = t > ev.drop && t < ev.drop + 0.55;
    if (key2.visible) {
      const k = easeIn(span(t, ev.drop, ev.drop + 0.45));
      key2.position.copy(top7.clone().setY(lerp(3.2, 0.55, k)));
      key2.material.opacity = 1 - span(t, ev.drop + 0.4, ev.drop + 0.55);
    }
    slab2.visible = t > ev.drop + 0.42 && t < ev.end + 0.3;
    slab2.position.copy(world.slot(7, 1)).add(V(0, Math.max(0, Math.sin(span(t, ev.drop + 0.45, ev.drop + 0.8) * Math.PI)) * 0.05, 0));
    slab2.lookAt(slab2.position.clone().add(B7.front));
    slab2.tone(t > ev.drop + 0.45 && t < L.e6.start ? 'red' : 'amber');

    // code panels share one place above the ring, in turn
    const bucketAt = said('e4', 'bucket');
    hashCode.visible = t > ev.hash - 0.3 && t < ev.bits;
    hashCode.position.copy(C).add(V(0, 0.62, 0.05));
    hashCode.set({ progress: [span(t, ev.hash - 0.2, ev.hash + 0.7), span(t, ev.hash + 0.6, ev.hash + 0.9), span(t, ev.mix - 0.1, ev.mix + 0.9)], hl: t > ev.mix ? 2 : t > ev.hash ? 0 : -1 });
    hashCode.material.opacity = pulse(t, ev.hash - 0.3, ev.bits, 0.25);
    strip.visible = t > ev.bits - 0.15 && t < bucketAt + 0.35;
    strip.position.copy(C).add(V(0, 0.62, 0.06));
    strip.set({ hl: +smooth(span(t, said('e4', 'zero') - 0.2, said('e4', 'zero') + 0.3)).toFixed(2), result: +smooth(span(t, bucketAt - 0.1, bucketAt + 0.3)).toFixed(2) });
    strip.material.opacity = pulse(t, ev.bits - 0.15, bucketAt + 0.35, 0.2);
    indexCode.visible = t > bucketAt + 0.15 && t < ev.seven - 0.6;
    indexCode.position.copy(C).add(V(0, 0.62, 0.07));
    indexCode.material.opacity = pulse(t, bucketAt + 0.15, ev.seven - 0.6, 0.2);

    // the chain rises out of bucket 7, grows to eight, becomes a tree
    const morph = smoother(span(t, said('e7', 'tree') - 0.7, said('e7', 'tree') + 0.6));
    nodes.forEach((n, i) => {
      const appear = i < 2 ? span(t, said('e6', 'chain') - 0.5 + i * 0.35, said('e6', 'chain') + i * 0.35)
        : span(t, ev.eight - 1.25 + (i - 2) * 0.2, ev.eight - 1.05 + (i - 2) * 0.2);
      n.visible = appear > 0 && t < ev.end + 0.3;
      if (!n.visible) return;
      const rise = 1 - easeOut(appear);
      n.position.copy(chainAt(i).lerp(treeAt(i), morph)).add(V(0, -rise * 0.4, 0));
      n.scale.setScalar(lerp(1, 0.6, morph) * lerp(0.6, 1, easeOut(appear)));
      n.material.opacity = appear * (1 - span(t, ev.end, ev.end + 0.3));
      const ok = i === 1 && t > ev.equals - 0.1 && t < L.n5.start;
      const red = t > ev.eight - 0.2 && t < said('e7', 'tree') - 0.7;
      n.set({ tone: ok ? 'green' : red ? 'red' : i < 2 ? 'amber' : 'cyan', last: i === (t > ev.eight - 1.3 ? 7 : 1), ok });
    });
    links.forEach((m, j) => {
      const b = nodes[j + 1], a = morph > 0.5 ? nodes[PARENT[j + 1]] : nodes[j];
      m.visible = a.visible && b.visible;
      if (!m.visible) return;
      const from = a.position.clone().add(V(0, -0.135 * a.scale.y, 0)), to = b.position.clone().add(V(0, 0.135 * b.scale.y, 0));
      m.position.copy(from).lerp(to, 0.5); m.scale.set(1, Math.max(0.001, from.distanceTo(to)), 1);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), to.sub(from).normalize());
    });
    equalsCode.visible = t > ev.equals - 0.4 && t < L.n5.start + 0.2;
    equalsCode.position.copy(world.front(7, 0.45, 2.62));
    equalsCode.set({ progress: [span(t, ev.equals - 0.4, ev.equals + 0.1), span(t, ev.equals, ev.equals + 0.6)], hl: -1 });
    equalsCode.material.opacity = pulse(t, ev.equals - 0.4, L.n5.start + 0.2, 0.2);

    for (const card of [key1, key2, hashCode, indexCode, strip, equalsCode, ...nodes]) card.quaternion.copy(camera.quaternion);
    stage.renderer.toneMappingExposure = 1.1 + 0.12 * pulse(t, ev.vision - 0.05, ev.vision + 0.4, 0.1);
    stage.bloom.strength = lerp(0.3, 0.42, v);

    // HUD
    hud.bars(pulse(t, 0.2, ev.end + 0.2, 0.4));
    hud.steps(STEPS.map(([a, b]) => span(t, a, b)));
    hud.caption(t < ev.end ? tl.lines.find((l) => t >= l.start - 0.08 && t <= l.end + 0.3) : undefined, t);
    const callouts: [string, '' | 'amber' | 'red', number, number][] = [
      ['HASHMAP NEVER SEARCHES', '', -1, L.n1.start + 1.6],
      ['ONE JUMP', 'amber', ev.jump - 0.1, ev.jump + 1.4], ['O(1)  on average', '', ev.o1 - 0.1, L.e5.end],
      ['COLLISION', 'red', ev.drop + 0.45, ev.drop + 2.2], ['8 KEYS, ONE BUCKET', 'red', ev.eight - 0.1, ev.eight + 1.4],
    ];
    const co = callouts.find(([, , a, b]) => t >= a && t <= b);
    hud.callout(co ? co[0] : null, co ? co[1] : '', co ? pulse(t, co[2], co[3], 0.2) : 0, co ? co[2] : 0, t);
    hud.end(span(t, ev.end, ev.end + 0.6));
  };
}

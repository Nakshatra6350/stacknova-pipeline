// The HashMap world as films use it: named places, and world beats (keys put into buckets and
// moved between them, bucket colours, the table doubling, a chain that becomes a tree, System
// Vision, a full scan). Every beat is registered once; update(t) then draws any moment on its own.
import * as THREE from 'three';
import { HashMapWorld, type BucketTone } from './hashmapWorld';
import { EntrySlab, nodeCard, type NodeState, type SlabTone } from '../props/cards';
import type { Card } from '../util/look';
import { clamp, easeOut, lerp, pulse, smooth, smoother, span, V } from '../util/math';
import type { FilmWorld } from '../film/world';
import type { WorldOp } from '../film/types';

interface Move { t: number; bucket: number; dur: number; from?: string }
interface Slab { key: string; slab: EntrySlab; moves: Move[]; gone: number; labels: [number, string][]; tones: [number, SlabTone][] }
interface Chain { bucket: number; keys: string[]; hashes: string[]; at: number; hide: number; tree: number; cards: Card<NodeState>[]; links: THREE.Mesh[] }

// a red-black tree of up to 9 nodes, level by level: x across the bucket, height
const TREE: [number, number][] = [[0, 2.45], [-0.62, 2.02], [0.62, 2.02], [-0.93, 1.6], [-0.31, 1.6], [0.31, 1.6], [0.93, 1.6], [-1.08, 1.18], [-0.78, 1.18]];
const PARENT = [0, 0, 0, 1, 1, 2, 2, 3, 3];
// "never" is a time far away, not Infinity: Infinity - Infinity is NaN, and one NaN in the picture
// blacks out the whole frame through the bloom pass
const NEVER = 1e6;

export class HashMapFilm implements FilmWorld {
  readonly world: HashMapWorld;
  private scene: THREE.Scene;
  private tones = new Map<number, [number, BucketTone][]>();
  private slabs = new Map<string, Slab>();
  private grows: number[] = [];
  private visions: [number, number][] = [[0, 0]];
  private scans: number[] = [];
  private shakes: [number, number][] = [];
  private chains: Chain[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.world = new HashMapWorld(scene);
  }

  // ---------------------------------------------------------------- places
  place(name: string): THREE.Vector3 | null {
    const [kind, a, b, c] = name.split(':');
    const i = Number(a), w = this.world;
    switch (kind) {
      case 'bucket': return w.front(i, 0.55, w.buckets[i].pos.y + 1.0);
      case 'top': return w.buckets[i].pos.clone().setY(w.buckets[i].pos.y + 1.95);
      case 'slot': return w.slot(i, Number(b));
      case 'front': return w.front(i, Number(b), Number(c));
      case 'chain': return w.front(i, 0.32, 2.3);
      case 'center': return V(0, 1.2, -1.0);
      case 'ring': return V(0, 1.4, -1.3);
      case 'stage': return V(0.1, 1.55, 0.35);
      default: return null;
    }
  }

  /** Where a camera stands, seen from a place, when a shot says angle 0. */
  facing(name: string): THREE.Vector3 {
    const [kind, a] = name.split(':');
    if (['bucket', 'top', 'slot', 'front', 'chain'].includes(kind)) return this.world.buckets[Number(a)].front.clone();
    return V(0, 0, 1);
  }

  // ---------------------------------------------------------------- beats
  op(op: WorldOp, at: number, until?: number): void {
    const list = <T>(x: T | T[]): T[] => (Array.isArray(x) ? x : [x]);
    const dur = Number(op.dur ?? 0.8), stagger = Number(op.stagger ?? 0.12);
    if (op.tone !== undefined && op.bucket !== undefined && op.put === undefined && op.move === undefined) {
      for (const b of list(op.bucket as number)) this.toneAt(b).push([at, op.tone as BucketTone]);
      if (until !== undefined) for (const b of list(op.bucket as number)) this.toneAt(b).push([until, 'idle']);
    }
    if (op.put !== undefined) {
      list(op.put as string).forEach((key, n) => {
        const s = this.slab(key);
        s.moves.push({ t: at + n * stagger, bucket: Number(op.bucket), dur: Number(op.dur ?? 0.45), from: op.from as string | undefined });
        if (op.tone) s.tones.push([at, op.tone as SlabTone]);
      });
    }
    if (op.move !== undefined) {
      list(op.move as string).forEach((key, n) => this.slab(key).moves.push({ t: at + n * stagger, bucket: Number(op.bucket), dur }));
    }
    if (op.remove !== undefined) for (const key of list(op.remove as string)) this.slab(key).gone = at;
    if (op.relabel !== undefined) this.slab(op.relabel as string).labels.push([at, String(op.text)]);
    if (op.key !== undefined && op.tone !== undefined) for (const key of list(op.key as string)) this.slab(key).tones.push([at, op.tone as SlabTone]);
    if (op.grow !== undefined) { this.world.addOuter(); this.grows.push(at); }
    if (op.vision !== undefined) this.visions.push([at, Number(op.vision)]);
    if (op.scan) this.scans.push(at);
    if (op.shake !== undefined) for (const b of list(op.shake as number)) this.shakes.push([at, Number(b)]);
    if (op.chain !== undefined) {
      const c = this.chains.find((x) => x.bucket === Number(op.chain) && x.hide === NEVER);
      if (op.hide && c) c.hide = at;
      else if (op.tree && c) c.tree = at;
      else if (!op.hide && !op.tree) {
        const keys = list(op.keys as string), hashes = list((op.hashes ?? keys.map(() => '…0111')) as string);
        const cards = keys.map((k, n) => { const card = nodeCard(k, '', hashes[n] ?? ''); this.scene.add(card); return card; });
        const links = keys.slice(1).map(() => {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), new THREE.MeshBasicMaterial({ color: 0x8fdcf2, transparent: true }));
          this.scene.add(m); return m;
        });
        this.chains.push({ bucket: Number(op.chain), keys, hashes, at, hide: NEVER, tree: NEVER, cards, links });
      }
    }
  }

  private toneAt(b: number): [number, BucketTone][] {
    if (!this.tones.has(b)) this.tones.set(b, []);
    return this.tones.get(b)!;
  }

  private slab(key: string): Slab {
    let s = this.slabs.get(key);
    if (!s) {
      const slab = new EntrySlab(key);
      slab.visible = false;
      this.scene.add(slab);
      s = { key, slab, moves: [], gone: NEVER, labels: [], tones: [] };
      this.slabs.set(key, s);
    }
    return s;
  }

  /** 0..1 how much of slab `s` sits in bucket b at t (rises as it lands, falls as it leaves). */
  private presence(s: Slab, b: number, t: number): number {
    let k = 0;
    s.moves.forEach((m, n) => {
      if (m.bucket !== b) return;
      const leave = s.moves[n + 1]?.t ?? s.gone;
      k = Math.max(k, smooth(span(t, m.t + m.dur - 0.05, m.t + m.dur + 0.15)) * (1 - smooth(span(t, leave, leave + 0.3))));
    });
    return k;
  }

  /** Where slab s rests in bucket b at t: stacked on the slabs that arrived before it. */
  private rest(s: Slab, m: Move, t: number): THREE.Vector3 {
    let below = 0;
    for (const o of this.slabs.values()) {
      if (o === s) continue;
      const arrived = o.moves.filter((x) => x.bucket === m.bucket && x.t + x.dur < m.t + m.dur);
      if (arrived.length) below += this.presence(o, m.bucket, t);
    }
    return this.world.slot(m.bucket, below);
  }

  private visionAt(t: number): number {
    let v = 0;
    this.visions.forEach(([a, target], n) => {
      if (t < a) return;
      const prev = n > 0 ? this.visions[n - 1][1] : 0;
      v = lerp(prev, target, smooth(span(t, a, a + 1.2)));
    });
    return v;
  }

  // ---------------------------------------------------------------- every frame
  update(t: number, camera: THREE.Camera): { vision: number } {
    const w = this.world;
    for (const [b, list] of this.tones) {
      let tone: BucketTone = 'idle';
      for (const [a, x] of list) if (t >= a) tone = x;
      w.setTone(b, tone);
    }
    const grow = this.grows.filter((a) => t >= a).at(-1);
    for (let i = 16; i < w.buckets.length; i++) {
      const j = i - 16;
      w.raise(i, grow === undefined ? 0 : easeOut(span(t, grow + j * 0.05, grow + 0.7 + j * 0.05)));
    }
    for (const [a, b] of this.shakes) {
      const k = pulse(t, a, a + 0.45, 0.05);
      const bucket = w.buckets[b];
      if (k > 0) bucket.group.position.copy(bucket.pos).addScaledVector(V(bucket.front.z, 0, -bucket.front.x), Math.sin(t * 60) * 0.015 * k);
    }
    const vision = this.visionAt(t);
    const scan = this.scans.filter((a) => t >= a && t < a + 1.6).at(-1);
    w.setVision(vision, scan === undefined ? 0 : span(t, scan, scan + 1.6), t);

    // slabs: dropped in, carried between buckets on an arc, stacked by arrival
    for (const s of this.slabs.values()) {
      let n = -1;
      s.moves.forEach((m, i) => { if (t >= m.t) n = i; });
      s.slab.visible = n >= 0 && t < s.gone + 0.3;
      if (!s.slab.visible) continue;
      const m = s.moves[n];
      const to = this.rest(s, m, t);
      const k = smoother(span(t, m.t, m.t + m.dur));
      let from: THREE.Vector3;
      if (n > 0) from = this.rest(s, s.moves[n - 1], m.t);
      else from = (m.from ? this.place(m.from) : null) ?? to.clone().setY(to.y + 1.9);
      const p = from.clone().lerp(to, k);
      if (n > 0) p.y += Math.sin(k * Math.PI) * 0.8;
      s.slab.position.copy(p);
      const b = w.buckets[m.bucket];
      s.slab.lookAt(s.slab.position.clone().add(b.front));
      s.slab.scale.setScalar(1 - smooth(span(t, s.gone, s.gone + 0.3)) * 0.9);
      let tone: SlabTone = 'cyan';
      for (const [a, x] of s.tones) if (t >= a) tone = x;
      s.slab.tone(tone);
      let label = s.key;
      for (const [a, x] of s.labels) if (t >= a) label = x;
      s.slab.relabel(label);
    }

    // a chain of nodes rising out of a bucket, that can become a red-black tree
    for (const c of this.chains) {
      const side = V(w.buckets[c.bucket].front.z, 0, -w.buckets[c.bucket].front.x);
      const morph = smoother(span(t, c.tree, c.tree + 1.1));
      const fade = 1 - span(t, c.hide, c.hide + 0.35);
      c.cards.forEach((card, i) => {
        const appear = span(t, c.at + i * 0.12, c.at + 0.35 + i * 0.12);
        card.visible = appear > 0 && fade > 0;
        if (!card.visible) return;
        const chainP = w.front(c.bucket, 0.32, 2.3 - i * 0.27);
        const [tx, ty] = TREE[Math.min(i, TREE.length - 1)];
        const treeP = w.front(c.bucket, 0.32, ty).addScaledVector(side, tx);
        card.position.copy(chainP.lerp(treeP, morph)).add(V(0, -(1 - easeOut(appear)) * 0.35, 0));
        card.scale.setScalar(lerp(1, 0.62, morph) * lerp(0.6, 1, easeOut(appear)));
        card.material.opacity = appear * fade;
        const level = i === 0 ? 0 : i < 3 ? 1 : i < 7 ? 2 : 3;
        const red = morph > 0.5 && level === 3;
        card.set({ tone: morph > 0.5 ? (red ? 'red' : 'dim') : c.keys.length > 7 ? 'amber' : 'cyan', last: morph > 0.5 ? level === 3 : i === c.cards.length - 1, ok: false });
        card.quaternion.copy(camera.quaternion);
      });
      c.links.forEach((m, j) => {
        const b = c.cards[j + 1], a = morph > 0.5 ? c.cards[PARENT[j + 1]] : c.cards[j];
        m.visible = a.visible && b.visible;
        if (!m.visible) return;
        const from = a.position.clone().add(V(0, -0.135 * a.scale.y, 0)), to = b.position.clone().add(V(0, 0.135 * b.scale.y, 0));
        m.position.copy(from).lerp(to, 0.5); m.scale.set(1, Math.max(0.001, from.distanceTo(to)), 1);
        m.quaternion.setFromUnitVectors(V(0, 1, 0), to.sub(from).normalize());
        (m.material as THREE.MeshBasicMaterial).opacity = clamp(b.material.opacity);
      });
    }
    return { vision };
  }
}

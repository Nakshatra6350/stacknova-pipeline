// The HashMap world: 16 glass tubes (the buckets of a HashMap with the default capacity) in an arc,
// numbered, on dark pedestals; keys stack inside them as labelled slabs. A dark city with soft
// lights stands far behind. System Vision brightens the structure a little; it never glares.
import * as THREE from 'three';
import { PALETTE, toon, glow, Card, canvasTex, roundRect, MONO } from '../util/look';
import { deg, lerp, rng, V } from '../util/math';

export type BucketTone = 'idle' | 'active' | 'alarm' | 'searched';

export interface Bucket {
  group: THREE.Group;
  pos: THREE.Vector3;
  front: THREE.Vector3; // unit vector from the bucket toward the centre
  glass: THREE.MeshStandardMaterial;
  rims: THREE.MeshBasicMaterial;
  label: Card<{ tone: BucketTone }>;
  tone: BucketTone;
}

const RIM = { idle: [0.18, 0.62, 0.78], active: [1.0, 0.68, 0.28], alarm: [1.0, 0.33, 0.4], searched: [0.5, 0.55, 0.65] } as const;

/** The same world can hold other tables: episode 008 uses five wide tubes as rows (id 1-5),
 *  their slabs as row versions. Defaults: the HashMap's 16 buckets. */
export interface WorldOptions {
  count?: number;                  // tubes in the arc
  arc?: number;                    // degrees the arc spans
  radius?: number;                 // metres from the centre
  tube?: number;                   // tube radius
  label?: (i: number) => string;   // what each tube's sign says
}

export class HashMapWorld {
  readonly group = new THREE.Group();
  readonly buckets: Bucket[] = [];
  readonly radius: number;
  private opts: Required<WorldOptions>;
  private grid: THREE.GridHelper;
  private scan: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private motes: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private moteBase: Float32Array;
  private fog: THREE.FogExp2;

  constructor(scene: THREE.Scene, opts: WorldOptions = {}) {
    this.opts = { count: 16, arc: 140, radius: 3.6, tube: 0.22, label: String, ...opts };
    this.radius = this.opts.radius;
    scene.add(this.group);
    this.fog = new THREE.FogExp2(0x060b16, 0.04);
    scene.fog = this.fog;
    scene.background = new THREE.Color(0x060b16);

    // sky: a dark gradient dome
    const sky = canvasTex<number>(8, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#02040a'); g.addColorStop(0.55, '#08122a'); g.addColorStop(1, '#0c1830');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.MeshBasicMaterial({ map: sky.tex, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.group.add(dome);

    // floor, a quiet grid and the platform the buckets stand on
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 96), toon(0x080d1a));
    floor.rotation.x = -Math.PI / 2; this.group.add(floor);
    this.grid = new THREE.GridHelper(40, 80, 0x1d5f80, 0x0f2a40);
    const gm = this.grid.material as THREE.LineBasicMaterial;
    gm.transparent = true; gm.opacity = 0.22; this.grid.position.y = 0.002; this.group.add(this.grid);
    const deck = new THREE.Mesh(new THREE.RingGeometry(this.radius - 0.45, this.radius + 0.45, 128, 1, deg(8), deg(164)), toon(0x0d1526));
    deck.rotation.x = -Math.PI / 2; deck.position.y = 0.004; this.group.add(deck);
    const edge = new THREE.Mesh(new THREE.RingGeometry(this.radius - 0.46, this.radius - 0.44, 128, 1, deg(8), deg(164)), glow(PALETTE.cyan, 0.9));
    edge.rotation.copy(deck.rotation); edge.position.y = 0.006; this.group.add(edge);
    const spot = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.52, 96), glow(PALETTE.cyan, 0.7, 0.6));
    spot.rotation.x = -Math.PI / 2; spot.position.set(0.4, 0.006, 1.3); this.group.add(spot);
    this.scan = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.0, 128), glow(PALETTE.cyanSoft, 1.1, 1));
    this.scan.rotation.x = -Math.PI / 2; this.scan.position.set(0.4, 0.01, 1.3); this.scan.visible = false; this.group.add(this.scan);

    // the buckets
    for (let i = 0; i < this.opts.count; i++) this.buckets.push(this.makeBucket(i, this.radius, 0));

    // the city far behind, and soft out-of-focus lights
    this.city();
    // motes: specks of data drifting up, visible mostly in System Vision
    const n = 420, r = rng(5);
    this.moteBase = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = 0.8 + r() * 6;
      this.moteBase.set([Math.sin(a) * d, r() * 3.5, -Math.cos(a) * d * 0.9 + 0.6], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.moteBase.slice(), 3));
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x7fd8f5, size: 0.016, transparent: true, opacity: 0, depthWrite: false }));
    this.group.add(this.motes);

    // light: a cool key, a warm fill, a blue rim from behind
    this.group.add(new THREE.HemisphereLight(0xc8d6ff, 0x0a0e1c, 0.8));
    const key = new THREE.DirectionalLight(0xfff0e2, 1.55); key.position.set(2.2, 4.5, 4.5); this.group.add(key);
    const rim = new THREE.DirectionalLight(0x58c8ff, 1.5); rim.position.set(-3, 3.5, -4.5); this.group.add(rim);
    const fill = new THREE.DirectionalLight(0x7a6cff, 0.25); fill.position.set(-4, 1.2, 3); this.group.add(fill);
  }

  /** Bucket i stands at the angle of bucket i % 16; the doubled table's buckets 16-31 stand on an
   *  outer ring, raised, each right behind its partner (23 behind 7: one more bit of the hash). */
  private makeBucket(i: number, radius: number, lift: number): Bucket {
    const { count, arc, tube: r } = this.opts;
    const a = deg(-arc / 2 + ((i % count) * arc) / Math.max(1, count - 1));
    const group = new THREE.Group();
    group.position.set(radius * Math.sin(a), lift, -radius * Math.cos(a));
    group.lookAt(0, lift, 0);
    this.group.add(group);
    const metal = toon(0x141c2e);
    if (lift > 0) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, lift, 32), metal);
      column.position.y = -lift / 2; group.add(column);
    }
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.03, r + 0.07, 0.22, 40), metal);
    pedestal.position.y = 0.11; group.add(pedestal);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.025, r + 0.025, 0.03, 40), toon(0x1c2740)); cap.position.y = 1.47; group.add(cap);
    const glass = new THREE.MeshStandardMaterial({ color: 0x1a3a5c, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.22, 48, 1, true), glass);
    tube.position.y = 0.84; tube.renderOrder = 5; group.add(tube);
    const rims = new THREE.MeshBasicMaterial({ toneMapped: false });
    rims.color.setRGB(...RIM.idle);
    for (const y of [0.23, 1.45]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.002, 0.007, 8, 64), rims);
      ring.rotation.x = Math.PI / 2; ring.position.y = y; group.add(ring);
    }
    for (const x of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.004, 1.2, 0.004), rims);
      line.position.set(x * (r - 0.02), 0.84, 0.09); group.add(line);
    }
    const text = this.opts.label(i);
    const label = new Card<{ tone: BucketTone }>(Math.max(0.36, 0.1 + text.length * 0.075), 0.2, 500, (ctx, w, h, s) => {
      const col = s.tone === 'active' ? '#ffc36e' : s.tone === 'alarm' ? '#ff7a88' : s.tone === 'searched' ? '#8792a8' : '#9fe3f7';
      ctx.fillStyle = 'rgba(6,12,24,0.85)'; roundRect(ctx, 6, 6, w - 12, h - 12, 16); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = col; ctx.font = `700 64px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 3);
    }, { tone: 'idle' });
    label.billboard = false;
    label.position.set(0, 1.68, 0); group.add(label);
    return { group, pos: group.position.clone(), front: V(0, lift, 0).sub(group.position).normalize(), glass, rims, label, tone: 'idle' };
  }

  private city(): void {
    const r = rng(11);
    const win = canvasTex<number>(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#05080f'; ctx.fillRect(0, 0, w, h);
      for (let y = 8; y < h; y += 14) for (let x = 6; x < w; x += 12) {
        const k = r();
        ctx.fillStyle = k > 0.88 ? '#3d8fb0' : k > 0.84 ? '#b08a4a' : k > 0.78 ? '#25406a' : '#0a111e';
        ctx.fillRect(x, y, 6, 7);
      }
    }, 0);
    win.tex.wrapS = win.tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshBasicMaterial({ map: win.tex, color: new THREE.Color(0.75, 0.75, 0.8) });
    const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, 70);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + r() * 0.08, d = 16 + r() * 14, h = 3 + r() * 14, w = 1.2 + r() * 2.2;
      m.compose(V(Math.sin(a) * d, h / 2, -Math.cos(a) * d), q.setFromEuler(new THREE.Euler(0, -a, 0)), V(w, h, w));
      towers.setMatrixAt(i, m);
    }
    this.group.add(towers);
    // bokeh: big soft discs far away
    const disc = canvasTex<number>(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.55, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }, 0);
    const colors = [0x3fb8e8, 0x2f6fd8, 0xd9a052, 0x7fd8f5];
    for (let i = 0; i < 60; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc.tex, color: colors[i % 4], transparent: true, opacity: 0.12 + r() * 0.16, depthWrite: false, fog: false }));
      const a = deg(-80 + r() * 160), d = 10 + r() * 12;
      s.position.set(Math.sin(a) * d, 0.8 + r() * 6, -Math.cos(a) * d);
      s.scale.setScalar(0.4 + r() * 1.0);
      this.group.add(s);
    }
  }

  /** A point in front of bucket i, `out` metres toward the centre, at height y. */
  front(i: number, out = 0.5, y = 1.0): THREE.Vector3 {
    const b = this.buckets[i];
    return b.pos.clone().addScaledVector(b.front, out).setY(y);
  }

  /** Where the k-th entry of bucket i sits inside its tube. */
  slot(i: number, k: number): THREE.Vector3 {
    const p = this.buckets[i].pos;
    return p.clone().setY(p.y + 0.32 + k * 0.125);
  }

  /** The doubled table: buckets 16-31, hidden until `raise`. */
  addOuter(): void {
    if (this.buckets.length > 16) return;
    for (let i = 16; i < 32; i++) {
      const b = this.makeBucket(i, this.radius + 1.15, 0.5);
      b.group.visible = false;
      this.buckets.push(b);
    }
  }

  /** How far bucket i has risen into view, 0..1 (only the outer buckets start hidden). */
  raise(i: number, k: number): void {
    const b = this.buckets[i];
    b.group.visible = k > 0.001;
    b.group.scale.set(1, Math.max(0.001, k), 1);
    b.group.position.y = b.pos.y * k;
  }

  setTone(i: number, tone: BucketTone): void {
    const b = this.buckets[i];
    if (b.tone === tone) return;
    b.tone = tone;
    const [r, g, bl] = RIM[tone];
    b.rims.color.setRGB(r, g, bl);
    b.glass.color.setHex(tone === 'alarm' ? 0x5a2a3c : 0x1a3a5c);
    b.glass.opacity = 0.2;
    b.label.set({ tone });
  }

  /** System Vision, 0..1, and the scan ring sweeping out from the engineer at `scan` (0..1). */
  setVision(v: number, scan: number, t: number): void {
    const gm = this.grid.material as THREE.LineBasicMaterial;
    gm.opacity = lerp(0.22, 0.42, v);
    this.fog.color.setRGB(lerp(0.024, 0.02, v), lerp(0.043, 0.06, v), lerp(0.086, 0.11, v));
    (this.motes.material as THREE.PointsMaterial).opacity = 0.08 + 0.35 * v;
    this.scan.visible = scan > 0 && scan < 1;
    this.scan.scale.setScalar(0.3 + scan * 9);
    this.scan.material.opacity = (1 - scan) * 0.8;
    const pos = this.motes.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = (this.moteBase[i * 3 + 1] + t * (0.12 + (i % 5) * 0.025)) % 3.5;
      pos.setXYZ(i, this.moteBase[i * 3], y, this.moteBase[i * 3 + 2]);
    }
    pos.needsUpdate = true;
  }
}

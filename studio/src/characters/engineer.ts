// The StackNova engineer, built in code to the owner's reference sheet (October 2026): a slim
// young adult (about 180 cm), messy black hair with blue highlights, glasses, the black SN hoodie
// with cyan details, cargo pants, sneakers, a backpack and a watch. Cel shading with ink lines;
// the face is drawn on a canvas so it can blink, talk and change expression on any frame.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CharacterRig, CharacterState, Expression } from './types';
import { PALETTE, toon, glow, part, ink, canvasTex, SANS } from '../util/look';
import { clamp, lerp, rng, V } from '../util/math';

const R = 0.136; // skull radius
const FACE = { phiStart: Math.PI / 2 - 0.86, phiLength: 1.72, thetaStart: 0.98, thetaLength: 1.42 };
const EYE_V = 0.5;
const UP = V(0, 1, 0);

// ------------------------------------------------------------------ head shape

/** Turns a sphere into an anime head: narrower V jaw, chin a little forward, rounder skull. */
function shapeHead(p: THREE.Vector3): void {
  const r = p.length() || 1;
  const n = p.clone().divideScalar(r);
  const below = Math.max(0, -n.y);
  const k = Math.pow(below, 1.25);
  p.x *= 0.93 * (1 - 0.2 * k);
  p.z *= 1 - 0.06 * k;
  if (n.z > 0) p.z += R * 0.07 * k * k * n.z;
  p.y *= 1 + 0.12 * below;
  if (n.z < -0.2 && n.y > -0.3) p.multiplyScalar(1.04);
}

function headGeometry(radius: number, patch = false): THREE.BufferGeometry {
  const g = patch
    ? new THREE.SphereGeometry(radius, 56, 44, FACE.phiStart, FACE.phiLength, FACE.thetaStart, FACE.thetaLength)
    : new THREE.SphereGeometry(radius, 56, 44);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = V();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    shapeHead(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Where a point of the face canvas (u, v in 0..1) sits on the head, pushed out by `lift`. */
function onFace(u: number, v: number, lift = 1): THREE.Vector3 {
  const phi = FACE.phiStart + u * FACE.phiLength;
  const theta = FACE.thetaStart + v * FACE.thetaLength;
  const p = V(-R * Math.cos(phi) * Math.sin(theta), R * Math.cos(theta), R * Math.sin(phi) * Math.sin(theta));
  shapeHead(p);
  return p.multiplyScalar(lift);
}

// ------------------------------------------------------------------ the face

interface FaceState { expr: Expression; blink: number; mouth: number; look: [number, number]; vision: number }

function eye(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, open: number,
  mirror: boolean, look: [number, number], expr: Expression): void {
  ctx.save();
  ctx.translate(cx, cy);
  if (mirror) ctx.scale(-1, 1);
  const narrow = expr === 'focus' ? 0.7 : expr === 'surprised' ? 1.18 : expr === 'smirk' ? 0.9 : 1;
  const o = clamp(open) * narrow;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o < 0.16 || expr === 'smile') {
    ctx.strokeStyle = '#1b1012'; ctx.lineWidth = 9;
    ctx.beginPath();
    if (expr === 'smile') { ctx.moveTo(-w * 0.48, h * 0.1); ctx.quadraticCurveTo(0, -h * 0.4, w * 0.5, h * 0.04); }
    else { ctx.moveTo(-w * 0.48, 0); ctx.quadraticCurveTo(0, h * 0.18, w * 0.5, -h * 0.04); }
    ctx.stroke();
    ctx.restore();
    return;
  }
  const eh = h * o;
  // the eye: a sharp almond, wider at the outer corner
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, eh * 0.12);
  ctx.bezierCurveTo(-w * 0.36, -eh * 0.56, w * 0.26, -eh * 0.62, w * 0.5, -eh * 0.14);
  ctx.bezierCurveTo(w * 0.4, eh * 0.5, -w * 0.26, eh * 0.56, -w * 0.5, eh * 0.12);
  ctx.closePath();
  ctx.fillStyle = '#f7f7fb'; ctx.fill();
  ctx.save(); ctx.clip();
  const ix = (mirror ? -look[0] : look[0]) * w * 0.16;
  const iy = look[1] * eh * 0.16 + eh * 0.04;
  const g = ctx.createLinearGradient(0, iy - eh * 0.55, 0, iy + eh * 0.55);
  g.addColorStop(0, '#120a08'); g.addColorStop(0.5, '#3d2418'); g.addColorStop(1, '#8a5432');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(ix, iy, w * 0.25, eh * 0.56, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#070304';
  ctx.beginPath(); ctx.ellipse(ix, iy + eh * 0.02, w * 0.11, eh * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.ellipse(ix - w * 0.09, iy - eh * 0.22, w * 0.07, eh * 0.12, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.ellipse(ix + w * 0.08, iy + eh * 0.22, w * 0.03, eh * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  // the upper lid casts a shadow on the eye
  ctx.fillStyle = 'rgba(40,20,30,0.25)'; ctx.fillRect(-w, -eh, w * 2, eh * 0.45);
  ctx.restore();
  // lash line, thicker at the outer corner, and a soft crease above
  ctx.strokeStyle = '#140b0d'; ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(-w * 0.52, eh * 0.14);
  ctx.bezierCurveTo(-w * 0.36, -eh * 0.58, w * 0.26, -eh * 0.64, w * 0.52, -eh * 0.16);
  ctx.lineTo(w * 0.62, -eh * 0.3);
  ctx.stroke();
  ctx.lineWidth = 3.5; ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.moveTo(-w * 0.3, -eh * 0.78); ctx.quadraticCurveTo(w * 0.05, -eh * 0.98, w * 0.42, -eh * 0.62); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-w * 0.34, eh * 0.46); ctx.quadraticCurveTo(0, eh * 0.62, w * 0.36, eh * 0.38); ctx.stroke();
  ctx.restore();
}

function drawFace(ctx: CanvasRenderingContext2D, W: number, H: number, s: FaceState): void {
  const { expr } = s;
  const open = 1 - clamp(s.blink);
  const ey = H * EYE_V, ew = W * 0.215, eh = H * 0.15;
  eye(ctx, W * 0.33, ey, ew, eh, open, false, s.look, expr);
  eye(ctx, W * 0.67, ey, ew, eh, open, true, s.look, expr);
  // brows: thick, a little straight, the expression lives here
  const lift = expr === 'surprised' ? -20 : expr === 'focus' ? 10 : expr === 'thinking' ? -6 : 0;
  const inner = expr === 'focus' ? 14 : expr === 'thinking' ? -8 : 3;
  const right = expr === 'smirk' || expr === 'thinking' ? -14 : 0;
  ctx.strokeStyle = '#17110f'; ctx.lineCap = 'round'; ctx.lineWidth = 11;
  const by = H * 0.33;
  ctx.beginPath(); ctx.moveTo(W * 0.21, by + 6 + lift); ctx.quadraticCurveTo(W * 0.3, by - 6 + lift, W * 0.42, by + lift + inner); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W * 0.79, by + 6 + lift + right); ctx.quadraticCurveTo(W * 0.7, by - 6 + lift + right, W * 0.58, by + lift + inner + right * 0.4); ctx.stroke();
  // nose: a small shadow and a tip
  ctx.strokeStyle = 'rgba(150,85,70,0.55)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(W * 0.51, H * 0.6); ctx.lineTo(W * 0.525, H * 0.655); ctx.lineTo(W * 0.505, H * 0.665); ctx.stroke();
  // mouth
  const m = clamp(s.mouth);
  const mx = W * 0.5, my = H * 0.755;
  if (m > 0.08) {
    const mw = W * (0.055 + m * 0.02), mh = H * (0.012 + m * 0.035);
    ctx.fillStyle = '#4a1720';
    ctx.beginPath();
    ctx.moveTo(mx - mw, my - mh * 0.1);
    ctx.quadraticCurveTo(mx, my - mh * 0.5, mx + mw, my - mh * 0.1);
    ctx.quadraticCurveTo(mx + mw * 0.55, my + mh * 1.25, mx, my + mh * 1.3);
    ctx.quadraticCurveTo(mx - mw * 0.55, my + mh * 1.25, mx - mw, my - mh * 0.1);
    ctx.fill();
    ctx.fillStyle = 'rgba(240,240,245,0.9)'; ctx.fillRect(mx - mw * 0.6, my - mh * 0.28, mw * 1.2, mh * 0.28);
    ctx.fillStyle = '#c95a68'; ctx.beginPath(); ctx.ellipse(mx, my + mh * 0.9, mw * 0.45, mh * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.strokeStyle = '#4a1d22'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    if (expr === 'smile') { ctx.moveTo(mx - W * 0.06, my - 4); ctx.quadraticCurveTo(mx, my + 12, mx + W * 0.065, my - 6); }
    else if (expr === 'smirk') { ctx.moveTo(mx - W * 0.045, my + 2); ctx.quadraticCurveTo(mx + W * 0.015, my + 5, mx + W * 0.06, my - 8); }
    else if (expr === 'surprised') { ctx.ellipse(mx, my + 2, W * 0.016, H * 0.016, 0, 0, Math.PI * 2); }
    else { ctx.moveTo(mx - W * 0.04, my); ctx.quadraticCurveTo(mx, my + 4, mx + W * 0.04, my - 1); }
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ hair locks

/** A lock of hair: a ribbon that narrows from root to tip along a smooth curve, flattened
 *  against the head (`flat` is how much of its thickness is pressed toward the scalp). */
function lockGeometry(points: THREE.Vector3[], r0: number, flat = 0.6): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const segs = 16, radial = 8;
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = V(), c = V(), n = V();
  for (let i = 0; i <= segs; i++) {
    const k = i / segs;
    curve.getPointAt(k, c);
    n.copy(c).normalize();
    const r = r0 * Math.pow(1 - k, 0.75) + 0.0012;
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c);
      v.addScaledVector(n, -v.dot(n) * flat).multiplyScalar(r);
      v.add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

function buildHair(skull: THREE.Object3D): void {
  const base = toon(PALETTE.hair), hi = toon(PALETTE.hairHi), blue = toon(0x284d74);
  const rand = rng(1803);
  const dirOf = (phi: number, theta: number) => V(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
  // volume under the locks: a cap over the top and a shell down the back
  skull.add(part(new THREE.SphereGeometry(R * 1.05, 44, 24, 0, Math.PI * 2, 0, 1.28), base, [0, 0.004, -0.004], { ink: 0.004 }));
  skull.add(part(new THREE.SphereGeometry(R * 1.045, 44, 28, Math.PI / 2 + 0.98, Math.PI * 2 - 1.96, 0, 2.15), base, [0, 0, -0.006], { ink: 0.004 }));
  // the crown swirl, at the back of the top: hair flows away from it
  const whorl = dirOf(Math.PI * 1.5, 0.5).multiplyScalar(R);
  const browY = onFace(0.5, 0.29, 1).y;
  const lock = (root: THREE.Vector3, len: number, width: number, lift: number, jitter: THREE.Vector3, mat: THREE.Material, front = false) => {
    const pts: THREE.Vector3[] = [];
    let p = root.clone().setLength(R * 1.06);
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      pts.push(p.clone());
      const nrm = p.clone().normalize();
      const flow = p.clone().sub(whorl).add(jitter).add(V(0, -0.35 * k, 0));
      flow.addScaledVector(nrm, -flow.dot(nrm)).normalize();
      flow.addScaledVector(nrm, lift * k * k);
      p = p.clone().addScaledVector(flow.normalize(), len / steps);
      const hug = R * (1.06 + 0.025 * k);
      if (k < 0.7) p.setLength(lerp(p.length(), hug, 0.7));
    }
    const m = new THREE.Mesh(lockGeometry(pts, width, 0.62), mat);
    ink(m, 0.0022);
    skull.add(m);
  };
  const pick = () => { const x = rand(); return x < 0.16 ? hi : x < 0.22 ? blue : base; };
  // the whole head, in rings from the crown outward
  for (let i = 0; i < 120; i++) {
    const phi = rand() * Math.PI * 2, theta = 0.15 + rand() * 1.55;
    const d = dirOf(phi, theta);
    const onFaceSide = d.z > 0.25 && theta > 1.12;
    if (onFaceSide) continue;
    const front = d.z > 0.35;
    const len = front ? 0.055 + rand() * 0.025 : 0.1 + rand() * 0.06;
    const lift = front ? 0.12 + rand() * 0.2 : 0.2 + rand() * 0.45;
    const jitter = V((rand() - 0.5) * 0.05, (rand() - 0.5) * 0.03, (rand() - 0.5) * 0.05);
    lock(d.multiplyScalar(R), len, 0.022 + rand() * 0.012, lift, jitter, pick(), front);
  }
  // bangs: locks over the forehead that end at the brows, swept a little to one side
  for (let k = 0; k < 13; k++) {
    const u = 0.14 + (k / 12) * 0.72;
    const root = onFace(u, -0.3, 1.0).setLength(R * 1.05);
    root.y += 0.03;
    const jitter = V(0.03 + (u - 0.5) * 0.04, 0, 0.02);
    const drop = Math.max(0.035, (root.y - browY) * 0.62 + (k % 3) * 0.006);
    lock(root, drop, 0.026 + rand() * 0.006, 0.1 + rand() * 0.08, jitter, k % 4 === 1 ? hi : base, true);
  }
  // one lock on top that will not lie down
  const top = dirOf(1.7, 0.18).multiplyScalar(R * 1.04);
  const ahoge = new THREE.Mesh(lockGeometry([top, top.clone().add(V(0.0, 0.025, 0.006)), top.clone().add(V(0.012, 0.042, 0.018)), top.clone().add(V(0.03, 0.046, 0.032))], 0.007, 0), base);
  ink(ahoge, 0.002); skull.add(ahoge);
}

// ------------------------------------------------------------------ glasses

function roundedRect(w: number, h: number, r: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const corners: [number, number, number][] = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI], [w / 2 - r, -h / 2 + r, Math.PI * 1.5]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= 4; i++) {
    const a = a0 + (i / 4) * (Math.PI / 2);
    pts.push(V(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
  }
  return pts;
}

// ------------------------------------------------------------------ hands

type HandPose = 'relaxed' | 'point' | 'open' | 'fist' | 'thumbsUp' | 'chin';
const HAND_CURLS: Record<HandPose, { f: [number, number][]; thumb: number }> = {
  relaxed: { f: [[0.35, 0.4], [0.45, 0.5], [0.55, 0.55], [0.6, 0.6]], thumb: 0.3 },
  point: { f: [[0.0, 0.0], [1.5, 1.4], [1.5, 1.4], [1.5, 1.4]], thumb: 0.9 },
  open: { f: [[0.05, 0.05], [0.05, 0.05], [0.08, 0.05], [0.12, 0.08]], thumb: -0.2 },
  fist: { f: [[1.5, 1.5], [1.5, 1.5], [1.5, 1.5], [1.5, 1.5]], thumb: 1.0 },
  thumbsUp: { f: [[1.5, 1.5], [1.5, 1.5], [1.5, 1.5], [1.5, 1.5]], thumb: -0.6 },
  chin: { f: [[0.5, 0.6], [0.9, 0.9], [1.1, 1.0], [1.2, 1.1]], thumb: 0.2 },
};

interface Hand { group: THREE.Group; fingers: { a: THREE.Group; b: THREE.Group }[]; thumb: THREE.Group; side: number }

function buildHand(side: number, skin: THREE.Material): Hand {
  const group = new THREE.Group();
  group.add(part(new RoundedBoxGeometry(0.024, 0.07, 0.058, 2, 0.01), skin, [0, -0.04, 0.002], { ink: 0.002 }));
  const fingers: Hand['fingers'] = [];
  [0.021, 0.007, -0.007, -0.02].forEach((z, i) => {
    const a = new THREE.Group(); a.position.set(0, -0.074, z); group.add(a);
    const len = i === 0 ? 0.024 : i === 3 ? 0.019 : 0.026;
    a.add(part(new THREE.CapsuleGeometry(0.0072, len, 3, 8), skin, [0, -len / 2, 0], { ink: 0.0018 }));
    const b = new THREE.Group(); b.position.y = -len - 0.004; a.add(b);
    b.add(part(new THREE.CapsuleGeometry(0.0066, len * 0.8, 3, 8), skin, [0, -len * 0.4, 0], { ink: 0.0018 }));
    fingers.push({ a, b });
  });
  const thumb = new THREE.Group(); thumb.position.set(side * -0.006, -0.03, 0.03); group.add(thumb);
  thumb.add(part(new THREE.CapsuleGeometry(0.0085, 0.03, 3, 8), skin, [0, -0.018, 0.006], { rot: [0.5, 0, 0], ink: 0.0018 }));
  return { group, fingers, thumb, side };
}

function poseHand(h: Hand, pose: HandPose, k = 1): void {
  const c = HAND_CURLS[pose];
  const s = -h.side; // fingers curl toward the palm, which faces the body
  h.fingers.forEach((f, i) => {
    f.a.rotation.set(0, 0, s * c.f[i][0] * k + s * 0.2 * (1 - k));
    f.b.rotation.set(0, 0, s * c.f[i][1] * k + s * 0.25 * (1 - k));
  });
  h.thumb.rotation.set(c.thumb * k, 0, s * 0.3);
}

// ------------------------------------------------------------------ the rig

const L1 = 0.28, L2 = 0.255; // shoulder to elbow, elbow to wrist
const DOWN = V(0, -1, 0);

interface Arm { shoulder: THREE.Group; elbow: THREE.Group; hand: Hand; side: number }
interface Leg { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group }

export class ProceduralEngineer implements CharacterRig {
  readonly root = new THREE.Group();
  readonly height = 1.8;
  private hips = new THREE.Group();
  private spine = new THREE.Group();
  private chest = new THREE.Group();
  private neck = new THREE.Group();
  private head = new THREE.Group();
  private skull!: THREE.Mesh;
  private arms: Record<'L' | 'R', Arm>;
  private legs: Leg[] = [];
  private face: ReturnType<typeof canvasTex<FaceState>>;
  private lens: THREE.MeshBasicMaterial;
  private glassesAnchor = new THREE.Object3D();
  private chinAnchor = new THREE.Object3D();

  constructor() {
    const skin = new THREE.MeshLambertMaterial({ color: PALETTE.skin, emissive: 0x4a362c, emissiveIntensity: 0.45 });
    const hoodie = toon(PALETTE.hoodie), hoodieDark = toon(0x0e0f14), pants = toon(PALETTE.pants);
    const sole = toon(0xd9dde6), shoeTop = toon(0x101117), trim = glow(PALETTE.cyan, 1.05), soft = toon(0xc9d0dc);

    this.root.add(this.hips);
    this.hips.position.y = 0.98;
    this.hips.add(part(new THREE.SphereGeometry(0.15, 24, 16), pants, [0, -0.02, 0], { scale: [1, 0.72, 0.78] }));
    this.hips.add(part(new THREE.TorusGeometry(0.13, 0.012, 6, 32), hoodieDark, [0, 0.03, 0], { rot: [Math.PI / 2, 0, 0], scale: [1, 0.78, 1] }));

    // legs: baggy cargo pants with side pockets, sneakers
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(side * 0.088, -0.05, 0); this.hips.add(hip);
      hip.add(part(new THREE.CapsuleGeometry(0.07, 0.34, 6, 16), pants, [0, -0.21, 0]));
      hip.add(part(new RoundedBoxGeometry(0.03, 0.11, 0.1, 2, 0.01), pants, [side * 0.07, -0.22, 0.0]));
      hip.add(part(new THREE.BoxGeometry(0.006, 0.07, 0.07), hoodieDark, [side * 0.087, -0.2, 0.0], { ink: false }));
      const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
      knee.add(part(new THREE.CapsuleGeometry(0.06, 0.32, 6, 16), pants, [0, -0.19, 0]));
      knee.add(part(new THREE.TorusGeometry(0.058, 0.01, 6, 20), hoodieDark, [0, -0.36, 0], { rot: [Math.PI / 2, 0, 0] }));
      const ankle = new THREE.Group(); ankle.position.y = -0.41; knee.add(ankle);
      ankle.add(part(new RoundedBoxGeometry(0.11, 0.045, 0.28, 3, 0.02), sole, [0, -0.045, 0.045]));
      ankle.add(part(new RoundedBoxGeometry(0.1, 0.075, 0.21, 3, 0.03), shoeTop, [0, 0.0, 0.02]));
      ankle.add(part(new RoundedBoxGeometry(0.095, 0.05, 0.09, 3, 0.022), shoeTop, [0, -0.01, 0.13]));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.14), trim); stripe.position.set(side * 0.051, -0.012, 0.03); ankle.add(stripe);
      for (let l = 0; l < 3; l++) ankle.add(part(new THREE.BoxGeometry(0.05, 0.006, 0.01), soft, [0, 0.04, 0.07 + l * 0.026], { ink: false }));
      this.legs.push({ hip, knee, ankle });
    }

    // torso: the hoodie, its hood, pocket, strings, zipper, the SN emblem, a backpack
    this.hips.add(this.spine); this.spine.position.y = 0.08;
    const profile = [[0.0, -0.13], [0.142, -0.13], [0.152, -0.08], [0.15, 0.02], [0.156, 0.12], [0.17, 0.22], [0.175, 0.29], [0.16, 0.34], [0.115, 0.375], [0.055, 0.39], [0.0, 0.39]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    const torso = part(new THREE.LatheGeometry(profile, 40), hoodie, [0, 0, 0], { scale: [1, 1, 0.68], ink: 0.005 });
    this.spine.add(torso);
    this.spine.add(part(new THREE.TorusGeometry(0.145, 0.014, 8, 40), hoodieDark, [0, -0.12, 0], { rot: [Math.PI / 2, 0, 0], scale: [1, 0.69, 1] }));
    this.spine.add(part(new RoundedBoxGeometry(0.2, 0.08, 0.02, 2, 0.01), hoodieDark, [0, -0.04, 0.1]));
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.32, 0.004), glow(0x5f7b8f, 1)); zip.position.set(0, 0.2, 0.118); this.spine.add(zip);
    for (const side of [-1, 1]) {
      const pipe = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.24, 0.004), trim);
      pipe.position.set(side * 0.14, 0.17, 0.07); pipe.rotation.z = side * 0.06; pipe.rotation.y = side * -0.5; this.spine.add(pipe);
      const str = part(new THREE.CylinderGeometry(0.0035, 0.0035, 0.1, 6), soft, [side * 0.03, 0.31, 0.118], { ink: false });
      this.spine.add(str);
    }
    const emblem = canvasTex<number>(128, 128, (ctx, w, h) => {
      ctx.font = `800 70px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#41d4f6'; ctx.fillText('SN', w * 0.46, h * 0.56);
      ctx.strokeStyle = '#41d4f6'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(w * 0.62, h * 0.38); ctx.lineTo(w * 0.86, h * 0.14); ctx.moveTo(w * 0.7, h * 0.14); ctx.lineTo(w * 0.86, h * 0.14); ctx.lineTo(w * 0.86, h * 0.3); ctx.stroke();
    }, 0);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), new THREE.MeshBasicMaterial({ map: emblem.tex, transparent: true, toneMapped: false }));
    badge.material.color.setScalar(1.05);
    badge.position.set(0.075, 0.25, 0.112); badge.rotation.y = 0.32; this.spine.add(badge);
    // hood bunched behind the neck
    this.spine.add(part(new THREE.TorusGeometry(0.075, 0.032, 10, 28, Math.PI * 1.3), hoodie, [0, 0.38, -0.015], { rot: [Math.PI / 2 + 0.25, 0, Math.PI * 0.85] }));
    this.spine.add(part(new THREE.SphereGeometry(0.09, 20, 14), hoodie, [0, 0.36, -0.1], { scale: [1.1, 0.7, 0.55] }));
    // backpack and straps
    this.spine.add(part(new RoundedBoxGeometry(0.27, 0.33, 0.11, 3, 0.035), toon(0x121318), [0, 0.18, -0.165]));
    this.spine.add(part(new RoundedBoxGeometry(0.2, 0.12, 0.03, 2, 0.012), toon(0x16171d), [0, 0.12, -0.225]));
    const packLogo = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), badge.material); packLogo.position.set(0, 0.24, -0.222); packLogo.rotation.y = Math.PI; this.spine.add(packLogo);
    for (const side of [-1, 1]) {
      const strap = part(new RoundedBoxGeometry(0.035, 0.3, 0.012, 2, 0.005), toon(0x0e0f13), [side * 0.085, 0.2, 0.108], { rot: [0.12, 0, side * -0.06] });
      this.spine.add(strap);
    }

    this.spine.add(this.chest); this.chest.position.y = 0.2;
    this.chest.add(this.neck); this.neck.position.y = 0.17;
    this.neck.add(part(new THREE.CylinderGeometry(0.043, 0.05, 0.09, 14), skin, [0, 0.02, 0]));
    this.neck.add(this.head); this.head.position.y = 0.06;

    // head
    this.skull = part(headGeometry(R), skin, [0, 0.112, 0.005], { ink: 0.0045 });
    this.head.add(this.skull);
    this.face = canvasTex<FaceState>(512, 512, drawFace, { expr: 'calm', blink: 0, mouth: 0, look: [0, 0], vision: 0 });
    const faceMesh = new THREE.Mesh(headGeometry(R * 1.004, true),
      new THREE.MeshBasicMaterial({ map: this.face.tex, transparent: true, depthWrite: false }));
    faceMesh.renderOrder = 2;
    this.skull.add(faceMesh);
    for (const side of [-1, 1]) this.skull.add(part(new THREE.SphereGeometry(0.024, 12, 10), skin, [side * R * 0.9, -0.012, -0.005], { scale: [0.45, 1, 0.75], ink: 0.002 }));
    buildHair(this.skull);

    // glasses: rounded rectangles on a bridge, temple arms back to the ears
    const frameMat = toon(0x0a0b10);
    this.lens = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.08, toneMapped: false, depthWrite: false });
    const glasses = new THREE.Group(); this.skull.add(glasses);
    const centres: THREE.Vector3[] = [];
    for (const u of [0.33, 0.67]) {
      const c = onFace(u, EYE_V, 1.0); c.z += 0.022;
      const frame = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(roundedRect(0.07, 0.044, 0.013), true), 48, 0.0028, 6, true), frameMat);
      frame.position.copy(c); frame.rotation.y = (u - 0.5) * 0.55; glasses.add(frame);
      const lens = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(roundedRect(0.068, 0.042, 0.012).map((p) => new THREE.Vector2(p.x, p.y)))), this.lens);
      lens.position.copy(c); lens.rotation.copy(frame.rotation); glasses.add(lens);
      centres.push(c);
      const temple = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.13), frameMat);
      temple.position.set(c.x + (u < 0.5 ? -0.037 : 0.037), c.y + 0.012, c.z - 0.07); temple.rotation.y = (u < 0.5 ? 1 : -1) * 0.12; glasses.add(temple);
    }
    const bridge = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(
      centres[0].clone().add(V(0.035, 0.008, 0)), V(0, centres[0].y + 0.016, centres[0].z + 0.006), centres[1].clone().add(V(-0.035, 0.008, 0))), 8, 0.0025, 5), frameMat);
    glasses.add(bridge);
    this.glassesAnchor.position.copy(centres[0]).add(V(-0.045, 0, 0.0)); this.skull.add(this.glassesAnchor);
    this.chinAnchor.position.copy(onFace(0.5, 0.86, 1.0)).add(V(0, -0.02, 0.03)); this.skull.add(this.chinAnchor);

    // arms with hands
    const arm = (name: 'L' | 'R', side: number): Arm => {
      const shoulder = new THREE.Group(); shoulder.position.set(side * 0.168, 0.14, -0.005); this.chest.add(shoulder);
      shoulder.add(part(new THREE.SphereGeometry(0.06, 16, 12), hoodie, [0, -0.01, 0]));
      shoulder.add(part(new THREE.CapsuleGeometry(0.054, 0.2, 6, 14), hoodie, [0, -0.135, 0]));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.16, 0.004), trim); stripe.position.set(side * 0.054, -0.14, 0.01); shoulder.add(stripe);
      const elbow = new THREE.Group(); elbow.position.y = -L1; shoulder.add(elbow);
      elbow.add(part(new THREE.CapsuleGeometry(0.048, 0.18, 6, 14), hoodie, [0, -0.115, 0]));
      elbow.add(part(new THREE.TorusGeometry(0.045, 0.012, 6, 20), hoodieDark, [0, -0.235, 0], { rot: [Math.PI / 2, 0, 0] }));
      if (name === 'L') {
        elbow.add(part(new THREE.CylinderGeometry(0.036, 0.036, 0.022, 18), toon(0x0b0c10), [0, -0.218, 0]));
        const dial = new THREE.Mesh(new THREE.CircleGeometry(0.014, 18), glow(PALETTE.cyan, 0.9)); dial.position.set(0, -0.218, 0.037); elbow.add(dial);
      }
      const hand = buildHand(side, skin);
      hand.group.position.y = -L2; elbow.add(hand.group);
      return { shoulder, elbow, hand, side };
    };
    this.arms = { R: arm('R', -1), L: arm('L', 1) };
  }

  // two-bone reach in chest space: the wrist goes to `target`, the elbow bends toward `pole`
  private reach(a: Arm, targetWorld: THREE.Vector3, pole?: THREE.Vector3): void {
    const target = this.chest.worldToLocal(targetWorld.clone());
    const s = a.shoulder.position;
    const to = target.sub(s);
    const d = Math.min(to.length(), L1 + L2 - 0.005);
    const dir = to.normalize();
    const hint = (pole ?? V(a.side * 0.5, -0.6, -0.7)).clone();
    hint.addScaledVector(dir, -hint.dot(dir)).normalize();
    const alpha = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const upper = dir.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(hint, Math.sin(alpha)).normalize();
    a.shoulder.quaternion.setFromUnitVectors(DOWN, upper);
    const elbowAt = s.clone().addScaledVector(upper, L1);
    const fore = s.clone().addScaledVector(dir, d).sub(elbowAt).normalize();
    a.elbow.quaternion.setFromUnitVectors(DOWN, fore.applyQuaternion(a.shoulder.quaternion.clone().invert()));
  }

  private restArm(a: Arm, swing: number, t: number): void {
    a.shoulder.quaternion.identity(); a.elbow.quaternion.identity();
    a.shoulder.rotation.set(0.04 + swing + Math.sin(t * 1.1 + a.side) * 0.015, 0, a.side * 0.11);
    a.elbow.rotation.set(-0.18 - Math.max(0, swing) * 0.4, 0, 0);
  }

  apply(s: CharacterState): void {
    const t = s.t, w = s.walk ?? 0, ph = s.walkPhase ?? 0;
    this.root.position.copy(s.position);
    this.root.rotation.set(0, s.yaw, 0);
    // body: breathing, walking
    const breath = Math.sin(t * 1.9) * 0.5 + 0.5;
    this.hips.position.y = 0.98 + Math.abs(Math.sin(ph)) * 0.022 * w - w * 0.01;
    this.hips.rotation.set(0, Math.sin(ph) * 0.08 * w, 0);
    this.spine.rotation.set(0.04 * w + (s.gesture?.name === 'think' ? 0.04 : 0), -Math.sin(ph) * 0.1 * w, 0);
    this.chest.scale.set(1 + breath * 0.008, 1, 1 + breath * 0.012);
    this.legs.forEach((leg, i) => {
      const k = i === 0 ? 1 : -1;
      const swing = Math.sin(ph) * 0.42 * w * k;
      leg.hip.rotation.set(-swing, 0, -k * 0.02);
      const bend = Math.max(0, Math.sin(ph + (k > 0 ? 0 : Math.PI) - 1.1)) * 0.75 * w;
      leg.knee.rotation.set(bend, 0, 0);
      leg.ankle.rotation.set(-bend * 0.3 + swing * 0.2, 0, 0);
    });

    // head: turn toward what he looks at
    let yaw = Math.sin(t * 0.7) * 0.03, pitch = Math.sin(t * 0.9) * 0.02, eyes: [number, number] = [0, 0];
    if (s.lookAt) {
      this.root.updateMatrixWorld(true);
      const local = this.root.worldToLocal(s.lookAt.clone()).sub(V(0, 1.6, 0));
      const want = Math.atan2(local.x, local.z);
      const up = Math.atan2(local.y, Math.hypot(local.x, local.z));
      yaw = clamp(want, -0.8, 0.8);
      pitch = clamp(-up, -0.45, 0.4);
      eyes = [clamp((want - yaw) * 1.5, -1, 1), clamp(-up * 0.8, -1, 1)];
    }
    this.neck.rotation.set(pitch * 0.4, yaw * 0.4, 0);
    this.head.rotation.set(pitch * 0.6, yaw * 0.6, Math.sin(t * 0.6) * 0.02);

    // arms: rest or walk swing, then the gesture on top
    const g = s.gesture;
    const gw = g ? clamp(g.weight) : 0;
    this.restArm(this.arms.R, Math.sin(ph) * 0.4 * w, t);
    this.restArm(this.arms.L, -Math.sin(ph) * 0.4 * w, t + 1.3);
    poseHand(this.arms.R.hand, 'relaxed'); poseHand(this.arms.L.hand, 'relaxed');
    if (g && gw > 0.01) {
      this.root.updateMatrixWorld(true);
      const blendTo = (a: Arm, target: THREE.Vector3, pole?: THREE.Vector3) => {
        const q1 = a.shoulder.quaternion.clone(), q2 = a.elbow.quaternion.clone();
        this.reach(a, target, pole);
        a.shoulder.quaternion.slerpQuaternions(q1, a.shoulder.quaternion.clone(), gw);
        a.elbow.quaternion.slerpQuaternions(q2, a.elbow.quaternion.clone(), gw);
      };
      const chestWorld = (x: number, y: number, z: number) => this.chest.localToWorld(V(x, y, z));
      const gt = g.time;
      switch (g.name) {
        case 'point': {
          const target = g.target ?? chestWorld(-0.3, 0.2, 0.8);
          const sh = this.arms.R.shoulder.getWorldPosition(V());
          const dir = target.clone().sub(sh).normalize();
          blendTo(this.arms.R, sh.clone().addScaledVector(dir, L1 + L2 - 0.02), V(-0.6, -0.3, -0.5));
          poseHand(this.arms.R.hand, 'point', gw);
          break;
        }
        case 'explain': {
          const sway = Math.sin(gt * 3.1) * 0.03, sway2 = Math.sin(gt * 2.3 + 1) * 0.03;
          blendTo(this.arms.R, chestWorld(-0.2 + sway, -0.12 + sway2, 0.3));
          blendTo(this.arms.L, chestWorld(0.22 - sway2, -0.1 + sway, 0.28));
          poseHand(this.arms.R.hand, 'open', gw); poseHand(this.arms.L.hand, 'open', gw);
          break;
        }
        case 'present': {
          blendTo(this.arms.L, chestWorld(0.16, -0.08, 0.36));
          poseHand(this.arms.L.hand, 'open', gw);
          break;
        }
        case 'think': {
          blendTo(this.arms.R, this.chinAnchor.getWorldPosition(V()).add(V(0, -0.06, 0.02)), V(-0.4, -0.8, 0.2));
          blendTo(this.arms.L, chestWorld(0.05, -0.12, 0.16), V(0.6, -0.5, -0.2));
          poseHand(this.arms.R.hand, 'chin', gw);
          break;
        }
        case 'vision': {
          blendTo(this.arms.R, this.glassesAnchor.getWorldPosition(V()).add(V(-0.01, -0.07, 0.02)), V(-0.7, -0.6, -0.2));
          poseHand(this.arms.R.hand, 'point', gw);
          break;
        }
        case 'thumbsUp': {
          blendTo(this.arms.R, chestWorld(-0.12, -0.02, 0.3));
          poseHand(this.arms.R.hand, 'thumbsUp', gw);
          break;
        }
        case 'wave': {
          blendTo(this.arms.R, chestWorld(-0.32 + Math.sin(gt * 9) * 0.05, 0.32, 0.12), V(-0.8, -0.4, 0));
          poseHand(this.arms.R.hand, 'open', gw);
          break;
        }
        case 'nod': {
          this.head.rotation.x += Math.max(0, Math.sin(gt * 7)) * 0.18 * gw * Math.max(0, 1 - gt / 1.2);
          break;
        }
        case 'celebrate': {
          blendTo(this.arms.R, chestWorld(-0.25, 0.45, 0.1)); blendTo(this.arms.L, chestWorld(0.25, 0.45, 0.1));
          poseHand(this.arms.R.hand, 'fist', gw); poseHand(this.arms.L.hand, 'fist', gw);
          break;
        }
        default: break;
      }
    }

    // face and glasses
    const vision = clamp(s.vision ?? 0);
    this.lens.opacity = 0.08 + vision * 0.55;
    this.lens.color.setHex(0x9fe8ff).multiplyScalar(1 + vision * 0.6);
    this.face.redraw({
      expr: s.expression ?? 'calm', blink: +(s.blink ?? 0).toFixed(2), mouth: +(s.mouth ?? 0).toFixed(2),
      look: [+eyes[0].toFixed(2), +eyes[1].toFixed(2)], vision: +vision.toFixed(2),
    });
  }

  headWorld(out = V()): THREE.Vector3 { return this.skull.getWorldPosition(out); }
  handWorld(side: 'L' | 'R', out = V()): THREE.Vector3 { return this.arms[side].hand.group.getWorldPosition(out); }
}

export { UP };

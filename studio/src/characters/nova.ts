// Nova, the StackNova companion, built in code to the owner's reference sheet: a small rounded
// white-and-silver robot (about 40 cm), a dark face screen with glowing cyan eyes and a curved
// smile, cyan side modules, an SN emblem, small articulated arms and legs. It hovers.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CharacterRig, CharacterState, Expression } from './types';
import { PALETTE, toon, glow, part, canvasTex, SANS } from '../util/look';
import { clamp, V } from '../util/math';

interface FaceState { expr: Expression; blink: number; mouth: number; look: [number, number] }

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2, rr = i % 2 === 0 ? r : r * 0.34;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

function drawFace(ctx: CanvasRenderingContext2D, W: number, H: number, s: FaceState): void {
  const col = '#5fdcff';
  ctx.shadowColor = '#2fc8ef'; ctx.shadowBlur = 16;
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const open = 1 - clamp(s.blink);
  const lx = s.look[0] * 22, ly = s.look[1] * 12;
  const ys = H * 0.46 + ly;
  const eyesX = [W * 0.33 + lx, W * 0.67 + lx];
  const normalEye = (x: number, y: number) => {
    const h = 62 * open + 6;
    ctx.beginPath(); ctx.ellipse(x, y, 26, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.ellipse(x - 8, y - h * 0.22, 6, Math.max(2, h * 0.12), 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; ctx.shadowBlur = 16;
  };
  for (let i = 0; i < 2; i++) {
    const x = eyesX[i], y = ys;
    ctx.lineWidth = 20;
    switch (s.expr) {
      case 'happy': case 'celebrate':
        ctx.beginPath(); ctx.moveTo(x - 40, y + 14); ctx.quadraticCurveTo(x, y - 40, x + 40, y + 14); ctx.stroke(); break;
      case 'sparkle': star(ctx, x, y, 44); break;
      case 'panic':
        ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(x - 28, y - 28); ctx.lineTo(x + 28, y + 28); ctx.moveTo(x + 28, y - 28); ctx.lineTo(x - 28, y + 28); ctx.stroke(); break;
      case 'surprised':
        ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(x, y, 38, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill(); break;
      case 'squint':
        ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(x - 32, y + (i ? -8 : 8)); ctx.lineTo(x + 32, y + (i ? 8 : -8)); ctx.stroke(); break;
      case 'confused':
        if (i === 1) { ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(x - 30, y + 4); ctx.lineTo(x + 30, y + 4); ctx.stroke(); }
        else normalEye(x, y);
        break;
      default: normalEye(x, y);
    }
  }
  if (s.expr === 'confused' || s.expr === 'thinking') {
    ctx.font = `800 80px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText('?', W * 0.86, H * 0.28);
  }
  const m = clamp(s.mouth), mx = W * 0.5 + lx * 0.6, my = H * 0.71 + ly;
  ctx.lineWidth = 11;
  if (m > 0.08) {
    ctx.beginPath(); ctx.ellipse(mx, my, 20 + m * 8, 6 + m * 22, 0, 0, Math.PI * 2); ctx.fill();
  } else if (s.expr === 'panic') {
    ctx.beginPath(); ctx.moveTo(mx - 32, my);
    for (let k = 0; k < 6; k++) ctx.lineTo(mx - 32 + (k + 1) * 10.7, my + (k % 2 ? -8 : 8));
    ctx.stroke();
  } else if (s.expr === 'surprised') {
    ctx.beginPath(); ctx.ellipse(mx, my, 12, 14, 0, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(mx - 34, my - 6); ctx.quadraticCurveTo(mx, my + 22, mx + 34, my - 6); ctx.stroke();
  }
  ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(W * 0.5, H * 0.98, W * 0.46, Math.PI * 1.18, Math.PI * 1.33); ctx.stroke();
}

interface Limb { a: THREE.Group; b: THREE.Group; side: number }

export class ProceduralNova implements CharacterRig {
  readonly root = new THREE.Group();
  readonly height = 0.4;
  private bob = new THREE.Group();
  private head!: THREE.Mesh;
  private body!: THREE.Mesh;
  private arms: Record<'L' | 'R', Limb>;
  private legs: Limb[] = [];
  private face: ReturnType<typeof canvasTex<FaceState>>;
  private glowDisc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

  constructor() {
    const shell = toon(0xf1f4f9, {}, true), silver = toon(PALETTE.silver, {}, true);
    const screen = new THREE.MeshStandardMaterial({ color: 0x05070d, roughness: 0.22, metalness: 0.35 });
    this.root.add(this.bob);
    // head: a wide rounded shell with the face screen
    this.head = part(new THREE.SphereGeometry(0.095, 40, 30), shell, [0, 0.0, 0], { scale: [1.18, 0.98, 1.04], ink: 0.003 });
    this.bob.add(this.head);
    const VIS = { phiStart: Math.PI / 2 - 1.02, phiLength: 2.04, thetaStart: 0.62, thetaLength: 1.4 };
    this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.0957, 48, 32, VIS.phiStart, VIS.phiLength, VIS.thetaStart, VIS.thetaLength), screen));
    this.face = canvasTex<FaceState>(512, 320, drawFace, { expr: 'normal', blink: 0, mouth: 0, look: [0, 0] });
    const eyes = new THREE.Mesh(
      new THREE.SphereGeometry(0.0965, 48, 32, VIS.phiStart + 0.16, VIS.phiLength - 0.32, VIS.thetaStart + 0.12, VIS.thetaLength - 0.24),
      new THREE.MeshBasicMaterial({ map: this.face.tex, transparent: true, toneMapped: false, depthWrite: false }));
    eyes.material.color.setScalar(1.3);
    eyes.renderOrder = 3; this.head.add(eyes);
    for (const side of [-1, 1]) {
      this.head.add(part(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 24), silver, [side * 0.108, 0, 0], { rot: [0, 0, Math.PI / 2], ink: 0.002 }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 28), glow(PALETTE.cyan, 1.15));
      ring.position.set(side * 0.124, 0, 0); ring.rotation.y = Math.PI / 2; this.head.add(ring);
    }
    // body with the SN emblem
    this.body = part(new THREE.CapsuleGeometry(0.052, 0.045, 8, 20), shell, [0, -0.135, 0], { scale: [1.05, 1, 0.92], ink: 0.003 });
    this.bob.add(this.body);
    this.body.add(part(new THREE.TorusGeometry(0.053, 0.004, 6, 32), silver, [0, -0.03, 0], { rot: [Math.PI / 2, 0, 0], ink: false }));
    const emblem = canvasTex<number>(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#0b1324'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2); ctx.fill();
      ctx.font = `800 58px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#41d4f6';
      ctx.fillText('SN', w / 2, h * 0.54);
    }, 0);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.022, 28), new THREE.MeshBasicMaterial({ map: emblem.tex, toneMapped: false }));
    badge.position.set(0, 0.012, 0.049); this.body.add(badge);
    // arms and legs: small, articulated
    const limb = (x: number, y: number, side: number, upper: number, lower: number, end: THREE.Mesh): Limb => {
      const a = new THREE.Group(); a.position.set(x, y, 0); this.bob.add(a);
      a.add(part(new THREE.SphereGeometry(0.016, 12, 10), silver, [0, 0, 0], { ink: 0.002 }));
      a.add(part(new THREE.CapsuleGeometry(0.014, upper, 4, 10), shell, [0, -upper / 2 - 0.006, 0], { ink: 0.002 }));
      const b = new THREE.Group(); b.position.y = -upper - 0.012; a.add(b);
      b.add(part(new THREE.CapsuleGeometry(0.013, lower, 4, 10), shell, [0, -lower / 2, 0], { ink: 0.002 }));
      end.position.y = -lower - 0.012; b.add(end);
      return { a, b, side };
    };
    this.arms = {
      R: limb(-0.062, -0.105, -1, 0.032, 0.028, part(new THREE.SphereGeometry(0.019, 12, 10), shell, [0, 0, 0], { ink: 0.002 })),
      L: limb(0.062, -0.105, 1, 0.032, 0.028, part(new THREE.SphereGeometry(0.019, 12, 10), shell, [0, 0, 0], { ink: 0.002 })),
    };
    for (const side of [-1, 1]) {
      this.legs.push(limb(side * 0.026, -0.18, side, 0.026, 0.022, part(new RoundedBoxGeometry(0.036, 0.018, 0.05, 2, 0.008), silver, [0, -0.004, 0.008], { ink: 0.002 })));
    }
    // a soft hover glow under the feet
    const tex = canvasTex<number>(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(120,220,255,0.9)'); g.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }, 0);
    this.glowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), new THREE.MeshBasicMaterial({ map: tex.tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    this.glowDisc.rotation.x = -Math.PI / 2; this.glowDisc.position.y = -0.27; this.bob.add(this.glowDisc);
  }

  apply(s: CharacterState): void {
    const t = s.t, e = s.expression ?? 'normal';
    this.root.position.copy(s.position);
    this.root.rotation.set(0, s.yaw, 0);
    this.bob.position.y = Math.sin(t * 2.3) * 0.014 + (s.hop ?? 0);
    this.bob.rotation.set(Math.sin(t * 1.6) * 0.04, 0, (s.tilt ?? 0) + Math.sin(t * 1.9) * 0.05);
    // look: the head turns and tips toward the target
    let yaw = 0, pitch = 0, look: [number, number] = [Math.sin(t * 0.8) * 0.2, 0];
    if (s.lookAt) {
      this.root.updateMatrixWorld(true);
      const local = this.root.worldToLocal(s.lookAt.clone());
      yaw = clamp(Math.atan2(local.x, local.z), -0.9, 0.9);
      pitch = clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.5, 0.5);
      look = [clamp(yaw * 0.8, -1, 1), clamp(pitch, -1, 1)];
    }
    this.head.rotation.set(pitch * 0.7, yaw * 0.7, e === 'confused' || e === 'thinking' ? 0.25 : 0);
    // limbs: dangling legs, arms by the gesture
    this.legs.forEach((l, i) => { l.a.rotation.set(Math.sin(t * 2 + i) * 0.18 + 0.15, 0, l.side * 0.08); l.b.rotation.set(0.25 + Math.sin(t * 2 + i + 1) * 0.12, 0, 0); });
    const g = s.gesture, gw = g ? clamp(g.weight) : 0, gt = g?.time ?? 0;
    const arm = (l: Limb, x: number, z: number, elbow: number) => { l.a.rotation.set(x, 0, z); l.b.rotation.set(elbow, 0, 0); };
    arm(this.arms.R, 0.1 + Math.sin(t * 2.6) * 0.06, -0.35, -0.3);
    arm(this.arms.L, 0.1 + Math.sin(t * 2.6 + 1) * 0.06, 0.35, -0.3);
    if (g && gw > 0.01) {
      const mix = (l: Limb, x: number, z: number, elbow: number) => {
        l.a.rotation.set(l.a.rotation.x + (x - l.a.rotation.x) * gw, 0, l.a.rotation.z + (z - l.a.rotation.z) * gw);
        l.b.rotation.set(l.b.rotation.x + (elbow - l.b.rotation.x) * gw, 0, 0);
      };
      switch (g.name) {
        case 'point': mix(this.arms.R, -1.45, -0.25, 0); break;
        case 'wave': mix(this.arms.L, -0.2, 2.5 + Math.sin(gt * 11) * 0.35, -0.2); break;
        case 'celebrate': mix(this.arms.R, -0.2, -2.6 - Math.sin(gt * 9) * 0.2, 0); mix(this.arms.L, -0.2, 2.6 + Math.sin(gt * 9) * 0.2, 0); break;
        case 'panic': mix(this.arms.R, -0.4, -2.4 - Math.sin(gt * 24) * 0.35, -0.3); mix(this.arms.L, -0.4, 2.4 + Math.sin(gt * 22) * 0.35, -0.3); break;
        case 'think': mix(this.arms.R, -1.8, 0.35, -1.4); break;
        case 'explain': mix(this.arms.R, -0.9, -0.5 - Math.sin(gt * 4) * 0.2, -0.4); mix(this.arms.L, -0.9, 0.5 + Math.sin(gt * 4 + 1) * 0.2, -0.4); break;
        default: break;
      }
    }
    this.glowDisc.material.opacity = 0.55 + Math.sin(t * 13) * 0.1;
    this.face.redraw({
      expr: e, blink: e === 'normal' ? +(s.blink ?? 0).toFixed(2) : 0, mouth: +(s.mouth ?? 0).toFixed(2),
      look: [+look[0].toFixed(2), +look[1].toFixed(2)],
    });
  }

  headWorld(out = V()): THREE.Vector3 { return this.head.getWorldPosition(out); }
  handWorld(side: 'L' | 'R', out = V()): THREE.Vector3 { return this.arms[side].b.getWorldPosition(out); }
}

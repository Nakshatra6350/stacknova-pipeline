// The engineer as a 2.5D puppet made from one transparent illustration (the owner's art, October
// 2026). The picture stands upright and turns to face the camera. To give it life without
// redrawing it, the head bends at the neck (a smooth mesh deformation, no seams), the eyes blink
// and the mouth talks (drawn onto a 2x copy of the art at measured landmarks), the glasses glow
// for System Vision and cast a scan beam where he "points" (his arms are in his pockets in the
// art), and he arrives with a hologram reveal instead of a walk. One pose only: no arm gestures,
// no turning, no other angles. Behind the CharacterRig contract, like every other representation.
import * as THREE from 'three';
import type { CharacterRig, CharacterState } from './types';
import { clamp, V } from '../util/math';

/** Where things are in the source image, in its pixels. Defaults: the owner's 508 x 1376 art. */
export interface Landmarks {
  neck: [number, number];          // pivot the head bends around
  headFrom: number;                // above this y the head moves fully...
  headTo: number;                  // ...below this y not at all
  tilt: number;                    // the head's tilt in the art, radians (counter-clockwise < 0)
  eyes: [number, number, number, number][];   // centre x, y, width, height of each eye opening
  lenses: [number, number, number, number][]; // centre x, y, width, height of each lens
  mouth: [number, number, number];  // centre x, y, width
  chest: [number, number];          // where he holds things
}

export const ENGINEER_LANDMARKS: Landmarks = {
  neck: [213, 205], headFrom: 186, headTo: 216, tilt: -0.17,
  eyes: [[172.5, 131.5, 25, 11.5], [230, 118.8, 28, 12.5]],
  lenses: [[179, 135.5, 38, 29], [227.5, 122, 50, 31]],
  mouth: [211, 163.5, 27],
  chest: [215, 420],
};

const UP = 2; // the art is drawn at twice its size, so the drawn details stay crisp

export class SpriteCharacter implements CharacterRig {
  readonly root = new THREE.Group();
  readonly height: number;
  /** Close-ups beyond this would only show the art's pixels. */
  readonly minShotDistance = 1.55;
  readonly canWalk = false;
  private plane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private base: Float32Array;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private art: HTMLCanvasElement;
  private texture: THREE.CanvasTexture;
  private skin: string[] = [];
  private faceKey = '';
  private uniforms = { uReveal: { value: 1 }, uTime: { value: 0 } };
  private beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private beamDot: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private lensGlow: THREE.Sprite;
  private w: number; private h: number; private width: number;

  private constructor(image: HTMLImageElement, height: number, private L: Landmarks) {
    this.height = height;
    this.w = image.width; this.h = image.height;
    this.width = height * (this.w / this.h);
    // the art at 2x, its hair edges cleaned of the warm halo left by the cut-out
    this.art = document.createElement('canvas');
    this.art.width = this.w * UP; this.art.height = this.h * UP;
    const a = this.art.getContext('2d', { willReadFrequently: true })!;
    a.imageSmoothingEnabled = true; a.imageSmoothingQuality = 'high';
    a.drawImage(image, 0, 0, this.art.width, this.art.height);
    const px = a.getImageData(0, 0, this.art.width, this.art.height);
    const d = px.data;
    for (let i = 0; i < d.length; i += 4) {
      const alpha = d[i + 3];
      if (alpha > 0 && alpha < 235 && d[i] > d[i + 2] + 12) {
        const k = 1 - alpha / 235; // the more transparent, the more it is halo
        const grey = (d[i] + d[i + 1] + d[i + 2]) / 3 * 0.45;
        d[i] = d[i] * (1 - k) + grey * k * 0.8; d[i + 1] = d[i + 1] * (1 - k) + grey * k * 0.9; d[i + 2] = d[i + 2] * (1 - k) + grey * k * 1.25;
      }
    }
    a.putImageData(px, 0, 0);
    // skin colour under each eye and around the mouth, for blinking and talking
    const sample = (x: number, y: number) => { const p = a.getImageData(x * UP, y * UP, 1, 1).data; return `rgb(${p[0]},${p[1]},${p[2]})`; };
    this.skin = [sample(L.eyes[0][0], L.eyes[0][1] + 9), sample(L.eyes[1][0] - 2, L.eyes[1][1] + 10), sample(L.mouth[0] + 4, L.mouth[1] + 7)];
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.art.width; this.canvas.height = this.art.height;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.drawImage(this.art, 0, 0);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;

    // a finely divided plane, so the neck can bend smoothly
    const geometry = new THREE.PlaneGeometry(this.width, height, 24, 72);
    geometry.translate(0, height / 2, 0);
    this.base = (geometry.attributes.position.array as Float32Array).slice();
    const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uReveal = this.uniforms.uReveal;
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vY;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvY = uv.y;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uReveal;\nuniform float uTime;\nvarying float vY;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          if (uReveal < 1.0) {
            if (vY > uReveal + 0.002) discard;
            float edge = smoothstep(uReveal - 0.06, uReveal, vY);
            float lines = 0.5 + 0.5 * sin(vY * 900.0 + uTime * 20.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35, 0.85, 1.0), edge * 0.85 + (1.0 - uReveal) * 0.25 * lines);
          }`);
    };
    this.plane = new THREE.Mesh(geometry, material);
    this.plane.onBeforeRender = (_r, _s, camera) => {
      const p = camera.getWorldPosition(V()), me = this.root.getWorldPosition(V());
      this.plane.rotation.y = Math.atan2(p.x - me.x, p.z - me.z) - this.root.rotation.y;
    };
    this.root.add(this.plane);

    // System Vision: a soft glow on the glasses and a scan beam to what he looks at
    const glowTex = new THREE.CanvasTexture((() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d')!; const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(160,235,255,1)'); r.addColorStop(1, 'rgba(160,235,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return c;
    })());
    this.lensGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.2, 1.6, 1.8), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.lensGlow.scale.set(0.15, 0.065, 1);
    this.root.add(this.lensGlow);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.8, 2.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.beamDot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 2.0, 2.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.beam.frustumCulled = false;
  }

  static async load(url: string, height = 1.8, landmarks: Landmarks = ENGINEER_LANDMARKS): Promise<SpriteCharacter> {
    const image = new Image();
    image.src = url;
    await image.decode();
    return new SpriteCharacter(image, height, landmarks);
  }

  /** A point of the art (source pixels) in the plane's local space, before the head bends. */
  private local(x: number, y: number): THREE.Vector3 {
    return V((x / this.w - 0.5) * this.width, (1 - y / this.h) * this.height, 0.002);
  }

  private bend(angle: number, nod: number, breathe: number): void {
    const pos = this.plane.geometry.attributes.position as THREE.BufferAttribute;
    const uv = this.plane.geometry.attributes.uv as THREE.BufferAttribute;
    const pivot = this.local(...this.L.neck);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    for (let i = 0; i < pos.count; i++) {
      const py = (1 - uv.getY(i)) * this.h;
      const k = clamp((this.L.headTo - py) / (this.L.headTo - this.L.headFrom));
      const w = k * k * (3 - 2 * k);
      let x = this.base[i * 3], y = this.base[i * 3 + 1];
      // breathing: the chest swells a little
      const chest = clamp(1 - Math.abs(py - 420) / 260);
      x *= 1 + breathe * 0.006 * chest;
      if (w > 0) {
        const dx = x - pivot.x, dy = y - pivot.y;
        x = pivot.x + (dx * cos - dy * sin - dx) * w + dx;
        y = pivot.y + (dx * sin + dy * cos - dy) * w + dy + nod * w;
      }
      pos.setXY(i, x, y);
    }
    pos.needsUpdate = true;
  }

  private drawFace(blink: number, mouth: number, shape: string, vision: number): void {
    const key = `${blink.toFixed(2)}|${mouth.toFixed(2)}|${shape}|${vision.toFixed(2)}`;
    if (key === this.faceKey) return;
    this.faceKey = key;
    const c = this.ctx, L = this.L;
    // restore the face region from the clean art, then draw on it
    const [fx, fy, fw, fh] = [140, 95, 135, 90];
    c.clearRect(fx * UP, fy * UP, fw * UP, fh * UP);
    c.drawImage(this.art, fx * UP, fy * UP, fw * UP, fh * UP, fx * UP, fy * UP, fw * UP, fh * UP);
    c.save(); c.scale(UP, UP);
    // eyelids: skin closes from the top, a lash line marks the lid's edge
    if (blink > 0.05) {
      L.eyes.forEach(([x, y, w, h], i) => {
        c.save(); c.translate(x, y); c.rotate(L.tilt);
        c.beginPath(); c.ellipse(0, 0, w / 2 + 1, h / 2 + 1, 0, 0, Math.PI * 2); c.clip();
        c.fillStyle = this.skin[i]; c.fillRect(-w, -h, w * 2, h * (0.4 + blink * 1.15));
        c.restore();
        c.save(); c.translate(x, y); c.rotate(L.tilt);
        const edge = -h / 2 + h * blink;
        c.strokeStyle = '#1b1012'; c.lineWidth = 2.2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-w / 2, edge - 1); c.quadraticCurveTo(0, edge + 3 * blink, w / 2, edge - 2); c.stroke();
        c.restore();
      });
    }
    // mouth: open while he talks, round when he is surprised
    const [mx, my, mw] = L.mouth;
    if (mouth > 0.08 || shape === 'o') {
      c.save(); c.translate(mx, my); c.rotate(L.tilt * 0.6);
      c.fillStyle = this.skin[2];
      c.beginPath(); c.ellipse(0, 0, mw / 2 + 2, 6, 0, 0, Math.PI * 2); c.fill();
      const open = shape === 'o' ? 0.7 : mouth;
      const ow = shape === 'o' ? 5 : mw * (0.28 + open * 0.12), oh = 1.2 + open * 5.5;
      c.fillStyle = '#4a1820';
      c.beginPath(); c.ellipse(0, 0.5, ow, oh, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(230,110,120,0.9)';
      c.beginPath(); c.ellipse(0, oh * 0.55, ow * 0.55, oh * 0.35, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(70,25,30,0.8)'; c.lineWidth = 0.8;
      c.beginPath(); c.ellipse(0, 0.5, ow, oh, 0, 0, Math.PI * 2); c.stroke();
      c.restore();
    }
    // System Vision: the lenses fill with cyan light
    if (vision > 0.02) {
      L.lenses.forEach(([x, y, w, h]) => {
        c.save(); c.translate(x, y); c.rotate(L.tilt);
        c.globalCompositeOperation = 'lighter';
        const g = c.createRadialGradient(0, 0, 1, 0, 0, w / 2);
        g.addColorStop(0, `rgba(140,230,255,${0.55 * vision})`); g.addColorStop(1, `rgba(40,170,230,${0.25 * vision})`);
        c.fillStyle = g;
        c.beginPath(); c.ellipse(0, 0, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2); c.fill();
        c.restore();
      });
    }
    c.restore();
    this.texture.needsUpdate = true;
  }

  apply(s: CharacterState): void {
    const t = s.t;
    this.uniforms.uTime.value = t;
    this.uniforms.uReveal.value = clamp(s.appear ?? 1);
    this.root.position.copy(s.position);
    this.root.rotation.set(0, s.yaw, 0);
    const talking = (s.mouth ?? 0) > 0.05;
    const g = s.gesture, gw = g ? clamp(g.weight) : 0;
    // the head: tilts toward what he looks at, nods while he talks and on 'nod'
    let angle = Math.sin(t * 0.6) * 0.012;
    if (s.lookAt) {
      this.root.updateMatrixWorld(true);
      const local = this.root.worldToLocal(s.lookAt.clone());
      angle += clamp(-local.x * 0.03, -0.05, 0.05);
    }
    if (g?.name === 'think') angle += 0.06 * gw;
    if (g?.name === 'vision') angle -= 0.03 * gw;
    let nod = talking ? Math.sin(t * 7.3) * 0.004 : 0;
    if (g?.name === 'nod' || g?.name === 'explain') nod += Math.max(0, Math.sin(g.time * 6)) * 0.008 * gw;
    this.bend(angle, nod, Math.sin(t * 1.9));
    const shape = s.expression === 'surprised' || s.expression === 'panic' ? 'o' : '';
    this.drawFace(clamp(s.blink ?? 0), clamp(s.mouth ?? 0) * 0.9, shape, clamp(s.vision ?? 0));
    // glasses glow and the scan beam
    const vision = clamp(s.vision ?? 0);
    const lensMid = this.local((this.L.lenses[0][0] + this.L.lenses[1][0]) / 2, (this.L.lenses[0][1] + this.L.lenses[1][1]) / 2);
    this.lensGlow.position.copy(lensMid).add(V(0, 0, 0.03));
    this.lensGlow.material.opacity = Math.max(0, vision - 0.25) * 0.55;
    const beamOn = g?.name === 'point' && g.target ? gw : 0;
    if (beamOn > 0 && g?.target) {
      if (!this.beam.parent) this.root.parent?.add(this.beam, this.beamDot);
      this.root.updateMatrixWorld(true);
      const from = this.root.localToWorld(lensMid.clone());
      const to = g.target.clone();
      const len = from.distanceTo(to) * clamp(g.time / 0.35);
      const dir = to.clone().sub(from).normalize();
      this.beam.position.copy(from).addScaledVector(dir, len / 2);
      this.beam.scale.set(1, Math.max(0.001, len), 1);
      this.beam.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
      this.beam.material.opacity = 0.75 * beamOn;
      this.beamDot.position.copy(from).addScaledVector(dir, len);
      this.beamDot.material.opacity = beamOn * (0.6 + 0.4 * Math.sin(t * 14));
      this.lensGlow.material.opacity = Math.max(this.lensGlow.material.opacity, 0.35 * beamOn);
    } else {
      this.beam.material.opacity = 0; this.beamDot.material.opacity = 0;
    }
  }

  headWorld(out = V()): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return out.copy(this.root.localToWorld(this.local(this.L.neck[0], 130)));
  }
  handWorld(_side: 'L' | 'R', out = V()): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return out.copy(this.root.localToWorld(this.local(...this.L.chest).add(V(0, 0, 0.15))));
  }
}

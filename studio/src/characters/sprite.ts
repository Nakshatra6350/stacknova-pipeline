// The engineer as a 2.5D puppet made from one transparent illustration (the owner's art, October
// 2026). The picture stands upright and turns to face the camera. To give it life without
// redrawing it, the body bends as a finely divided plane (no seams): he breathes, shifts his
// weight, leans, shrugs, startles and bounces; his head tilts, nods on stressed words and shakes;
// his hair sways. His face is drawn onto a 2x copy of the art at measured landmarks: blinking,
// narrowed, wide and happy (^ ^) eyes and a wink; a talking mouth whose shape changes, a smile, a
// pressed line, a thinking pout, an "o" and a grin; blush; a glint sliding across his glasses.
// Anime marks float beside his head: "!" and a sweat drop when he is startled, a thought bubble
// while he thinks, sparkles when he is pleased. The glasses glow for System Vision and cast a
// scan beam where he "points" (his arms are in his pockets in the art), and he arrives with a
// hologram reveal instead of a walk. One pose of the body only: no arm gestures, no turning, no
// other angles. Behind the CharacterRig contract, like every other representation.
import * as THREE from 'three';
import type { CharacterRig, CharacterState } from './types';
import { backOut, clamp, pulse, smooth, span, V } from '../util/math';

/** Where things are in the source image, in its pixels. Defaults: the owner's 508 x 1376 art. */
export interface Landmarks {
  neck: [number, number];          // pivot the head bends around
  headFrom: number;                // above this y the head moves fully...
  headTo: number;                  // ...below this y not at all
  tilt: number;                    // the head's tilt in the art, radians (counter-clockwise < 0)
  eyes: [number, number, number, number][];   // centre x, y, width, height of each eye opening
  lenses: [number, number, number, number][]; // centre x, y, width, height of each lens
  mouth: [number, number, number, number];    // centre x, y, width and slant of the art's mouth
  cheeks: [number, number][];      // where he blushes
  crown: number;                   // above this y the hair sways
  shoulders: number;               // at and above this y the shoulders shrug and rise with a breath
  chest: [number, number];         // where he holds things; the breath swells around it
  hips: [number, number];          // pivot the upper body leans around
}

export const ENGINEER_LANDMARKS: Landmarks = {
  neck: [213, 205], headFrom: 186, headTo: 216, tilt: -0.17,
  eyes: [[172.5, 131.5, 25, 11.5], [230, 118.8, 28, 12.5]],
  lenses: [[179, 135.5, 38, 29], [227.5, 122, 50, 31]],
  mouth: [211, 164.7, 30, -0.31],
  cheeks: [[186, 157], [242, 148]],
  crown: 105, shoulders: 240, chest: [215, 420], hips: [215, 600],
};

const UP = 2; // the art is drawn at twice its size, so the drawn details stay crisp
const INK = '#1b1012', LIP = 'rgb(128,58,58)', MOUTH = '#4a1820';
/** Sparkles around his head: source x, y and the phase of their twinkle. */
const SPARKLES: [number, number, number][] = [[352, 92, 0], [86, 150, 0.3], [334, 196, 0.62], [398, 142, 0.86]];

type MouthShape = 'art' | 'smile' | 'flat' | 'side' | 'grin' | 'o';

/** Everything drawn on the face this frame. */
interface Face {
  lid: [number, number];   // upper lids down, per eye (blinks and narrowed eyes)
  low: number;             // lower lids up (smiling or narrowed eyes)
  wide: number;            // eyes opened wider (a start)
  happy: [number, number]; // eyes closed in a ^ curve, per eye (one of them is a wink)
  mouth: number;           // 0..1 open, from the voice
  shape: MouthShape;       // the mouth at rest, and what kind of opening it makes
  smile: number;           // corners of a talking mouth turned up
  vis: number;             // a talking mouth's width, 0.85..1.15 (vowels vary)
  blush: number;
  glint: number;           // -1 none, else 0..1 a band of light crossing the lenses
  vision: number;
}

/** How the body is bent this frame, in metres and radians in the picture's plane. */
interface Pose {
  angle: number;   // head roll about the neck (counter-clockwise > 0)
  nod: number;     // head down (< 0: chin up)
  breathe: number; // -1..1
  shrug: number;   // shoulders up
  hair: number;    // the tips of the hair move sideways
  stretch: number; // the upper body stands taller (a start, a bounce)
  lean: number;    // the upper body rolls about the hips
  sway: number;    // the top of the body shifts sideways; the feet stay put
}

/** 0 at a, 1 at b, smooth in between (a may be greater than b). */
const band = (v: number, a: number, b: number): number => smooth((v - a) / (b - a));

function markTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; g.lineJoin = 'round'; g.lineCap = 'round';
  draw(g);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function markSprite(map: THREE.Texture, additive = false): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map, transparent: true, opacity: 0, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive,
  }));
  s.visible = false; s.renderOrder = 20; // after the world's glass and cards, which do not write depth
  return s;
}

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
  private skin: number[][] = [];
  private faceKey = '';
  private uniforms = { uReveal: { value: 1 }, uTime: { value: 0 } };
  private beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private beamDot: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private lensGlow: THREE.Sprite;
  private bang: THREE.Sprite;
  private sweat: THREE.Sprite;
  private bubble: THREE.Sprite;
  private bubbleCtx: CanvasRenderingContext2D;
  private bubbleDots = -1;
  private sparkles: THREE.Sprite[];
  private cameraGiven = false;
  private pose: Pose = { angle: 0, nod: 0, breathe: 0, shrug: 0, hair: 0, stretch: 0, lean: 0, sway: 0 };
  // fixed points of the art in the plane's space, and the head roll of this frame
  private cx: number; private neck: THREE.Vector3; private neckHead: number; private hip: THREE.Vector3;
  private cos = 1; private sin = 0;
  private w: number; private h: number; private width: number;

  private constructor(image: HTMLImageElement, height: number, private L: Landmarks) {
    this.height = height;
    this.w = image.width; this.h = image.height;
    this.width = height * (this.w / this.h);
    this.cx = this.local(L.chest[0], 0).x;
    this.neck = this.local(...L.neck);
    this.neckHead = band(L.neck[1], L.headTo, L.headFrom);
    this.hip = this.local(...L.hips);
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
    // skin colour under each eye and around the mouth, for eyelids and mouths
    const sample = (x: number, y: number) => Array.from(a.getImageData(x * UP, y * UP, 1, 1).data.slice(0, 3));
    this.skin = [sample(L.eyes[0][0], L.eyes[0][1] + 9), sample(L.eyes[1][0] - 2, L.eyes[1][1] + 10), sample(L.mouth[0] + 4, L.mouth[1] + 7)];
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.art.width; this.canvas.height = this.art.height;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.drawImage(this.art, 0, 0);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;

    // a finely divided plane, so the body can bend smoothly
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
    // without a camera in the state (explore and lab modes) the picture turns to whatever renders it
    this.plane.onBeforeRender = (_r, _s, camera) => {
      if (!this.cameraGiven) this.faceCamera(camera.getWorldPosition(V()));
    };
    this.root.add(this.plane);

    // System Vision: a soft glow on the glasses and a scan beam to what he looks at
    const glowTex = markTexture(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(160,235,255,1)'); r.addColorStop(1, 'rgba(160,235,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    });
    this.lensGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.2, 1.6, 1.8), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.lensGlow.scale.set(0.15, 0.065, 1);
    this.plane.add(this.lensGlow);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.8, 2.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.beamDot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 2.0, 2.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.beam.frustumCulled = false;

    // anime marks: "!" with three start lines, a sweat drop, a thought bubble, sparkles
    this.bang = markSprite(markTexture(128, 128, (g) => {
      for (const [x1, y1, x2, y2] of [[16, 38, 34, 52], [10, 70, 32, 70], [16, 102, 34, 88]]) {
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
        g.strokeStyle = '#0b1420'; g.lineWidth = 12; g.stroke(); g.strokeStyle = '#8fe6ff'; g.lineWidth = 6; g.stroke();
      }
      g.beginPath(); g.moveTo(64, 12); g.lineTo(98, 12); g.lineTo(88, 82); g.lineTo(74, 82); g.closePath();
      g.moveTo(92, 104); g.arc(81, 104, 11, 0, Math.PI * 2);
      g.lineWidth = 9; g.strokeStyle = '#0b1420'; g.stroke(); g.fillStyle = '#eefaff'; g.fill();
    }));
    this.sweat = markSprite(markTexture(64, 96, (g) => {
      g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(28, 28, 12, 44, 12, 64); g.arc(32, 64, 20, Math.PI, 0, true);
      g.bezierCurveTo(52, 44, 36, 28, 32, 6); g.closePath();
      const fill = g.createLinearGradient(0, 6, 0, 84); fill.addColorStop(0, '#e6f7ff'); fill.addColorStop(1, '#6cc4ee');
      g.lineWidth = 5; g.strokeStyle = '#0b1420'; g.stroke(); g.fillStyle = fill; g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(24, 62, 4, 7, -0.3, 0, Math.PI * 2); g.fill();
    }));
    const bubbleTex = markTexture(256, 160, () => undefined);
    this.bubbleCtx = (bubbleTex.image as HTMLCanvasElement).getContext('2d')!;
    this.bubble = markSprite(bubbleTex);
    const star = markTexture(64, 64, (g) => {
      g.shadowColor = 'rgba(120,220,255,1)'; g.shadowBlur = 10;
      g.beginPath(); g.moveTo(32, 4); g.quadraticCurveTo(35, 29, 60, 32); g.quadraticCurveTo(35, 35, 32, 60);
      g.quadraticCurveTo(29, 35, 4, 32); g.quadraticCurveTo(29, 29, 32, 4);
      g.fillStyle = '#ffffff'; g.fill();
    });
    this.sparkles = SPARKLES.map(() => markSprite(star, true));
    this.plane.add(this.bang, this.sweat, this.bubble, ...this.sparkles);
  }

  static async load(url: string, height = 1.8, landmarks: Landmarks = ENGINEER_LANDMARKS): Promise<SpriteCharacter> {
    const image = new Image();
    image.src = url;
    await image.decode();
    return new SpriteCharacter(image, height, landmarks);
  }

  /** A point of the art (source pixels) in the plane's space, before the body bends. */
  private local(x: number, y: number): THREE.Vector3 {
    return V((x / this.w - 0.5) * this.width, (1 - y / this.h) * this.height, 0.002);
  }

  /** Where a point of the art (source pixels) is this frame, in the plane's space. */
  private posed(px: number, py: number, z = 0.002): THREE.Vector3 {
    const b = this.local(px, py);
    const [x, y] = this.deform(px, py, b.x, b.y);
    return V(x, y, z);
  }

  /** Bends one point of the picture by this frame's pose. */
  private deform(px: number, py: number, x: number, y: number): [number, number] {
    const L = this.L, p = this.pose, y0 = y;
    const head = band(py, L.headTo, L.headFrom);
    const upper = band(py, L.shoulders + 110, L.shoulders);
    const torso = band(py, L.hips[1] + 80, L.hips[1] - 60);
    // the breath swells the chest; breath and shrug lift the shoulders, the head less (the neck shortens)
    const chest = clamp(1 - Math.abs(py - L.chest[1]) / 260);
    x = this.cx + (x - this.cx) * (1 + p.breathe * 0.008 * chest);
    const lift = p.breathe * 0.003 + p.shrug;
    y += lift * upper * (1 - 0.45 * head);
    // the head rolls about the neck and nods; the tips of the hair trail
    if (head > 0) {
      const nx = this.neck.x, ny = this.neck.y + lift * (1 - 0.45 * this.neckHead);
      const dx = x - nx, dy = y - ny;
      x = nx + (dx * this.cos - dy * this.sin - dx) * head + dx;
      y = ny + (dx * this.sin + dy * this.cos - dy) * head + dy - p.nod * head;
      if (py < L.crown) x += p.hair * Math.pow((L.crown - py) / L.crown, 1.5);
    }
    // the upper body stands taller and leans about the hips
    if (torso > 0) {
      const hx = this.hip.x, hy = this.hip.y;
      y = hy + (y - hy) * (1 + p.stretch * torso);
      const a = p.lean * torso, c = Math.cos(a), s = Math.sin(a), dx = x - hx, dy = y - hy;
      x = hx + dx * c - dy * s; y = hy + dx * s + dy * c;
    }
    // the weight shifts from foot to foot
    x += p.sway * (y0 / this.height);
    return [x, y];
  }

  private bendAll(): void {
    const pos = this.plane.geometry.attributes.position as THREE.BufferAttribute;
    const uv = this.plane.geometry.attributes.uv as THREE.BufferAttribute;
    this.cos = Math.cos(this.pose.angle); this.sin = Math.sin(this.pose.angle);
    for (let i = 0; i < pos.count; i++) {
      const [x, y] = this.deform(uv.getX(i) * this.w, (1 - uv.getY(i)) * this.h, this.base[i * 3], this.base[i * 3 + 1]);
      pos.setXY(i, x, y);
    }
    pos.needsUpdate = true;
  }

  private faceCamera(camera: THREE.Vector3): void {
    const me = this.root.getWorldPosition(V());
    this.plane.rotation.y = Math.atan2(camera.x - me.x, camera.z - me.z) - this.root.rotation.y;
  }

  private skinA(i: number, alpha: number): string {
    const [r, g, b] = this.skin[i];
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private drawFace(f: Face): void {
    const key = [f.lid[0], f.lid[1], f.low, f.wide, f.happy[0], f.happy[1], f.mouth, f.smile, f.vis, f.blush, f.glint, f.vision]
      .map((v) => v.toFixed(2)).join('|') + f.shape;
    if (key === this.faceKey) return;
    this.faceKey = key;
    const c = this.ctx;
    // restore the face region from the clean art, then draw on it
    const [fx, fy, fw, fh] = [140, 95, 135, 90];
    c.clearRect(fx * UP, fy * UP, fw * UP, fh * UP);
    c.drawImage(this.art, fx * UP, fy * UP, fw * UP, fh * UP, fx * UP, fy * UP, fw * UP, fh * UP);
    c.save(); c.scale(UP, UP);
    c.lineCap = 'round'; c.lineJoin = 'round';
    this.drawEyes(c, f);
    this.drawMouth(c, f);
    if (f.blush > 0.02) this.drawBlush(c, f.blush);
    // System Vision: the lenses fill with cyan light
    if (f.vision > 0.02) {
      this.L.lenses.forEach(([x, y, w, h]) => {
        c.save(); c.translate(x, y); c.rotate(this.L.tilt);
        c.globalCompositeOperation = 'lighter';
        const g = c.createRadialGradient(0, 0, 1, 0, 0, w / 2);
        g.addColorStop(0, `rgba(140,230,255,${0.55 * f.vision})`); g.addColorStop(1, `rgba(40,170,230,${0.25 * f.vision})`);
        c.fillStyle = g;
        c.beginPath(); c.ellipse(0, 0, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2); c.fill();
        c.restore();
      });
    }
    if (f.glint >= 0) this.drawGlint(c, f.glint);
    c.restore();
    this.texture.needsUpdate = true;
  }

  private drawEyes(c: CanvasRenderingContext2D, f: Face): void {
    const L = this.L, grow = 1 + 0.16 * f.wide;
    L.eyes.forEach(([x, y, w, h], i) => {
      const ew = w * grow, eh = h * grow;
      const clip = (m: number) => { c.beginPath(); c.ellipse(0, 0, ew / 2 + m, eh / 2 + m, 0, 0, Math.PI * 2); c.clip(); };
      c.save(); c.translate(x, y); c.rotate(L.tilt);
      if (f.wide > 0.01) {
        // the art's own eye, drawn a little larger about its centre
        const sw = w + 10, sh = h + 10;
        c.save(); clip(1.5); c.rotate(-L.tilt);
        c.drawImage(this.art, (x - sw / 2) * UP, (y - sh / 2) * UP, sw * UP, sh * UP, -sw * grow / 2, -sh * grow / 2, sw * grow, sh * grow);
        c.restore();
      }
      c.strokeStyle = INK; c.fillStyle = this.skinA(i, 1);
      if (f.happy[i] > 0.5) {
        // closed in a happy curve: ^
        c.save(); clip(2); c.fillRect(-ew, -eh, ew * 2, eh * 2); c.restore();
        c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(-ew / 2, eh * 0.2); c.quadraticCurveTo(0, -eh * 0.8, ew / 2, eh * 0.2); c.stroke();
      } else {
        const lid = f.lid[i];
        if (lid > 0.05) {
          // the upper lid closes from the top; a lash line marks its edge
          c.save(); clip(1); c.fillRect(-ew, -eh, ew * 2, eh * (0.4 + lid * 1.15)); c.restore();
          const edge = -eh / 2 + eh * lid;
          c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(-ew / 2, edge - 1); c.quadraticCurveTo(0, edge + 3 * lid, ew / 2, edge - 2); c.stroke();
        }
        if (f.low > 0.03) {
          // the lower lid rises: a smiling or narrowed eye
          const edge = eh / 2 + 1 - eh * 0.9 * f.low;
          c.save(); clip(1.5);
          c.beginPath(); c.moveTo(-ew, eh); c.lineTo(-ew, edge + 2); c.quadraticCurveTo(0, edge - 2.5 * f.low, ew, edge + 2); c.lineTo(ew, eh); c.closePath(); c.fill();
          c.restore();
          c.strokeStyle = `rgba(110,50,55,${0.6 * Math.min(1, f.low * 3)})`; c.lineWidth = 1;
          c.beginPath(); c.moveTo(-ew * 0.4, edge + 1.2); c.quadraticCurveTo(0, edge - 2.5 * f.low, ew * 0.4, edge + 1.2); c.stroke();
        }
      }
      c.restore();
    });
  }

  private drawMouth(c: CanvasRenderingContext2D, f: Face): void {
    const [mx, my, mw, slant] = this.L.mouth;
    const talking = f.mouth > 0.08;
    if (!talking && f.shape === 'art') return;
    c.save(); c.translate(mx, my);
    // the art's own mouth painted away under a soft patch of skin
    c.save(); c.rotate(slant);
    const rx = mw / 2 + 7; c.scale(1, 7 / rx);
    const patch = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    patch.addColorStop(0, this.skinA(2, 1)); patch.addColorStop(0.78, this.skinA(2, 1)); patch.addColorStop(1, this.skinA(2, 0));
    c.fillStyle = patch; c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill();
    c.restore();
    c.rotate(this.L.tilt);
    if (talking || f.shape === 'o' || f.shape === 'grin') this.openMouth(c, f, talking);
    else {
      c.strokeStyle = LIP; c.lineWidth = 1.8;
      c.beginPath();
      if (f.shape === 'smile') { c.moveTo(-12, -2.4); c.quadraticCurveTo(0, 3.6, 12, -2.4); }
      else if (f.shape === 'flat') { c.moveTo(-9, 0.3); c.lineTo(9, -0.3); }
      else { c.moveTo(-1, 1); c.quadraticCurveTo(5, -0.4, 11, -1.8); } // 'side': a thinking pout
      c.stroke();
      if (f.shape === 'smile') {
        c.strokeStyle = 'rgba(150,80,80,0.45)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(-4, 4.2); c.quadraticCurveTo(0, 5.2, 4, 4.2); c.stroke();
      }
    }
    c.restore();
  }

  /** An open mouth: talking (its width varies), a round "o" or a wide grin. */
  private openMouth(c: CanvasRenderingContext2D, f: Face, talking: boolean): void {
    const open = talking ? f.mouth : 0.55;
    let path: () => void, top: number, bottom: number, ow: number;
    if (f.shape === 'o') {
      ow = 3.4 + open * 1.6; const oh = 3 + open * 3.2;
      path = () => { c.beginPath(); c.ellipse(0, 0.6, ow, oh, 0, 0, Math.PI * 2); };
      top = 0.6 - oh; bottom = 0.6 + oh;
    } else {
      const grin = f.shape === 'grin';
      ow = grin ? 12 : this.L.mouth[2] * (0.26 + open * 0.1) * f.vis;
      const oh = grin ? 8.5 : 1.2 + open * 5.5 * (2.05 - f.vis);
      const lift = grin ? 3 : f.smile * 2.2;
      path = () => {
        c.beginPath(); c.moveTo(-ow, -lift);
        c.quadraticCurveTo(0, -oh * 0.3 - lift * 0.3, ow, -lift);
        c.quadraticCurveTo(0, oh * 1.6 - lift, -ow, -lift); c.closePath();
      };
      top = -0.65 * lift - 0.15 * oh; bottom = 0.8 * oh - lift;
    }
    path(); c.fillStyle = MOUTH; c.fill();
    c.save(); path(); c.clip();
    if (open > 0.35 || f.shape === 'grin') { c.fillStyle = 'rgba(250,244,240,0.95)'; c.fillRect(-20, top - 10, 40, 11.8); }
    c.fillStyle = 'rgba(220,105,115,0.95)';
    c.beginPath(); c.ellipse(0, bottom - (bottom - top) * 0.22, ow * 0.55, (bottom - top) * 0.3, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    path(); c.strokeStyle = 'rgba(70,25,30,0.85)'; c.lineWidth = 0.9; c.stroke();
  }

  private drawBlush(c: CanvasRenderingContext2D, k: number): void {
    this.L.cheeks.forEach(([x, y]) => {
      c.save(); c.translate(x, y); c.rotate(this.L.tilt); c.scale(1, 0.55);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 10);
      g.addColorStop(0, `rgba(255,120,135,${0.42 * k})`); g.addColorStop(1, 'rgba(255,120,135,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 10, 0, Math.PI * 2); c.fill();
      c.restore();
      if (k > 0.45) {
        // three short strokes, the anime blush
        c.strokeStyle = `rgba(215,80,95,${0.55 * (k - 0.45) / 0.55})`; c.lineWidth = 0.9;
        for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(x + i * 3.2 - 1.2, y + 1.6); c.lineTo(x + i * 3.2 + 1.2, y - 1.6); c.stroke(); }
      }
    });
  }

  /** A slanted band of light that travels across both lenses as k goes 0..1. */
  private drawGlint(c: CanvasRenderingContext2D, k: number): void {
    const X = 152 + k * 112;
    this.L.lenses.forEach(([x, y, w, h]) => {
      c.save(); c.translate(x, y); c.rotate(this.L.tilt);
      c.beginPath(); c.ellipse(0, 0, w / 2 - 1.5, h / 2 - 1.5, 0, 0, Math.PI * 2); c.clip();
      c.globalCompositeOperation = 'lighter';
      c.translate(X - x, 0); c.rotate(0.55);
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(-2.5, -h, 5, h * 2);
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(5, -h, 1.6, h * 2);
      c.restore();
    });
  }

  /** The thought bubble with 1 to 3 dots. */
  private drawBubble(dots: number): void {
    if (dots === this.bubbleDots) return;
    this.bubbleDots = dots;
    const g = this.bubbleCtx;
    g.clearRect(0, 0, 256, 160);
    // the bubble sits up and to the right of his head; its trail of circles leads down to it
    g.beginPath();
    g.moveTo(20 + 6, 150); g.arc(20, 150, 6, 0, Math.PI * 2);
    g.moveTo(42 + 11, 130); g.arc(42, 130, 11, 0, Math.PI * 2);
    g.moveTo(136 + 104, 64); g.ellipse(136, 64, 104, 54, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(12,22,38,0.88)'; g.fill();
    g.strokeStyle = 'rgba(120,220,255,0.9)'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#dff6ff';
    for (let i = 0; i < dots; i++) { g.beginPath(); g.arc(96 + i * 40, 66, 11, 0, Math.PI * 2); g.fill(); }
    this.bubble.material.map!.needsUpdate = true;
  }

  /** Shows a mark beside the head at a point of the art (source pixels), w x h metres. */
  private mark(sprite: THREE.Sprite, px: number, py: number, w: number, h: number, opacity: number): void {
    sprite.visible = opacity > 0.01 && w > 0.002;
    if (!sprite.visible) return;
    sprite.position.copy(this.posed(px, py, 0.06));
    sprite.scale.set(w, h, 1);
    sprite.material.opacity = clamp(opacity);
  }

  apply(s: CharacterState): void {
    const t = s.t;
    const appear = clamp(s.appear ?? 1);
    this.uniforms.uTime.value = t;
    this.uniforms.uReveal.value = appear;
    this.root.position.copy(s.position);
    this.root.rotation.set(0, s.yaw, 0);
    if (s.camera) { this.cameraGiven = true; this.faceCamera(s.camera); }
    this.root.updateMatrixWorld(true);
    const sideOf = (w: THREE.Vector3) => this.plane.worldToLocal(w.clone()).x - this.neck.x;
    const g = s.gesture, gw = g ? clamp(g.weight) : 0, gt = g?.time ?? 0, gn = g?.name ?? 'none';
    const ex = s.expression ?? 'calm', et = s.expressionTime ?? 10;
    const talk = clamp(s.talk ?? ((s.mouth ?? 0) > 0.05 ? 1 : 0)), stress = clamp(s.emphasis ?? 0);

    // ---- the body. At rest he breathes, shifts his weight and his head and hair drift.
    const p = this.pose;
    p.breathe = Math.sin(t * 1.9);
    p.angle = Math.sin(t * 0.6) * 0.018 + Math.sin(t * 0.23 + 1.2) * 0.014;
    p.sway = Math.sin(t * 0.41) * 0.012 + Math.sin(t * 0.17 + 2.0) * 0.008;
    p.lean = Math.sin(t * 0.31 + 0.7) * 0.008;
    p.hair = Math.sin(t * 1.3) * 0.005 + Math.sin(t * 2.3 + 1.0) * 0.0025;
    p.nod = 0; p.shrug = 0; p.stretch = 0;
    // he tilts his head toward what he looks at
    if (s.lookAt) p.angle += clamp(-sideOf(s.lookAt) * 0.06, -0.08, 0.08);
    // speaking: the head dips on stressed syllables and turns a little, the shoulders follow
    p.nod += stress * 0.011 + talk * Math.sin(t * 4.7) * 0.0025;
    p.angle += talk * Math.sin(t * 2.2 + 0.5) * 0.022;
    p.shrug += stress * talk * 0.004;
    p.sway += talk * Math.sin(t * 0.9 + 0.3) * 0.006;
    switch (gn) {
      case 'nod': p.nod += Math.max(0, Math.sin(gt * 10)) * 0.02 * gw * clamp(1 - gt / 1.0); break;
      case 'shake': {
        const fade = clamp(1 - gt / 0.85) * gw;
        p.angle += Math.sin(gt * 15) * 0.07 * fade; p.hair += Math.sin(gt * 15 - 0.8) * 0.008 * fade; break;
      }
      case 'explain': p.shrug += (0.5 + 0.5 * Math.sin(gt * 3.1)) * 0.006 * gw; p.angle += Math.sin(gt * 1.6) * 0.03 * gw; p.lean += Math.sin(gt * 0.9) * 0.012 * gw; break;
      case 'think': p.angle += 0.1 * gw; p.lean += 0.02 * gw; p.nod -= 0.005 * gw; break;
      case 'vision': p.nod -= 0.012 * gw; p.stretch += 0.008 * gw; break;
      case 'present': p.shrug += 0.012 * gw; p.angle += 0.05 * gw; p.lean -= 0.012 * gw; break;
      case 'point': if (g?.target) p.lean += clamp(-sideOf(g.target) * 0.03, -0.035, 0.035) * gw; p.nod -= 0.006 * gw; break;
      case 'thumbsUp': p.stretch += Math.max(0, Math.sin(gt * 8)) * 0.014 * Math.exp(-gt * 1.4) * gw; p.angle += 0.06 * gw * smooth(gt / 0.4); break;
      default: break;
    }
    // a start: he jolts upright, head back, shoulders up, and the hair bounces
    if (ex === 'surprised') {
      const jolt = smooth(et / 0.08) * Math.exp(-Math.max(0, et - 0.08) * 3.2);
      p.stretch += 0.024 * jolt; p.nod -= 0.016 * jolt; p.shrug += 0.014 * jolt;
      p.hair += Math.sin(et * 19) * 0.012 * Math.exp(-et * 3.5);
    }
    this.bendAll();

    // ---- the face
    const blink = clamp(s.blink ?? 0);
    let lid = 0, low = 0, wide = 0, blush = 0, smile = 0, glint = -1;
    let happy: [number, number] = [0, 0], shape: MouthShape = 'art';
    switch (ex) {
      case 'focus': lid = 0.3; low = 0.15; shape = 'flat'; break;
      case 'thinking': lid = 0.28; low = 0.22; shape = 'side'; break;
      case 'smile': low = 0.32; smile = 1; shape = 'smile'; blush = 0.3; break;
      case 'smirk': lid = 0.12; low = 0.15; smile = 0.5; break; // the art's own mouth is a smirk
      case 'surprised': wide = 1 - smooth(span(et, 0.9, 1.2)); shape = 'o'; break;
      default: break;
    }
    const sweep = (k: number) => (k > 0 && k < 1 ? k : -1);
    if (ex === 'smirk') glint = sweep(et / 0.5);
    if (gn === 'vision') { lid = Math.max(lid, 0.22 * gw); glint = sweep((gt - 0.55) / 0.45); }
    if (gn === 'thumbsUp' && gw > 0.3) {
      // eyes closed happily, then a wink, then a smile
      happy = gt < 1.0 ? [1, 1] : gt < 1.65 ? [0, 1] : [0, 0];
      shape = gt < 1.65 ? 'grin' : 'smile'; smile = 1; low = Math.max(low, 0.3); blush = 0.65;
      glint = sweep((gt - 0.15) / 0.45);
    }
    this.drawFace({
      lid: [Math.max(lid, blink), Math.max(lid, blink)], low, wide, happy,
      mouth: clamp(s.mouth ?? 0) * 0.9, shape, smile,
      vis: 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(t * 9.3 + Math.sin(t * 3.1) * 2)),
      blush, glint, vision: clamp(s.vision ?? 0),
    });

    // ---- marks beside his head
    const startled = ex === 'surprised' ? et : -1;
    const pop = startled >= 0 ? backOut(clamp(startled / 0.22)) * (1 - smooth(span(startled, 1.0, 1.2))) : 0;
    this.mark(this.bang, 362, 32, 0.15 * pop, 0.15 * pop, appear);
    this.bang.material.rotation = startled >= 0 ? Math.sin(startled * 24) * 0.15 * Math.exp(-startled * 3) : 0;
    const drip = startled >= 0 ? pulse(startled, 0.3, 1.3, 0.15) : 0;
    this.mark(this.sweat, 122, 55 + 40 * span(startled, 0.3, 1.3), 0.05, 0.075, drip * appear);
    const thinking = gn === 'think' ? gw : 0;
    if (thinking > 0.01) this.drawBubble(1 + (Math.floor(gt / 0.4) % 3));
    const grow = backOut(thinking);
    this.mark(this.bubble, 395, -15 + Math.sin(t * 2.2) * 6, 0.3 * grow, 0.1875 * grow, thinking * appear);
    const sparkle = Math.max(ex === 'smile' ? pulse(et, 0, 1.8, 0.15) : 0, gn === 'thumbsUp' ? gw : 0) * appear;
    SPARKLES.forEach(([px, py, phase], i) => {
      const k = (t * 1.3 + phase) % 1, size = k < 0.55 ? Math.sin((Math.PI * k) / 0.55) * 0.075 * sparkle : 0;
      this.mark(this.sparkles[i], px, py, size, size, sparkle);
      this.sparkles[i].material.rotation = k * 1.2;
    });

    // ---- glasses glow and the scan beam
    const vision = clamp(s.vision ?? 0);
    const lensMid = this.posed((this.L.lenses[0][0] + this.L.lenses[1][0]) / 2, (this.L.lenses[0][1] + this.L.lenses[1][1]) / 2);
    this.lensGlow.position.copy(lensMid).add(V(0, 0, 0.03));
    this.lensGlow.material.opacity = Math.max(0, vision - 0.25) * 0.55;
    const beamOn = gn === 'point' && g?.target ? gw : 0;
    if (beamOn > 0 && g?.target) {
      if (!this.beam.parent) this.root.parent?.add(this.beam, this.beamDot);
      const from = this.plane.localToWorld(lensMid.clone());
      const to = g.target.clone();
      const len = from.distanceTo(to) * clamp(gt / 0.35);
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

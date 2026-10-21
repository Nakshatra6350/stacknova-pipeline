// Materials and canvas helpers for the StackNova look: cel shading, ink outlines, calm glow.
import * as THREE from 'three';

export const PALETTE = {
  night: 0x050912, navy: 0x0b1324, navyLight: 0x14203a, ink: 0x05060b,
  cyan: 0x2fc8ef, cyanSoft: 0x8fdcf2, blue: 0x3b6bff, white: 0xf2f5fb, silver: 0xc5ccd8,
  amber: 0xffb347, red: 0xff5a6e, green: 0x4be3a2,
  skin: 0xf7d2b8, hair: 0x15171f, hairHi: 0x2b4a6f, hoodie: 0x1e212b, pants: 0x1c1f28,
} as const;

function bands(levels: number[]): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(levels), levels.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
const HARD = bands([80, 170, 255]);
const SOFT = bands([180, 255]);

/** Cel-shaded material: three bands of light (soft: two gentle bands, for skin). */
export function toon(color: number, extra: THREE.MeshToonMaterialParameters = {}, soft = false): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: soft ? SOFT : HARD, ...extra });
}

/** Unlit light source. `intensity` above 1 makes it bloom (the bloom threshold is 1). Kept low. */
export function glow(color: number, intensity = 1.25, opacity = 1): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity });
  m.color.multiplyScalar(intensity);
  return m;
}

const inkCache = new Map<string, THREE.Material>();
function inkMaterial(thickness: number): THREE.Material {
  const key = thickness.toFixed(4);
  const hit = inkCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = vec3(position) + normalize(normal) * ${thickness.toFixed(4)};`,
    );
  };
  inkCache.set(key, m);
  return m;
}

/** Ink outline: the back faces pushed out along the normals, drawn dark (the anime line). */
export function ink<T extends THREE.Mesh>(mesh: T, thickness = 0.004): T {
  const line = new THREE.Mesh(mesh.geometry, inkMaterial(thickness));
  line.renderOrder = mesh.renderOrder - 1;
  line.userData.ink = true;
  mesh.add(line);
  return mesh;
}

export interface PartOptions { rot?: [number, number, number]; scale?: [number, number, number]; ink?: number | false }
export function part(geometry: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number] = [0, 0, 0], o: PartOptions = {}): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...pos);
  if (o.rot) m.rotation.set(...o.rot);
  if (o.scale) m.scale.set(...o.scale);
  if (o.ink !== false) ink(m, o.ink ?? 0.004);
  return m;
}

export type Draw<S> = (ctx: CanvasRenderingContext2D, w: number, h: number, state: S) => void;
export interface CanvasTex<S> { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; redraw(state: S): void }

export function canvasTex<S>(w: number, h: number, draw: Draw<S>, initial: S): CanvasTex<S> {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  let last = '';
  const self: CanvasTex<S> = {
    canvas, ctx, tex,
    redraw(state: S) {
      const key = JSON.stringify(state);
      if (key === last) return;
      last = key;
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h, state);
      tex.needsUpdate = true;
    },
  };
  self.redraw(initial);
  return self;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** A flat card in the world showing a canvas, sized in metres. */
export class Card<S> extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  readonly face: CanvasTex<S>;
  billboard = true;
  constructor(w: number, h: number, pxPerMetre: number, draw: Draw<S>, initial: S, order = 10) {
    const face = canvasTex(Math.round(w * pxPerMetre), Math.round(h * pxPerMetre), draw, initial);
    super(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      map: face.tex, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.face = face;
    this.renderOrder = order;
  }
  set(state: S): void { this.face.redraw(state); }
}

export const MONO = '"JetBrains Mono", monospace';
export const SANS = '"Inter", sans-serif';

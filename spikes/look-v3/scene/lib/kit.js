// Shared helpers for the look v3 draft: cel-shaded materials, ink outlines, canvas textures,
// easing and a seeded random. Every animation is a pure function of time t (seconds), so the
// same t always draws the same frame.
import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
export const smoother = (k) => { k = clamp(k); return k * k * k * (k * (k * 6 - 15) + 10); };
export const easeOut = (k) => 1 - Math.pow(1 - clamp(k), 3);
export const easeIn = (k) => Math.pow(clamp(k), 3);
export const backOut = (k) => { k = clamp(k); const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
// progress of t through [a, b], 0 before a and 1 after b
export const span = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a));
// a pulse that rises at a, holds, and falls by b
export const window_ = (t, a, b, fade = 0.25) => Math.min(span(t, a, a + fade), 1 - span(t, b - fade, b));
export const vlerp = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
// smooth deterministic noise in [-1, 1]
export function wobble(t, seed = 0) {
  return Math.sin(t * 1.7 + seed) * 0.5 + Math.sin(t * 2.9 + seed * 1.3) * 0.3 + Math.sin(t * 5.3 + seed * 2.1) * 0.2;
}

// Three bands of light: the anime "cel" look.
let gradient = null;
export function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([70, 160, 255]);
  gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

// Skin gets two soft bands, so the face is not cut in half by a hard shadow line.
let softGradient = null;
export function toonSoft(color, extra = {}) {
  if (!softGradient) {
    softGradient = new THREE.DataTexture(new Uint8Array([175, 255]), 2, 1, THREE.RedFormat);
    softGradient.minFilter = softGradient.magFilter = THREE.NearestFilter;
    softGradient.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap: softGradient, ...extra });
}

// Unlit and brighter than white, so only these parts bloom (the bloom threshold is 1.0).
export function glow(color, opacity = 1, intensity = 3.0) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
  m.color.multiplyScalar(intensity);
  return m;
}

// Ink outline: the back faces of the mesh, pushed out along the normals and drawn dark.
const inkCache = new Map();
function inkMaterial(thickness) {
  const key = thickness.toFixed(4);
  if (inkCache.has(key)) return inkCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color: 0x04050c, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = vec3(position) + normalize(normal) * ${thickness.toFixed(4)};`);
  };
  inkCache.set(key, m);
  return m;
}
export function ink(mesh, thickness = 0.008) {
  const line = new THREE.Mesh(mesh.geometry, inkMaterial(thickness));
  line.renderOrder = mesh.renderOrder - 1;
  mesh.add(line);
  return mesh;
}

// A mesh with an outline, positioned.
export function part(geometry, material, pos = [0, 0, 0], opts = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...pos);
  if (opts.rot) m.rotation.set(...opts.rot);
  if (opts.scale) m.scale.set(...opts.scale);
  if (opts.ink !== false) ink(m, opts.ink || 0.008);
  return m;
}

// A canvas that becomes a texture; draw(ctx, w, h) runs on every redraw.
export function canvasTex(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const self = { canvas, ctx, tex, draw, redraw(...args) { ctx.clearRect(0, 0, w, h); draw(ctx, w, h, ...args); tex.needsUpdate = true; } };
  self.redraw({});
  return self;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// A flat card in the world showing a canvas; faces the camera when billboard is set.
export function card(w, h, pxPerUnit, draw, opts = {}) {
  const tex = canvasTex(Math.round(w * pxPerUnit), Math.round(h * pxPerUnit), draw);
  const mat = new THREE.MeshBasicMaterial({ map: tex.tex, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.userData.tex = tex;
  mesh.userData.billboard = !!opts.billboard;
  mesh.renderOrder = opts.order ?? 10;
  return mesh;
}

export const COLORS = {
  night: 0x03040a, ink: 0x04050c, steel: 0x161c2e, steelLight: 0x232c45,
  cyan: 0x22d3ff, cyanSoft: 0x7fe7ff, blue: 0x3b6bff, white: 0xf4f7ff,
  skin: 0xf3b897, hair: 0x232a44, hoodie: 0x14151c, pants: 0x1a1b23,
  red: 0xff3b5c, amber: 0xffb020, green: 0x3dffa8,
};

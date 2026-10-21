// Easing and timing helpers. Everything that moves is a pure function of time t (seconds),
// so the same t always draws the same frame: that is what lets a video be drawn in parts.
import * as THREE from 'three';

export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const smooth = (k: number): number => { k = clamp(k); return k * k * (3 - 2 * k); };
export const smoother = (k: number): number => { k = clamp(k); return k * k * k * (k * (k * 6 - 15) + 10); };
export const easeOut = (k: number): number => 1 - Math.pow(1 - clamp(k), 3);
export const easeIn = (k: number): number => Math.pow(clamp(k), 3);
export const backOut = (k: number): number => {
  k = clamp(k); const c = 1.70158;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};
/** Progress of t through [a, b]: 0 before a, 1 after b. */
export const span = (t: number, a: number, b: number): number => clamp((t - a) / Math.max(1e-6, b - a));
/** Rises over `fade` from a, holds, falls by b. */
export const pulse = (t: number, a: number, b: number, fade = 0.25): number =>
  Math.min(span(t, a, a + fade), 1 - span(t, b - fade, b));
export const V = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
export const deg = THREE.MathUtils.degToRad;

/** Deterministic random numbers in [0, 1). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth deterministic wobble in [-1, 1]. */
export function wobble(t: number, seed = 0): number {
  return Math.sin(t * 1.7 + seed) * 0.5 + Math.sin(t * 2.9 + seed * 1.3) * 0.3 + Math.sin(t * 5.3 + seed * 2.1) * 0.2;
}

/** A blink every few seconds: 0 open, 1 closed. */
export function blinkAt(t: number, seed: number): number {
  const period = 3.4 + (seed % 1) * 1.2;
  const p = (t + seed * 2.3) % period;
  return p < 0.14 ? Math.sin((p / 0.14) * Math.PI) : 0;
}

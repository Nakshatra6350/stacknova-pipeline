// Things that float in the world: key cards, code panels, the bits of a hash, chain nodes and the
// slabs that stack inside a bucket. Calm colours: white text on deep navy, cyan for structure,
// amber for the data that matters right now.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Card, roundRect, MONO, toon } from '../util/look';

export const INK = { text: '#e8f1fb', dim: '#7b8ca6', cyan: '#5fd6f5', amber: '#ffc36e', red: '#ff7a88', green: '#5fe3a8', kw: '#f08ab8', type: '#86a8ff', str: '#ffd58a', num: '#7ff0c8' };

function panel(ctx: CanvasRenderingContext2D, w: number, h: number, edge: string, r = 22): void {
  ctx.fillStyle = 'rgba(7,13,26,0.94)'; roundRect(ctx, 5, 5, w - 10, h - 10, r); ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = 4; ctx.stroke();
}

export type KeyTone = 'amber' | 'cyan';
export function keyCard(text: string, tone: KeyTone): Card<{ dim: boolean }> {
  return new Card<{ dim: boolean }>(0.46, 0.2, 900, (ctx, w, h, s) => {
    const col = tone === 'amber' ? INK.amber : INK.cyan;
    panel(ctx, w, h, s.dim ? 'rgba(120,140,170,0.5)' : col, 24);
    ctx.fillStyle = col; ctx.font = `700 30px ${MONO}`; ctx.textBaseline = 'top'; ctx.fillText('KEY', 30, 24);
    ctx.fillStyle = INK.text; ctx.font = `700 64px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`"${text}"`, w / 2, h * 0.6);
  }, { dim: false }, 20);
}

export type Token = [string, string];
export interface CodeState { progress: number[]; hl: number }
export function codePanel(file: string, rows: Token[][], w = 0.9): Card<CodeState> {
  const h = 0.12 + rows.length * 0.05;
  return new Card<CodeState>(w, h, 900, (ctx, cw, ch, s) => {
    panel(ctx, cw, ch, 'rgba(95,214,245,0.55)');
    [INK.red, INK.amber, INK.green].forEach((c, i) => { ctx.fillStyle = c; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(32 + i * 24, 32, 7, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK.dim; ctx.font = `400 24px ${MONO}`; ctx.textBaseline = 'middle'; ctx.fillText(file, 112, 33);
    ctx.font = `400 28px ${MONO}`;
    rows.forEach((row, i) => {
      const y = 92 + i * 45;
      if (s.hl === i) { ctx.fillStyle = 'rgba(95,214,245,0.12)'; ctx.fillRect(14, y - 22, cw - 28, 42); }
      const total = row.reduce((n, [txt]) => n + txt.length, 0);
      let left = Math.floor((s.progress[i] ?? 1) * total), x = 28;
      for (const [txt, col] of row) {
        if (left <= 0) break;
        const piece = txt.slice(0, left); left -= txt.length;
        ctx.fillStyle = col; ctx.fillText(piece, x, y); x += ctx.measureText(piece).width;
      }
    });
  }, { progress: rows.map(() => 1), hl: -1 }, 22);
}

export interface BitsState { hl: number; result: number }
export function bitsStrip(bits: string, result: string): Card<BitsState> {
  return new Card<BitsState>(0.9, 0.26, 900, (ctx, w, h, s) => {
    panel(ctx, w, h, 'rgba(95,214,245,0.55)');
    ctx.fillStyle = INK.dim; ctx.font = `400 24px ${MONO}`; ctx.textBaseline = 'middle'; ctx.fillText('hash, in bits', 28, 34);
    if (s.result > 0) {
      ctx.globalAlpha = s.result; ctx.fillStyle = INK.amber; ctx.font = `700 28px ${MONO}`; ctx.textAlign = 'right';
      ctx.fillText(result, w - 28, 34); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    ctx.font = `700 30px ${MONO}`;
    let x = 28;
    bits.match(/.{4}/g)!.forEach((g, i) => {
      const last = i === 7, gw = ctx.measureText(g).width;
      if (last && s.hl > 0) { ctx.fillStyle = `rgba(255,195,110,${0.22 * s.hl})`; roundRect(ctx, x - 6, 74, gw + 12, 52, 10); ctx.fill(); }
      ctx.fillStyle = last && s.hl > 0 ? INK.amber : s.hl > 0 ? 'rgba(150,170,200,0.45)' : INK.text;
      ctx.fillText(g, x, 100); x += gw + 13;
    });
  }, { hl: 0, result: 0 }, 22);
}

export interface NodeState { tone: 'cyan' | 'amber' | 'green' | 'red' | 'dim'; last: boolean; ok: boolean }
export function nodeCard(key: string, value: string, hash: string): Card<NodeState> {
  return new Card<NodeState>(0.8, 0.27, 800, (ctx, w, h, s) => {
    const col = { cyan: INK.cyan, amber: INK.amber, green: INK.green, red: INK.red, dim: INK.dim }[s.tone];
    panel(ctx, w, h, col, 18);
    ctx.font = `400 20px ${MONO}`; ctx.fillStyle = INK.dim; ctx.textBaseline = 'top';
    [[24, 'hash'], [232, 'key'], [450, 'value'], [570, 'next']].forEach(([x, l]) => ctx.fillText(String(l), Number(x), 20));
    ctx.font = `700 31px ${MONO}`; ctx.textBaseline = 'middle';
    ctx.fillStyle = INK.num; ctx.fillText(hash, 24, 128);
    ctx.fillStyle = s.ok ? INK.green : INK.str; ctx.fillText(`"${key}"`, 232, 128);
    ctx.fillStyle = INK.text; ctx.fillText(value, 450, 128);
    ctx.fillStyle = INK.cyan; ctx.fillText(s.last ? 'null' : '→', 584, 128);
    if (s.ok) { ctx.fillStyle = INK.green; ctx.font = `700 30px ${MONO}`; ctx.textAlign = 'right'; ctx.fillText('✓ equals', w - 24, 34); }
  }, { tone: 'cyan', last: true, ok: false }, 23);
}

/** A slab inside a bucket, labelled with its key. */
export class EntrySlab extends THREE.Group {
  readonly label: Card<{ tone: 'amber' | 'cyan' | 'red' }>;
  private body: THREE.Mesh<RoundedBoxGeometry, THREE.MeshToonMaterial>;
  constructor(key: string) {
    super();
    this.body = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.09, 0.3, 2, 0.02), toon(0x1a2742));
    this.add(this.body);
    this.label = new Card<{ tone: 'amber' | 'cyan' | 'red' }>(0.28, 0.07, 1000, (ctx, w, h, s) => {
      const col = s.tone === 'amber' ? INK.amber : s.tone === 'red' ? INK.red : INK.cyan;
      ctx.fillStyle = 'rgba(7,13,26,0.9)'; roundRect(ctx, 3, 3, w - 6, h - 6, 12); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = col; ctx.font = `700 40px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(key, w / 2, h / 2 + 2);
    }, { tone: 'amber' }, 24);
    this.label.billboard = false;
    this.label.position.set(0, 0, 0.152);
    this.add(this.label);
  }
  tone(t: 'amber' | 'cyan' | 'red'): void {
    this.label.set({ tone: t });
    this.body.material.color.setHex(t === 'amber' ? 0x3a2c14 : t === 'red' ? 0x3a1620 : 0x1a2742);
  }
}

/** Java's String.hashCode, the spread HashMap applies, and the bucket for a table of n. */
export function javaHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
export function spread(h: number): number { return (h ^ (h >>> 16)) | 0; }
export function bucketOf(key: string, n = 16): number { return spread(javaHash(key)) & (n - 1); }
export function bits32(x: number): string { return (x >>> 0).toString(2).padStart(32, '0'); }

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
export function codePanel(file: string, rows: Token[][], w?: number): Card<CodeState> {
  // 28 px monospace is about 16.9 px a character at 900 px a metre
  const chars = Math.max(...rows.map((r) => r.reduce((n, [txt]) => n + txt.length, 0)));
  w = w ?? Math.max(0.9, (chars * 16.9 + 70) / 900);
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

const TONES: Record<string, string> = { cyan: INK.cyan, amber: INK.amber, red: INK.red, green: INK.green, white: INK.text, dim: INK.dim };

/** Big words in the world: "16 → 32", "O(log n)". */
export function labelCard(text: string, sub = '', tone = 'white', size = 1): Card<{ tone: string }> {
  const w = Math.max(0.5, (text.length * 0.052 + 0.16)) * size, h = (sub ? 0.27 : 0.19) * size;
  return new Card<{ tone: string }>(w, h, 900 / size, (ctx, cw, ch, s) => {
    const col = TONES[s.tone] ?? INK.text;
    panel(ctx, cw, ch, s.tone === 'white' ? 'rgba(95,214,245,0.55)' : col, 26);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = col; ctx.font = `700 84px ${MONO}`;
    ctx.fillText(text, cw / 2, sub ? ch * 0.4 : ch / 2 + 4);
    if (sub) { ctx.fillStyle = INK.dim; ctx.font = `400 30px ${MONO}`; ctx.fillText(sub, cw / 2, ch * 0.78); }
  }, { tone }, 22);
}

export interface GaugeState { value: number }
/** A load meter: how full something is against its size, with the line where it acts. */
export function gaugeCard(label: string, max: number, limit: number): Card<GaugeState> {
  return new Card<GaugeState>(0.95, 0.34, 900, (ctx, w, h, s) => {
    panel(ctx, w, h, 'rgba(95,214,245,0.55)');
    const v = Math.round(s.value), over = v > limit;
    ctx.fillStyle = INK.dim; ctx.font = `400 26px ${MONO}`; ctx.textBaseline = 'middle'; ctx.fillText(label, 30, 40);
    ctx.textAlign = 'right'; ctx.fillStyle = over ? INK.red : v >= limit ? INK.amber : INK.text; ctx.font = `700 40px ${MONO}`;
    ctx.fillText(`${v} / ${max}`, w - 30, 42); ctx.textAlign = 'left';
    const x = 30, y = 100, bw = w - 60, bh = 90;
    ctx.fillStyle = 'rgba(120,150,190,0.16)'; roundRect(ctx, x, y, bw, bh, 14); ctx.fill();
    ctx.fillStyle = over ? INK.red : v >= limit ? INK.amber : INK.cyan;
    roundRect(ctx, x, y, Math.max(16, bw * Math.min(1, s.value / max)), bh, 14); ctx.fill();
    const lx = x + bw * (limit / max);
    ctx.strokeStyle = INK.amber; ctx.lineWidth = 4; ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.moveTo(lx, y - 14); ctx.lineTo(lx, y + bh + 14); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = INK.amber; ctx.font = `700 24px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText(`${limit}`, lx, y + bh + 36);
  }, { value: 0 }, 22);
}

export interface GridState { cells: number; filled: number; moved: number }
/** A whole table as a grid of buckets, 16 to a row, entries lit where their hash puts them. When
 *  `cells` doubles, `moved` (0..1) carries each entry from hash & (cells/2 - 1) to hash & (cells - 1):
 *  it stays, or drops exactly half the table down. */
export function gridCard(seed = 7): Card<GridState> {
  const hashes = Array.from({ length: 512 }, (_, i) => {
    let x = (Math.imul(i + 1, 0x9e3779b1) ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  });
  return new Card<GridState>(0.95, 0.95, 800, (ctx, w, h, s) => {
    panel(ctx, w, h, 'rgba(95,214,245,0.55)');
    const cells = Math.max(16, Math.round(s.cells)), filled = Math.floor(s.filled), cols = 16, rows = cells / cols;
    ctx.fillStyle = INK.dim; ctx.font = `400 26px ${MONO}`; ctx.textBaseline = 'middle';
    ctx.fillText(`table: ${cells} buckets`, 30, 40);
    ctx.textAlign = 'right'; ctx.fillStyle = INK.amber; ctx.fillText(`${filled} entries`, w - 30, 40); ctx.textAlign = 'left';
    const pad = 30, top = 76, cw = (w - 2 * pad) / cols, ch = Math.min(cw, (h - top - pad) / Math.max(8, rows));
    const xy = (b: number): [number, number] => [pad + (b % cols) * cw, top + Math.floor(b / cols) * ch];
    ctx.fillStyle = 'rgba(120,150,190,0.14)';
    for (let b = 0; b < cells; b++) { const [x, y] = xy(b); ctx.fillRect(x + 3, y + 3, cw - 6, ch - 6); }
    const k = Math.min(1, Math.max(0, s.moved));
    for (let e = 0; e < filled; e++) {
      const to = xy(hashes[e] & (cells - 1)), from = xy(hashes[e] & (cells / 2 - 1));
      const x = from[0] + (to[0] - from[0]) * k, y = from[1] + (to[1] - from[1]) * k;
      ctx.fillStyle = 'rgba(255,195,110,0.55)'; ctx.fillRect(x + 5, y + 5, cw - 10, ch - 10);
    }
  }, { cells: 128, filled: 0, moved: 1 }, 22);
}

/** A big ✓ or ✗. */
export function markCard(kind: 'x' | 'check', size = 1): Card<{ kind: string }> {
  return new Card<{ kind: string }>(0.3 * size, 0.3 * size, 900 / size, (ctx, w, h, s) => {
    const col = s.kind === 'x' ? INK.red : INK.green;
    ctx.fillStyle = 'rgba(7,13,26,0.9)'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 8, 0, 7); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 10; ctx.stroke();
    ctx.lineWidth = 22; ctx.lineCap = 'round'; ctx.beginPath();
    if (s.kind === 'x') { ctx.moveTo(w * 0.33, h * 0.33); ctx.lineTo(w * 0.67, h * 0.67); ctx.moveTo(w * 0.67, h * 0.33); ctx.lineTo(w * 0.33, h * 0.67); }
    else { ctx.moveTo(w * 0.3, h * 0.52); ctx.lineTo(w * 0.45, h * 0.66); ctx.lineTo(w * 0.72, h * 0.36); }
    ctx.stroke();
  }, { kind }, 24);
}

export interface BitsCardState { hl: number; extra: number; result: number }
/** A hash in bits: the low `low` bits (the bucket) light up amber, the next one (`extra`) cyan. */
export function bitsCard(value: number, low: number, result: string, title = 'hash, in bits'): Card<BitsCardState> {
  const bits = bits32(value);
  return new Card<BitsCardState>(0.98, 0.26, 900, (ctx, w, h, s) => {
    panel(ctx, w, h, 'rgba(95,214,245,0.55)');
    ctx.fillStyle = INK.dim; ctx.font = `400 24px ${MONO}`; ctx.textBaseline = 'middle'; ctx.fillText(title, 28, 34);
    if (s.result > 0) {
      ctx.globalAlpha = s.result; ctx.fillStyle = s.extra > 0 ? INK.cyan : INK.amber; ctx.font = `700 28px ${MONO}`;
      ctx.textAlign = 'right'; ctx.fillText(result, w - 28, 34); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    ctx.font = `700 30px ${MONO}`;
    const cw = ctx.measureText('0').width;
    let x = 28;
    for (let i = 0; i < 32; i++) {
      if (i > 0 && i % 4 === 0) x += 9;
      const fromRight = 31 - i;
      const isLow = fromRight < low, isExtra = fromRight === low;
      if (isLow && s.hl > 0) { ctx.fillStyle = `rgba(255,195,110,${0.22 * s.hl})`; ctx.fillRect(x - 2, 76, cw + 4, 50); }
      if (isExtra && s.extra > 0) { ctx.fillStyle = `rgba(95,214,245,${0.3 * s.extra})`; ctx.fillRect(x - 2, 76, cw + 4, 50); }
      ctx.fillStyle = isExtra && s.extra > 0 ? INK.cyan : isLow && s.hl > 0 ? INK.amber : s.hl > 0 ? 'rgba(150,170,200,0.45)' : INK.text;
      ctx.fillText(bits[i], x, 101); x += cw;
    }
  }, { hl: 0, extra: 0, result: 0 }, 22);
}

/** A slab inside a bucket, labelled with its key. */
export type SlabTone = 'amber' | 'cyan' | 'red' | 'green';
export class EntrySlab extends THREE.Group {
  readonly label: Card<{ tone: SlabTone; text: string }>;
  private body: THREE.Mesh<RoundedBoxGeometry, THREE.MeshToonMaterial>;
  private text: string;
  private shade: SlabTone = 'amber';
  constructor(key: string) {
    super();
    this.text = key;
    this.body = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.09, 0.3, 2, 0.02), toon(0x1a2742));
    this.add(this.body);
    this.label = new Card<{ tone: SlabTone; text: string }>(0.28, 0.07, 1000, (ctx, w, h, s) => {
      const col = { amber: INK.amber, red: INK.red, cyan: INK.cyan, green: INK.green }[s.tone];
      ctx.fillStyle = 'rgba(7,13,26,0.9)'; roundRect(ctx, 3, 3, w - 6, h - 6, 12); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = col; ctx.font = `700 40px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const fit = Math.min(1, (w - 24) / ctx.measureText(s.text).width);
      ctx.font = `700 ${Math.floor(40 * fit)}px ${MONO}`;
      ctx.fillText(s.text, w / 2, h / 2 + 2);
    }, { tone: 'amber', text: key }, 24);
    this.label.billboard = false;
    this.label.position.set(0, 0, 0.152);
    this.add(this.label);
  }
  tone(t: SlabTone): void {
    this.shade = t;
    this.label.set({ tone: t, text: this.text });
    this.body.material.color.setHex(t === 'amber' ? 0x3a2c14 : t === 'red' ? 0x3a1620 : t === 'green' ? 0x143a2a : 0x1a2742);
  }
  relabel(text: string): void { this.text = text; this.tone(this.shade); }
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

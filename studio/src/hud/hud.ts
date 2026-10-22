// The frame of a Short (1080 x 1920): title band, 3D window, caption band. Captions and callouts
// live in the bands, never on the picture. A long video (1920 x 1080) has a title band and the 3D
// window only: YouTube shows the exact subtitles, so nothing is burned in.
import './hud.css';
import { backOut, lerp, span } from '../util/math';

export interface Word { w: string; s: number; e: number }
export interface Line { id: string; who: 'engineer' | 'nova'; start: number; end: number; words: Word[]; env: number[]; said: { k: string; s: number; e: number }[] }
export interface Timeline { duration: number; fps: number; lines: Line[]; events: Record<string, number> }

export const VIEW = { width: 1080, height: 1160 };
export const VIEW_LONG = { width: 1920, height: 930 };

/** The closing card's words, the call to action under it, and the frame's shape. */
export interface HudOptions { end?: { kicker: string; head: string }; cta?: string; format?: 'short' | 'long' }

/** About two lines of the caption band, in characters. */
const PAGE_CHARS = 64;

const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');

export class FrameHud {
  readonly view: HTMLElement;
  private stepEls: HTMLElement[];
  private q: <T extends HTMLElement>(s: string) => T;
  private capKey = '';
  private calloutKey = '';
  private long: boolean;

  constructor(host: HTMLElement, brand: string, episode: string, steps: string[], opts: HudOptions = {}) {
    const end = opts.end ?? { kicker: 'PART 2', head: 'When a bucket\nbecomes a tree' };
    const cta = opts.cta ?? 'Follow for part 2';
    this.long = opts.format === 'long';
    host.innerHTML = this.long ? `
      <div class="frame long">
        <div class="top">
          <div class="brand"><span class="mark"></span><span class="word">Stack<span class="grad">Nova</span></span><span class="topic">· ${brand}</span><span class="ep">${episode}</span></div>
          <div class="steps">${steps.map((s) => `<div class="step"><i><b></b></i>${s}</div>`).join('')}</div>
          <div class="callout"></div>
        </div>
        <div class="view"></div>
        <div class="brandcard"><div class="emblem"></div><div class="word">Stack<span class="grad">Nova</span></div><div class="tag"><i></i>LIGHT UP YOUR WHOLE STACK<i></i></div></div>
        <div class="watermark"></div>
        <div class="end"><div class="kicker">${html(end.kicker)}</div><div class="head">${html(end.head)}</div><div class="follow"><span>${html(cta)}</span></div></div>
      </div>` : `
      <div class="frame">
        <div class="top">
          <div class="row"><div class="brand"><span class="mark"></span><span class="word">Stack<span class="grad">Nova</span></span><span class="topic">· ${brand}</span></div><div class="ep">${episode}</div></div>
          <div class="steps">${steps.map((s) => `<div class="step"><i><b></b></i>${s}</div>`).join('')}</div>
          <div class="callout"></div>
        </div>
        <div class="view"></div>
        <div class="watermark"></div>
        <div class="dim"></div>
        <div class="end"><div class="kicker">${html(end.kicker)}</div><div class="head">${html(end.head)}</div></div>
        <div class="cap"><div class="who"></div><div class="line"></div><div class="follow"><span>${html(cta)}</span></div></div>
        <div class="foot"></div>
      </div>`;
    this.q = <T extends HTMLElement>(s: string) => host.querySelector(s) as T;
    this.view = this.q('.view');
    this.stepEls = [...host.querySelectorAll<HTMLElement>('.step')];
  }

  steps(progress: number[]): void {
    progress.forEach((k, i) => {
      (this.stepEls[i].querySelector('b') as HTMLElement).style.width = `${(k * 100).toFixed(1)}%`;
      this.stepEls[i].classList.toggle('on', k > 0);
    });
  }

  caption(line: Line | undefined, t: number): void {
    if (this.long) return;
    const cap = this.q('.cap .line'), who = this.q('.cap .who');
    if (!line) { cap.style.opacity = '0'; who.style.opacity = '0'; return; }
    cap.style.opacity = '1'; who.style.opacity = '1';
    // a long line is shown a page at a time (about two lines of the band), the page being said
    const pages: Word[][] = [];
    let page: Word[] = [], chars = 0;
    for (const w of line.words) {
      if (page.length && chars + w.w.length + 1 > PAGE_CHARS) { pages.push(page); page = []; chars = 0; }
      page.push(w); chars += w.w.length + 1;
      // end a page with its sentence when the page is already well filled
      if (/[.?!]$/.test(w.w) && chars > PAGE_CHARS * 0.4) { pages.push(page); page = []; chars = 0; }
    }
    if (page.length) pages.push(page);
    const n = Math.max(0, pages.findIndex((p) => t < p[p.length - 1].e));
    const shown = pages[n] ?? pages[pages.length - 1];
    const key = line.id + '|' + n + '|' + shown.map((w) => (t >= w.e ? 2 : t >= w.s ? 1 : 0)).join('');
    if (key === this.capKey) return;
    this.capKey = key;
    who.className = `who ${line.who}`;
    who.textContent = line.who === 'nova' ? 'NOVA' : 'ENGINEER';
    cap.innerHTML = shown.map((w) => `<span class="${t >= w.e ? 'said' : t >= w.s ? 'now' : ''}">${w.w}</span>`).join(' ');
  }

  callout(text: string | null, tone: '' | 'amber' | 'red', k: number, t0: number, t: number): void {
    const el = this.q('.top .callout');
    if (!text || k <= 0) { el.style.opacity = '0'; return; }
    if (this.calloutKey !== text) {
      this.calloutKey = text; el.textContent = text; el.className = `callout ${tone}`;
      // always one line: a callout wider than its box gets a smaller font, never a cut-off second line
      el.style.fontSize = '';
      const fit = el.clientWidth / el.scrollWidth;
      if (fit < 1) el.style.fontSize = `${Math.floor(parseFloat(getComputedStyle(el).fontSize) * fit)}px`;
    }
    el.style.opacity = String(k);
    el.style.transform = `scale(${lerp(1.25, 1, backOut(span(t, t0, t0 + 0.3))).toFixed(3)})`;
  }

  /** The closing card: headline over the picture's top, follow prompt in the caption band. */
  end(k: number): void {
    this.q('.end').style.opacity = String(k);
    if (this.long) return;
    this.q('.cap .follow').style.opacity = String(k);
    if (k > 0) { this.q('.cap .line').style.opacity = String(1 - k); this.q('.cap .who').style.opacity = String(1 - k); }
  }

  /** Hides the bars at the very start and end. */
  bars(k: number): void { (this.q('.top .steps') as HTMLElement).style.opacity = String(k); }

  /** The channel's mark over the picture while the welcome line is said (long videos). */
  brand(k: number): void {
    const el = this.q('.brandcard');
    if (!el) return;
    el.style.opacity = String(k);
    el.style.transform = `scale(${lerp(0.94, 1, k).toFixed(3)})`;
  }
}

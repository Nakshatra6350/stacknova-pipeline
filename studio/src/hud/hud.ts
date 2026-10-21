// The frame of a Short (1080 x 1920): title band, 3D window, caption band. Captions and callouts
// live in the bands, never on the picture.
import './hud.css';
import { backOut, lerp, span } from '../util/math';

export interface Word { w: string; s: number; e: number }
export interface Line { id: string; who: 'engineer' | 'nova'; start: number; end: number; words: Word[]; env: number[]; said: { k: string; s: number; e: number }[] }
export interface Timeline { duration: number; fps: number; lines: Line[]; events: Record<string, number> }

export const VIEW = { width: 1080, height: 1160 };

/** The closing card's words and the call to action under it. */
export interface HudOptions { end?: { kicker: string; head: string }; cta?: string }

const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');

export class FrameHud {
  readonly view: HTMLElement;
  private stepEls: HTMLElement[];
  private q: <T extends HTMLElement>(s: string) => T;
  private capKey = '';
  private calloutKey = '';

  constructor(host: HTMLElement, brand: string, episode: string, steps: string[], opts: HudOptions = {}) {
    const end = opts.end ?? { kicker: 'PART 2', head: 'When a bucket\nbecomes a tree' };
    const cta = opts.cta ?? 'Follow for part 2';
    host.innerHTML = `
      <div class="frame">
        <div class="top">
          <div class="row"><div class="brand">STACK<b>NOVA</b> · ${brand}</div><div class="ep">${episode}</div></div>
          <div class="steps">${steps.map((s) => `<div class="step"><i><b></b></i>${s}</div>`).join('')}</div>
          <div class="callout"></div>
        </div>
        <div class="view"></div>
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
    const cap = this.q('.cap .line'), who = this.q('.cap .who');
    if (!line) { cap.style.opacity = '0'; who.style.opacity = '0'; return; }
    cap.style.opacity = '1'; who.style.opacity = '1';
    const key = line.id + '|' + line.words.map((w) => (t >= w.e ? 2 : t >= w.s ? 1 : 0)).join('');
    if (key === this.capKey) return;
    this.capKey = key;
    who.className = `who ${line.who}`;
    who.textContent = line.who === 'nova' ? 'NOVA' : 'ENGINEER';
    cap.innerHTML = line.words.map((w) => `<span class="${t >= w.e ? 'said' : t >= w.s ? 'now' : ''}">${w.w}</span>`).join(' ');
  }

  callout(text: string | null, tone: '' | 'amber' | 'red', k: number, t0: number, t: number): void {
    const el = this.q('.top .callout');
    if (!text || k <= 0) { el.style.opacity = '0'; return; }
    if (this.calloutKey !== text) { this.calloutKey = text; el.textContent = text; el.className = `callout ${tone}`; }
    el.style.opacity = String(k);
    el.style.transform = `scale(${lerp(1.25, 1, backOut(span(t, t0, t0 + 0.3))).toFixed(3)})`;
  }

  /** The closing card: headline over the picture's top, follow prompt in the caption band. */
  end(k: number): void {
    this.q('.end').style.opacity = String(k);
    this.q('.cap .follow').style.opacity = String(k);
    if (k > 0) { this.q('.cap .line').style.opacity = String(1 - k); this.q('.cap .who').style.opacity = String(1 - k); }
  }

  /** Hides the bars at the very start and end. */
  bars(k: number): void { (this.q('.top .steps') as HTMLElement).style.opacity = String(k); }
}

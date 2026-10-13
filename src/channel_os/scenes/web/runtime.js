// What every stage shares: time-shaping helpers, text helpers, and the chrome around a scene.
// Everything on screen is a function of the time t passed to render(t); nothing keeps state
// between frames, so any frame can be drawn on its own and a render is repeatable.
window.SN = (() => {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = p => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  const easeIn = p => p * p * p, easeOut = p => 1 - Math.pow(1 - p, 3);
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const fade = (t, a, d = .3) => ease(seg(t, a, a + d));
  const pop = (t, a, d = .45) => { const p = seg(t, a, a + d); return p <= 0 ? 0 : 1 + .16 * Math.sin(p * Math.PI) * (1 - p); };
  const bump = (t, a, d = 1) => Math.sin(Math.PI * seg(t, a, a + d));
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const typed = (s, p) => s.slice(0, Math.ceil(s.length * clamp(p)));
  // Colours keys, strings and numbers of JSON-like text. Works on partly typed text too.
  const hl = s => esc(s).replace(/("(?:[^"\\]|\\.)*"?)(\s*:)?|\b\d+(?:\.\d+)?\b/g,
    (m, str, colon) => str ? (colon ? `<span class="jk">${str}</span>${colon}` : `<span class="js">${str}</span>`) : `<span class="jn">${m}</span>`);
  const last = (list, t, key = x => x.time) => { let found = null; for (const item of list) if (t >= key(item)) found = item; return found; };
  const $ = id => document.getElementById(id);
  const written = new Map();
  const set = (id, html) => { if (written.get(id) !== html) { written.set(id, html); $(id).innerHTML = html; } };
  const icon = (d, size = 34, extra = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const ICON = {
    like: icon('<path d="M7 11v9H4v-9h3zm0 0l4-7c1.5 0 2.5 1 2.5 2.5V10H19a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17.8 20H7"/>'),
    comment: icon('<path d="M4 5h16v11H9l-5 4z"/>'),
    share: icon('<path d="M13 5l7 6-7 6v-4c-5 0-8 2-9 5 0-6 3-10 9-10z"/>'),
    bell: icon('<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4"/>'),
    // A plain camera outline, not Instagram's logo.
    cam: icon('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor"/>', 26, 'style="color:#fff"'),
  };

  // The heading of a one-column scene: its label line and, when it has one, its statement.
  const head = D => !(D.header || D.title) ? '' : `<div class="shead" data-in>${D.header ? `<span class="lbl">${esc([].concat(D.header).join(' · '))}</span>` : ''}${D.title ? `<div class="stitle disp">${esc(D.title)}</div>` : ''}</div>`;

  const stages = {};  // stage name -> { build(clip, root), render(t) }
  let clip = null, stage = null;
  let movers = [];    // the scene's blocks marked data-in, in the order they arrive
  let still = false;  // true while measuring: everything is drawn where it settles

  // ---- chrome: top bar, caption bar, progress, Instagram lower third, Shorts prompt -----------
  function buildChrome(root) {
    const c = clip.chrome;
    if (!c || clip.stage === 'brand') return;
    const landscape = clip.format === 'landscape';
    const part = c.parts > 1 && landscape ? `Part ${String(c.part).padStart(2, '0')} / ${String(c.parts).padStart(2, '0')}` : 'StackNova';
    let h = `<div class="top abs"><span class="mark"></span><span class="lbl" id="partl">${part}</span>
      <span class="ttl disp" id="partt">${esc(c.title)}</span><span class="pill">${esc(landscape ? c.pill : c.pill_short)}</span><i class="sweep" id="sweep"></i></div>`;
    if (c.captions && c.captions.length) h += '<div class="capbar"><span class="t" id="capt"></span></div>';
    if (c.handle && c.handle.length) h += `<div class="third" id="third"><span class="ig">${ICON.cam}</span><span><small>FOLLOW ON INSTAGRAM</small><b>${esc(c.instagram)}</b></span></div>`;
    if (c.cta) h += '<div class="cta" id="cta"></div>';
    root.insertAdjacentHTML('beforeend', h + '<div class="prog" id="prog"></div>');
  }

  function renderChrome(t) {
    const c = clip.chrome;
    if (!c || clip.stage === 'brand') return;
    const [from, to] = c.progress;
    $('prog').style.width = (100 * (from + (to - from) * clamp(t / clip.duration))) + '%';
    if ($('capt')) {
      // A new caption rises into place; one carried over from the scene before (it starts
      // before 0) is simply there.
      const caption = last(c.captions, t, x => x[0]) || c.captions[0], p = still ? 1 : easeOut(seg(t, caption[0], caption[0] + .18));
      set('capt', caption[1]);
      Object.assign($('capt').style, { opacity: p, transform: p < 1 ? `translateY(${10 * (1 - p)}px)` : '' });
    }
    if ($('third')) {
      const slide = Math.max(0, ...c.handle.map(([a, b]) => ease(seg(t, a, a + .6)) * (1 - ease(seg(t, b - .5, b)))));
      Object.assign($('third').style, { left: (1876 - 372 * slide) + 'px', width: '372px', opacity: slide });
    }
    if ($('cta')) {
      // The last button is the platform's word: Subscribe on YouTube, Follow on Instagram.
      const [a] = c.cta, items = [['like', 'Like', 'err'], ['comment', 'Comment', 'a'], ['share', 'Share', 'b'], ['bell', esc(c.cta_ask || 'Subscribe'), 'c']];
      set('cta', t < a ? '' : items.map(([name, label, lane], i) => {
        const at = a + i * .35;
        return `<span class="b${t >= at + .1 && t < at + .7 ? ' on' : ''}" style="--hue:var(--${lane});opacity:${fade(t, at, .25)};transform:scale(${pop(t, at) || .8})">${ICON[name]}${label}</span>`;
      }).join(''));
    }
  }

  async function boot(data) {
    clip = data; written.clear();
    document.body.dataset.format = clip.format;
    for (const [name, value] of Object.entries(clip.theme)) document.body.style.setProperty(name, value);
    document.body.style.setProperty('--emblem', `url("${clip.emblem}")`);
    // Fonts are loaded here, not by CSS, so a face that fails to load stops the render
    // instead of being replaced by whatever the machine has.
    for (const font of clip.fonts) {
      const face = new FontFace(font.family, `url("${font.url}")`, { weight: String(font.weight) });
      document.fonts.add(await face.load());
    }
    stage = stages[clip.stage];
    if (!stage) throw new Error(`no stage draws layout "${clip.stage}" yet`);
    // The scene sits in its own layer, so it can move as one piece under the chrome.
    const root = $('stage');
    root.innerHTML = '<div class="abs" id="scene"></div>'; root.removeAttribute('style');
    stage.build(clip, $('scene'));
    movers = [...$('scene').querySelectorAll('[data-in]')].filter(el => el.offsetParent !== null);
    buildChrome(root);
    root.insertAdjacentHTML('beforeend', '<div class="veil" id="veil" hidden><i></i></div>');
    render(0);
    return true;
  }

  // ---- moves: how a clip arrives and leaves, so a change of scene is seen ----------------------
  // The planner says what happens at each end of a clip: chrome.enter and chrome.exit are null,
  // 'scene' (the same segment goes on) or 'part' (a new segment); from_black and to_black mean
  // the neighbour is a brand scene, which fades through black. enter_style and exit_style name
  // the style of each end ('slide', 'wipe' or 'zoom'); the planner mixes them, and gives the
  // two scenes on either side of a change the same one.
  // Each clip animates only itself, so two clips never have to be drawn together.
  function renderMoves(t) {
    const c = clip.chrome || {}, scene = $('scene'), veil = $('veil'), top = $('partt');
    if (clip.stage === 'brand' || !(c.enter_style || c.exit_style)) return;
    // `end` is the last frame's time, less a hair so that frame is the finished state.
    const D = clip.duration, end = D - 1 / 30 - 1e-4, wide = clip.format === 'landscape';
    const W = wide ? 1920 : 1080, H = wide ? 1080 : 1920, k = wide ? 1 : 1.3;
    const outSpan = Math.min(.3, D / 5), inSpan = Math.min(.36, D / 4);
    const leaving = c.exit && !still ? seg(t, end - outSpan, end) : 0;   // 0, then 1 on the last frame
    const arriving = c.enter && !still ? 1 - seg(t, 0, inSpan) : 0;      // 1 on the first frame, then 0
    const gone = easeIn(leaving), here = easeOut(1 - arriving);
    const style = leaving ? c.exit_style : c.enter_style;  // the two ends never overlap
    let transform = '', opacity = 1, blur = 0, light = 1, block = () => 1;

    if (style === 'slide') {
      // Out: the whole scene slides off to the left. In: its blocks rise into place one by one.
      transform = leaving ? `translateX(${-130 * k * gone}px)` : '';
      opacity = 1 - gone;
      const gap = Math.min(.045, inSpan / 8);
      block = i => c.enter && !still ? easeOut(seg(t, i * gap, i * gap + inSpan)) : 1;
    } else if (style === 'zoom') {
      // Out: the scene swells and dissolves. In: the next one settles from slightly small.
      transform = leaving ? `scale(${1 + .07 * gone})` : arriving ? `scale(${.93 + .07 * here})` : '';
      opacity = leaving ? 1 - gone : here;
      blur = 7 * Math.max(gone, 1 - here);
    }
    if (style === 'wipe') {
      // A dark blade with a bright edge crosses: it covers the old scene, then uncovers the new.
      const whole = c.exit === 'part' && leaving || c.enter === 'part' && arriving;
      const covering = ease(leaving), cleared = ease(1 - arriving);
      const y0 = whole ? 0 : wide ? 74 : 346, y1 = whole ? H : wide ? 920 : 1052;
      veil.hidden = !(leaving || arriving);
      veil.className = 'veil' + (arriving ? ' back' : '') + (c.to_black && leaving || c.from_black && arriving ? ' black' : '');
      Object.assign(veil.style, { top: y0 + 'px', height: (y1 - y0) + 'px',
        left: (arriving ? W * cleared : 0) + 'px', width: (arriving ? W * (1 - cleared) : W * covering) + 'px' });
    } else {
      veil.hidden = true;
      // Next to a brand scene the whole frame goes to black, and comes back from it.
      if (c.to_black && leaving) light = 1 - ease(leaving);
      if (c.from_black && arriving) light = ease(1 - arriving);
    }
    Object.assign(scene.style, { transform, opacity, filter: blur > .05 ? `blur(${blur.toFixed(2)}px)` : '' });
    $('stage').style.filter = light < 1 ? `brightness(${light.toFixed(3)})` : '';
    let slowest = 1;
    movers.forEach((el, i) => {
      const p = block(i); slowest = Math.min(slowest, p);
      el.style.opacity = p < 1 ? p : ''; el.style.transform = p < 1 ? `translateY(${36 * k * (1 - p)}px)` : '';
    });
    scene.style.setProperty('--in', slowest);  // small parts drawn over the blocks wait for them
    if (top) {
      // A new segment rolls its title in and runs a light along the top bar.
      const out = c.exit === 'part' ? gone : 0, into = c.enter === 'part' && !still ? easeOut(seg(t, .05, .5)) : 1;
      for (const el of [$('partl'), top]) Object.assign(el.style, { opacity: Math.min(1 - out, into), transform: out ? `translateY(${-16 * out}px)` : into < 1 ? `translateY(${18 * (1 - into)}px)` : '' });
      const run = c.enter === 'part' && !still ? seg(t, .1, 1.0) : 0;
      Object.assign($('sweep').style, { left: (-24 + 124 * ease(run)) + '%', opacity: Math.sin(Math.PI * run) });
    }
  }

  function render(t) { stage.render(t); renderChrome(t); renderMoves(t); }

  // Parts marked data-safe that leave the format's content area, as readable descriptions.
  function unsafe([x0, y0, x1, y1]) {
    // Measured with everything settled: a block on its way in is not out of place.
    still = true; render(0);
    const origin = $('stage').getBoundingClientRect(), found = [];
    for (const el of document.querySelectorAll('[data-safe]')) {
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect(), box = [r.left - origin.left, r.top - origin.top, r.right - origin.left, r.bottom - origin.top];
      if (box[0] < x0 - 1 || box[1] < y0 - 1 || box[2] > x1 + 1 || box[3] > y1 + 1)
        found.push(`${el.className || el.id} spans x ${Math.round(box[0])}-${Math.round(box[2])}, y ${Math.round(box[1])}-${Math.round(box[3])}`);
    }
    // Every caption has to fit its bar, whichever one is on screen at the checked moment.
    const text = $('capt');
    if (text) {
      const bar = text.parentElement.getBoundingClientRect(), shown = text.innerHTML;
      for (const [at, html] of clip.chrome.captions) {
        text.innerHTML = html;
        const r = text.getBoundingClientRect();
        if (r.height > bar.height + 1 || r.width > bar.width + 1)
          found.push(`the caption at ${at.toFixed(1)} s does not fit its bar: "${text.textContent}"`);
      }
      text.innerHTML = shown;
    }
    // A panel's content must fit the panel at every moment of the story, not only at the start.
    const moments = [...new Set([...clip.steps.map(s => Math.min(s.time + 1, clip.duration)), clip.duration])];
    const spilled = new Set();
    for (const t of moments.sort((a, b) => a - b)) {
      render(t);
      for (const el of document.querySelectorAll('.panel, .scr, [data-fit]')) {
        if (el.offsetParent === null || spilled.has(el)) continue;
        if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) {
          spilled.add(el);
          found.push(`${el.id || el.className} has more in it than fits at ${t.toFixed(1)} s`);
        }
      }
    }
    still = false; render(0);
    return found;
  }

  return { clamp, ease, seg, fade, pop, bump, esc, typed, hl, last, $, set, head, ICON, stages, boot, render, unsafe };
})();
window.boot = SN.boot;
window.render = SN.render;

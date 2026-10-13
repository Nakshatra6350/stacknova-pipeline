// What every stage shares: time-shaping helpers, text helpers, and the chrome around a scene.
// Everything on screen is a function of the time t passed to render(t); nothing keeps state
// between frames, so any frame can be drawn on its own and a render is repeatable.
window.SN = (() => {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = p => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
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

  const stages = {};  // stage name -> { build(clip, root), render(t) }
  let clip = null, stage = null;

  // ---- chrome: top bar, caption bar, progress, Instagram lower third, Shorts prompt -----------
  function buildChrome(root) {
    const c = clip.chrome;
    if (!c || clip.stage === 'brand') return;
    const landscape = clip.format === 'landscape';
    const part = c.parts > 1 && landscape ? `Part ${String(c.part).padStart(2, '0')} / ${String(c.parts).padStart(2, '0')}` : 'StackNova';
    let h = `<div class="top abs"><span class="mark"></span><span class="lbl">${part}</span>
      <span class="ttl disp">${esc(c.title)}</span><span class="pill">${esc(landscape ? c.pill : c.pill_short)}</span></div>`;
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
      const caption = last(c.captions, t, x => x[0]) || c.captions[0];
      set('capt', caption[1]);
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
    const root = $('stage');
    root.innerHTML = ''; root.removeAttribute('style');
    stage.build(clip, root);
    buildChrome(root);
    render(0);
    return true;
  }

  function render(t) { stage.render(t); renderChrome(t); }

  // Parts marked data-safe that leave the format's content area, as readable descriptions.
  function unsafe([x0, y0, x1, y1]) {
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
      for (const el of document.querySelectorAll('.panel, .scr')) {
        if (el.offsetParent === null || spilled.has(el)) continue;
        if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) {
          spilled.add(el);
          found.push(`${el.id || el.className} has more in it than fits at ${t.toFixed(1)} s`);
        }
      }
    }
    render(0);
    return found;
  }

  return { clamp, ease, seg, fade, pop, bump, esc, typed, hl, last, $, set, ICON, stages, boot, render, unsafe };
})();
window.boot = SN.boot;
window.render = SN.render;

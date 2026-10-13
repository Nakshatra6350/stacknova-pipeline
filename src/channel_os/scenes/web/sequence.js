// The sequence stage: actors side by side, time running down.
// A `message` is an arrow between two lifelines on the next free row, with its words riding
// on it; a `note` is a pill on one lifeline; a `divider` is a labelled rule across all of
// them. `badge` stamps an actor's head.
SN.stages.sequence = (() => {
  const { ease, seg, fade, pop, bump, esc, last, $, set, head } = SN;
  const SLOTS = ['a', 'b', 'c', 'd'], TONE = { ok: 'ok', bad: 'err', info: 'hue' };
  const TAKES_ROW = new Set(['message', 'note', 'divider']), DRAW = .45;
  let D, L, steps, actors, lane, X, rowH, width;
  // A status as the element's colour. info adds nothing: the element keeps the colour it has.
  const hue = status => status && status !== 'info' ? `--hue:var(--${TONE[status]});` : '';

  function build(clip, root) {
    D = clip.decl; L = clip.format === 'landscape'; actors = D.actors;
    lane = Object.fromEntries(actors.map((a, i) => [a.id, a.kind === 'client' ? 'client' : SLOTS[i % 4]]));
    // Each step that draws takes the next row, unless it asks to share the row above.
    let row = -1;
    steps = clip.steps.map(s => {
      const params = s.params || {};
      if (TAKES_ROW.has(s.action) && !(params.same_row && row >= 0)) row += 1;
      return { ...s, params, row };
    });
    const actor = a => `<div class="slot" data-in><div class="actor" id="a-${a.id}" data-safe style="--hue:var(--${lane[a.id]})"></div></div>`;
    root.insertAdjacentHTML('beforeend', `<div class="main stack">${head(D)}
      <div class="seq"><div class="actors">${actors.map(actor).join('')}</div><div class="rows" id="rows" data-in></div></div></div>`);
    render(0);
    // Lifelines drop from where the heads ended up; rows share the height that is there.
    const box = $('rows').getBoundingClientRect();
    X = Object.fromEntries(actors.map(a => { const r = $('a-' + a.id).getBoundingClientRect(); return [a.id, (r.left + r.right) / 2 - box.left]; }));
    width = box.width;
    rowH = Math.min(box.height / Math.max(row + 1.2, 4), L ? 112 : 100);
  }

  const y = s => rowH * (s.row + .6);
  const tone = (s, fallback) => s.params.status && s.params.status !== 'info' ? TONE[s.params.status] : s.params.role === 'retry' ? 'retry' : s.params.role === 'error' ? 'err' : fallback;

  function rowsHTML(t) {
    let h = actors.map(a => `<i class="life" style="left:${X[a.id]}px"></i>`).join('');
    for (const s of steps.filter(x => TAKES_ROW.has(x.action) && t >= x.time)) {
      const p = ease(seg(t, s.time, s.time + DRAW)), show = fade(t, s.time, .2);
      if (s.action === 'message') {
        const [from, to] = s.target.split('->').map(v => v.trim()), a = X[from], b = X[to], reach = Math.abs(b - a) * p;
        const colour = tone(s, lane[from]), reply = s.params.role === 'reply';
        h += `<div class="msg${reply ? ' reply' : ''}${b < a ? ' rtl' : ''}" style="left:${b < a ? a - reach : a}px;top:${y(s)}px;width:${reach}px;--hue:var(--${colour})"><i></i></div>`;
        if (s.params.text) h += `<div class="mt${reply ? ' reply' : ''}" style="left:${(a + b) / 2}px;top:${y(s)}px;--hue:var(--${colour});opacity:${show};transform:translate(-50%,-50%) scale(${pop(t, s.time) || 1})">${esc(s.params.text)}</div>`;
      } else if (s.action === 'note') {
        h += `<div class="nt2" style="left:${X[s.target]}px;top:${y(s)}px;--hue:var(--${tone(s, lane[s.target])});opacity:${show};transform:translate(-50%,-50%) scale(${pop(t, s.time) || 1})">${esc(s.params.text || '')}</div>`;
      } else {
        h += `<div class="rule" style="top:${y(s)}px;width:${width * p}px"></div><div class="rt lbl" style="left:${width / 2}px;top:${y(s)}px;opacity:${show}">${esc(s.params.text || '')}</div>`;
      }
    }
    return h;
  }

  function render(t) {
    for (const a of actors) {
      const badge = last(steps.filter(s => s.action === 'badge' && s.target === a.id), t);
      const glow = Math.max(0, ...steps.filter(s => s.action === 'highlight' && s.target === a.id).map(s => bump(t, s.time, 1.4)),
        ...steps.filter(s => s.action === 'message' && s.target.split('->').some(v => v.trim() === a.id)).map(s => bump(t, s.time, .8)));
      const under = badge ? `<div class="ab on" style="${hue(badge.params.status)}transform:scale(${pop(t, badge.time) || 1})">${esc(badge.params.text)}</div>`
        : `<div class="ab">${esc(a.kind || 'service')}</div>`;
      set('a-' + a.id, `<div class="an disp">${esc(a.label || a.id)}</div>${under}`);
      $('a-' + a.id).classList.toggle('hot', glow > .02);
    }
    if (X) set('rows', rowsHTML(t));
  }

  return { build, render };
})();

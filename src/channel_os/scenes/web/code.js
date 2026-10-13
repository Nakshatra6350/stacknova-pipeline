// The code stage: a short listing in an editor window, shown and explained a few lines at a time.
// `show` brings lines in (when the listing starts hidden), `highlight` lights some and quiets the
// rest, `focus all` brings them all back, and `note` pins a remark to a line.
// The planner sends each line's coloured stretches in decl.tokens, so the page and the
// validator share one tokeniser (scenes/code_model.py).
SN.stages.code = (() => {
  const { seg, fade, bump, esc, last, $, set, head } = SN;
  const TONE = { ok: 'ok', bad: 'err', info: 'a' };
  let D, steps, lines;

  // "3", "2-4" or "all" as zero-based line numbers.
  function range(target) {
    if (target === 'all') return lines.map((_, i) => i);
    const [first, end] = target.split('-').map(Number), out = [];
    for (let i = first; i <= (end || first); i++) out.push(i - 1);
    return out;
  }

  function paint(text, tokens) {
    let h = '', at = 0;
    for (const [start, end, kind] of tokens || []) {
      h += esc(text.slice(at, start)) + `<span class="tk-${kind}">${esc(text.slice(start, end))}</span>`;
      at = end;
    }
    return h + esc(text.slice(at));
  }

  function build(clip, root) {
    D = clip.decl; lines = D.lines;
    steps = clip.steps.map(s => ({ ...s, params: s.params || {}, lines: s.action === 'focus' ? [] : range(s.target) }));
    root.insertAdjacentHTML('beforeend', `<div class="main stack">${head({ header: D.header })}
      <div class="codewrap"><div class="slot" data-in><div class="panel codewin" data-safe data-fit style="--hue:var(--a)">
          <div class="ph"><span class="dots"><i></i><i></i><i></i></span><span class="lbl">${esc(D.title || 'listing')}</span><span class="r">${esc((D.language || 'text').toUpperCase())}</span></div>
          <div class="lines" id="lines"></div></div></div>
        <div class="slot" data-in><div class="callout" id="callout" data-safe data-fit></div></div></div></div>`);
  }

  function render(t) {
    const shows = steps.filter(s => s.action === 'show'), lit = last(steps.filter(s => s.action === 'highlight' || s.action === 'focus'), t);
    const note = last(steps.filter(s => s.action === 'note'), t);
    set('lines', lines.map((text, i) => {
      // A hidden listing types itself in, each shown line a moment after the one above it.
      const shown = shows.find(s => s.lines.includes(i)), at = shown ? shown.time + .07 * shown.lines.indexOf(i) : 0;
      const there = !D.reveal ? 1 : shown && t >= at ? fade(t, at, .25) : 0;
      const on = lit && lit.action === 'highlight' && lit.lines.includes(i), quiet = lit && lit.action === 'highlight' && !on;
      const turn = lit ? seg(t, lit.time, lit.time + .3) : 0, flash = on ? bump(t, lit.time, 1.2) : 0;
      const marked = note && note.lines.includes(i);
      return `<div class="ln${on ? ' on' : ''}" style="opacity:${there * (quiet ? 1 - .62 * turn : 1)};transform:translateX(${D.reveal ? -14 * (1 - there) : 0}px);--glow:${Math.round(14 + 16 * flash)}%${marked ? `;--pin:var(--${TONE[note.params.status || 'info']})` : ''}">
        <span class="no">${i + 1}</span><code>${paint(text, (D.tokens || [])[i]) || ' '}</code>${marked ? '<i class="pin"></i>' : ''}</div>`;
    }).join(''));
    set('callout', note ? `<span class="lbl">line ${esc(note.target)}</span><div>${esc(note.params.text)}</div>` : '');
    Object.assign($('callout').style, { opacity: note ? fade(t, note.time, .25) : 0, transform: note ? `translateY(${10 * (1 - fade(t, note.time, .25))}px)` : '' });
    $('callout').style.setProperty('--hue', `var(--${note ? TONE[note.params.status || 'info'] : 'line'})`);
  }

  return { build, render };
})();

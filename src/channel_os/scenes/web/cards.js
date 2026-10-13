// The cards stage: one to four things compared side by side.
// A card has a title, an optional line of text and `key value` lines whose values change as an
// operation is applied to it. Cards can be joined into a sum ("+", "="), marked right or wrong,
// stamped with a verdict, dimmed and brought back.
SN.stages.cards = (() => {
  const { ease, seg, fade, pop, bump, esc, last, $, set, head } = SN;
  const SLOTS = ['a', 'b', 'c', 'd'], TONE = { ok: 'ok', bad: 'err', info: 'hue' };
  const MARK = { ok: '✓', bad: '✗', info: '•' };
  let D, L, steps, cards, stamped;
  // A status as the element's colour. info adds nothing: the element keeps the colour it has.
  const hue = status => status && status !== 'info' ? `--hue:var(--${TONE[status]});` : '';

  // How the cards sit: a row when there is room, a column for a sum or three, a grid for four.
  function arrangement() {
    if (D.arrange) return D.arrange;
    // Four cards that each carry text and lines are too much for one row of a wide frame.
    if (L) return cards.length === 4 && !D.joins && cards.every(c => c.text && (c.lines || []).length) ? 'grid' : 'row';
    if (cards.length <= 2 && !D.joins) return 'row';
    return cards.length === 4 && !D.joins ? 'grid' : 'column';
  }

  function build(clip, root) {
    D = clip.decl; L = clip.format === 'landscape'; cards = D.cards;
    steps = clip.steps.map(s => ({ ...s, params: s.params || {}, card: s.target.split('.')[0], line: s.target.split('.')[1] }));
    const joins = D.joins || [];
    // The slot is what arrives when the scene comes on; the card inside it shows, dims and
    // grows on its own account.
    const card = (c, i) => `<div class="slot" data-in><div class="cardx" id="c-${c.id}" data-safe data-fit style="--hue:var(--${SLOTS[i % 4]})"></div></div>`
      + (joins[i] ? `<div class="join disp" id="j-${i}">${esc(joins[i])}</div>` : '');
    root.insertAdjacentHTML('beforeend', `<div class="main stack">${head(D)}
      <div class="deck"><div class="cards ${arrangement()}${joins.length ? ' sum' : ''} n${cards.length}">${cards.map(card).join('')}</div></div></div>`);
    stamped = steps.some(s => s.action === 'badge');
  }

  // What a card says at time t, worked out from every step so far.
  function cardHTML(c, mine, t) {
    const runs = mine.filter(s => s.action === 'apply'), run = runs[runs.length - 1];
    const mark = last(mine.filter(s => s.action === 'mark'), t), badge = last(mine.filter(s => s.action === 'badge'), t);
    let h = `<div class="ch"><span class="ct disp">${esc(c.title || c.id)}</span>`;
    if (run) h += `<span class="runs" style="transform:scale(${pop(t, run.time) || 1});--hue:var(--${run.params.role === 'retry' ? 'retry' : 'muted'})">×${runs.length}</span>`;
    if (mark) h += `<span class="mk" style="${hue(mark.params.status || 'ok')}transform:scale(${pop(t, mark.time) || 1})">${MARK[mark.params.status || 'ok']}</span>`;
    h += '</div>';
    if (c.text) h += `<div class="cx">${esc(c.text)}</div>`;
    for (const line of c.lines || []) {
      // A value changes a beat after an `apply` lands on the card, and at once on a `set`.
      const changes = mine.filter(s => (s.action === 'set' && s.line === line.id) || (s.action === 'apply' && s.params.line === line.id && 'value' in s.params))
        .map(s => ({ at: s.time + (s.action === 'apply' ? .28 : 0), s })).filter(x => t >= x.at);
      const now = changes[changes.length - 1], tone = now && now.s.params.status ? TONE[now.s.params.status] : null;
      const lit = Math.max(now ? bump(t, now.at, 1.1) : 0, ...mine.filter(s => s.action === 'highlight' && s.line === line.id).map(s => bump(t, s.time, 1.4)));
      h += `<div class="cl" style="--tone:var(--${tone || 'ink'});--flash:var(--${tone || 'hue'});--lit:${Math.round(26 * lit)}%">
        <span class="k">${esc(line.key || line.id)}</span><span class="v" style="transform:scale(${now ? pop(t, now.at) || 1 : 1})">${esc(now ? now.s.params.value : line.value ?? '')}</span></div>`;
    }
    if (badge) h += `<div class="cb disp" style="${hue(badge.params.status)}opacity:${fade(t, badge.time, .18)};transform:scale(${pop(t, badge.time) || 1}) rotate(-2deg)">${esc(badge.params.text)}</div>`;
    else if (stamped) h += '<div class="cb disp" style="visibility:hidden">X</div>';  // room for a verdict, so no card grows later
    return h;
  }

  function render(t) {
    // Who is dimmed: `dim x` lowers x, `focus x` brings x up and lowers the rest, `all` is all.
    const dimmed = Object.fromEntries(cards.map(c => [c.id, 0]));
    for (const s of steps.filter(x => (x.action === 'dim' || x.action === 'focus') && t >= x.time)) {
      const p = ease(seg(t, s.time, s.time + .35));
      for (const c of cards) {
        const named = s.target === 'all' || s.card === c.id;
        if (s.action === 'dim' && named) dimmed[c.id] = Math.max(dimmed[c.id], p);
        if (s.action === 'focus') dimmed[c.id] = named ? dimmed[c.id] * (1 - p) : Math.max(dimmed[c.id], s.target === 'all' ? 0 : p);
      }
    }
    const seen = [];
    cards.forEach((c, i) => {
      const el = $('c-' + c.id), mine = steps.filter(s => s.card === c.id && t >= s.time);
      const shown = last(mine.filter(s => s.action === 'show'), t), mark = last(mine.filter(s => s.action === 'mark'), t);
      const run = last(mine.filter(s => s.action === 'apply'), t), there = !c.hidden || shown;
      set('c-' + c.id, cardHTML(c, mine, t));
      const glow = Math.max(0, ...mine.filter(s => s.action === 'highlight' && !s.line).map(s => bump(t, s.time, 1.4)));
      // An operation applied to the card is a ring that leaves it; a highlight is a glow.
      const ring = run && t < run.time + .7 ? seg(t, run.time, run.time + .7) : null;
      el.style.boxShadow = [
        glow > .02 ? `0 0 ${Math.round(50 * glow)}px -8px var(--hue)` : '',
        ring !== null ? `0 0 0 ${Math.round(16 * ease(ring))}px color-mix(in srgb,var(--${run.params.role === 'retry' ? 'retry' : 'ink'}) ${Math.round(60 * (1 - ring))}%,transparent)` : '',
      ].filter(Boolean).join(',');
      el.style.borderColor = mark ? `var(--${TONE[mark.params.status || 'ok']})` : glow > .02 ? 'var(--hue)' : '';
      seen[i] = there ? (c.hidden ? fade(t, shown.time, .3) : 1) : 0;
      el.style.opacity = seen[i] * (1 - .72 * dimmed[c.id]);
      el.style.transform = there && c.hidden ? `scale(${pop(t, shown.time) || 1})` : '';
    });
    // A join is there once the cards on both sides of it are.
    (D.joins || []).forEach((_, i) => { $('j-' + i).style.opacity = Math.min(seen[i], seen[i + 1]); });
  }

  return { build, render };
})();

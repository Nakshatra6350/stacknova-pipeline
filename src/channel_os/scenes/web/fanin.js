// The fan-in stage: many senders, one receiver, and a count of what arrives.
// Each source has a wire to the target. `fire` sends a packet down a source's wire; the target
// counts arrivals, and can carry a line of text (`tag`) and a verdict (`badge`).
SN.stages.fanin = (() => {
  const { ease, seg, fade, pop, bump, esc, last, $, set, head } = SN;
  const SLOTS = ['a', 'b', 'c', 'd'], TONE = { ok: 'ok', bad: 'err', info: 'hue' }, FLIGHT = .75;
  let D, L, steps, sources, fires, wires;
  // A status as the element's colour. info adds nothing: the element keeps the colour it has.
  const hue = status => status && status !== 'info' ? `--hue:var(--${TONE[status]});` : '';

  function build(clip, root) {
    D = clip.decl; L = clip.format === 'landscape'; sources = D.sources;
    steps = clip.steps.map(s => ({ ...s, params: s.params || {} }));
    fires = steps.filter(s => s.action === 'fire');
    const source = (s, i) => `<div class="slot" data-in><div class="src" id="s-${s.id}" data-safe style="--hue:var(--${SLOTS[i % 4]})"><i></i><span>${esc(s.label || s.id)}</span></div></div>`;
    root.insertAdjacentHTML('beforeend', `<svg class="wires" id="wires"></svg><div class="main stack">${head(D)}
      <div class="fan"><div class="srcs n${sources.length}">${sources.map(source).join('')}</div><div class="reach"></div>
        <div class="slot" data-in><div class="tgt" id="tgt" data-safe data-fit style="--hue:var(--client)"></div></div></div></div>`);

    // Wires run between where the cards ended up: out of a source's side, into the target's.
    render(0);
    const origin = root.getBoundingClientRect(), box = el => { const r = el.getBoundingClientRect(); return { x0: r.left - origin.left, y0: r.top - origin.top, x1: r.right - origin.left, y1: r.bottom - origin.top }; };
    const goal = box($('tgt')), spread = i => (i - (sources.length - 1) / 2) * (L ? 16 : 26);
    wires = {};
    sources.forEach((s, i) => {
      const b = box($('s-' + s.id));
      wires[s.id] = L ? [b.x1, (b.y0 + b.y1) / 2, goal.x0, (goal.y0 + goal.y1) / 2 + spread(i)]
        : [(b.x0 + b.x1) / 2, b.y1, (goal.x0 + goal.x1) / 2 + spread(i), goal.y0];
    });
    $('wires').setAttribute('viewBox', `0 0 ${origin.width} ${origin.height}`);
    $('wires').innerHTML = sources.map((s, i) => { const [x1, y1, x2, y2] = wires[s.id]; return `<line id="w-${s.id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="--hue:var(--${SLOTS[i % 4]})"/>`; }).join('');
    fires.forEach((s, i) => root.insertAdjacentHTML('beforeend', `<div class="pkt" id="fp-${i}" hidden><i></i><span></span></div>`));
  }

  function targetHTML(t) {
    const target = D.target, landed = fires.filter(s => t >= s.time + FLIGHT), latest = landed[landed.length - 1];
    const tags = steps.filter(s => s.action === 'tag' && t >= s.time).slice(-2), badge = last(steps.filter(s => s.action === 'badge'), t);
    const lines = tags.map(s => `<div style="opacity:${fade(t, s.time)}">› ${esc(s.params.text)}</div>`).join('') || '<div>› waiting</div>';
    return `<div class="tc"><div class="num disp" style="transform:scale(${latest ? pop(t, latest.time + FLIGHT) || 1 : 1})">${landed.length}</div>
        <div class="lbl">${esc(D.counter || 'arrived')}</div></div>
      <div class="ti"><div class="tt disp">${esc(target.label || target.id)}</div>${target.title ? `<div class="ns">${esc(target.title)}</div>` : ''}<div class="lg">${lines}</div></div>
      ${badge ? `<div class="cb disp" style="${hue(badge.params.status)}opacity:${fade(t, badge.time, .18)};transform:scale(${pop(t, badge.time) || 1}) rotate(-2deg)">${esc(badge.params.text)}</div>`
        : '<div class="cb disp" style="visibility:hidden">X</div>'}`;
  }

  function render(t) {
    const lit = id => Math.max(0, ...steps.filter(s => s.action === 'highlight' && s.target === id).map(s => bump(t, s.time, 1.4)));
    sources.forEach(s => {
      const shot = last(fires.filter(f => f.target === s.id), t), glow = Math.max(lit(s.id), shot ? bump(t, shot.time, .9) : 0), el = $('s-' + s.id);
      el.classList.toggle('hot', glow > .02);
      el.style.transform = shot ? `scale(${pop(t, shot.time) || 1})` : '';
      const wire = $('w-' + s.id);
      if (wire) wire.style.opacity = .35 + .65 * (shot ? bump(t, shot.time, FLIGHT + .3) : 0);
    });
    fires.forEach((s, i) => {
      const el = $('fp-' + i);
      if (!el) return;
      if (t < s.time || t > s.time + FLIGHT + .1) { el.hidden = true; return; }
      const [x1, y1, x2, y2] = wires[s.target], p = ease(seg(t, s.time, s.time + FLIGHT)), index = sources.findIndex(x => x.id === s.target);
      el.hidden = false;
      el.style.cssText = `left:${x1 + (x2 - x1) * p}px;top:${y1 + (y2 - y1) * p}px;--hue:var(--${s.params.role === 'retry' ? 'retry' : SLOTS[index % 4]})`;
      el.lastChild.textContent = s.params.text || (s.params.role === 'retry' ? 'retry' : D.packet || 'request');
    });
    set('tgt', targetHTML(t));
    const landed = last(fires.filter(s => t >= s.time + FLIGHT), t, s => s.time + FLIGHT);
    $('tgt').classList.toggle('hot', lit(D.target.id) > .02 || (landed && t < landed.time + FLIGHT + .5));
  }

  return { build, render };
})();

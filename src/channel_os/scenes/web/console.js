// The console stage: a control room for one request's journey.
// A row of systems, packets that carry their own label along a track, an optional phone with a
// real app screen, the request and response on the wire, and panels of state (a table, a list).
// Landscape shows all of it; portrait shows the systems and the one panel the story is on.
SN.stages.console = (() => {
  const { clamp, ease, seg, fade, pop, bump, esc, typed, hl, last, $, set } = SN;
  const SLOTS = ['a', 'b', 'c', 'd'];
  let D, L, steps, order, lane, label, X, trackY, packets, by;

  const of = action => steps.filter(s => s.action === action);
  // A body as text: indented in landscape, on as few lines as it takes in portrait.
  const flat = v => v && typeof v === 'object' && !Array.isArray(v)
    ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${flat(x)}`).join(', ')} }` : JSON.stringify(v);
  const text = value => typeof value === 'string' ? value : L ? JSON.stringify(value, null, 2) : flat(value);

  function build(clip, root) {
    D = clip.decl; L = clip.format === 'landscape';
    steps = clip.steps.map(s => ({ ...s, params: s.params || {} }));
    order = [...(D.phone ? ['phone'] : []), ...D.systems.map(s => s.id)];
    lane = { phone: 'client' }; label = { phone: L ? 'Client' : 'You' };
    D.systems.forEach((s, i) => { lane[s.id] = SLOTS[i]; label[s.id] = s.name; });
    by = { tap: of('tap'), screen: of('screen'), log: of('log'), row: of('row'), item: of('item'),
           stamp: of('stamp'), note: of('note'), highlight: of('highlight'), send: of('send') };

    const cards = [...(D.phone && !L ? [{ id: 'phone', sub: 'your phone' }] : []), ...D.systems];
    // data-in marks the blocks that arrive one after another when the scene comes on.
    const node = s => `<div class="node${s.id === 'phone' ? ' you' : ''}" id="n-${s.id}" data-safe data-in style="--hue:var(--${lane[s.id]})"></div>`;
    const panel = p => `<div class="panel" id="p-${p.id}" data-safe data-in style="--hue:var(--${p.lane ? lane[p.lane] || 'b' : 'b'})"></div>`;
    root.insertAdjacentHTML('beforeend', `<div class="main">
      ${D.phone ? '<div class="phone" data-safe data-in><div class="scr" id="scr"></div></div>' : ''}
      <div class="board"><div class="systems${cards.length > 3 ? ' tight' : ''}">${cards.map(node).join('')}</div>
        <div class="trackrow" data-in><div class="track" id="track"></div></div>
        <div class="lower"><div class="panel" id="wire" data-safe data-in></div>
          ${(D.panels || []).length ? `<div class="side">${D.panels.map(panel).join('')}</div>` : ''}</div></div></div>`);

    // Where things ended up: packets are placed from the measured layout, not from numbers.
    const origin = root.getBoundingClientRect(), mid = el => { const r = el.getBoundingClientRect(); return (r.left + r.right) / 2 - origin.left; };
    X = {};
    for (const id of order) if ($('n-' + id)) X[id] = mid($('n-' + id));
    const track = $('track').getBoundingClientRect();
    trackY = track.top - origin.top + 1;
    if (D.phone && L) X.phone = track.left - origin.left - 8;
    for (const id of order) root.insertAdjacentHTML('beforeend', `<div class="tick" style="left:${X[id]}px;top:${trackY - 8}px"></div>`);

    packets = by.send.map((s, i) => {
      const [from, to] = s.target.split('->').map(v => v.trim()), a = order.indexOf(from), b = order.indexOf(to);
      const path = order.slice(Math.min(a, b), Math.max(a, b) + 1); if (a > b) path.reverse();
      const p = s.params, role = p.role || 'request', hops = path.length - 1;
      const colour = role === 'retry' ? 'retry' : role === 'error' ? 'err' : lane[from];
      root.insertAdjacentHTML('beforeend', `<div class="pkt" id="pk-${i}" hidden><i></i><span></span></div>`);
      return { step: s, path, from, to, a: s.time + .05, d: clamp(.5 * hops, .5, 1.1), colour, back: role === 'reply', lost: p.lost, text: p.label || '' };
    });
  }

  // ---- phone: a checkout screen whose state follows the taps and `screen` steps ----------------
  function phoneHTML(t) {
    const P = D.phone, screen = last(by.screen, t), state = screen ? screen.params.state || 'idle' : 'idle';
    const tap = last(by.tap, t), busy = tap && (!screen || screen.time < tap.time) && t < tap.time + 4;
    const chipStep = last(by.screen.filter(s => 'chip' in s.params), t), chip = chipStep && chipStep.params.chip;
    let h = `<div class="sbar"><span>9:41</span><span>5G ▪▪▪ 84%</span></div><div class="ahead">← ${esc(P.title || 'Checkout')}</div><div class="abody">`;
    if (state === 'success') h += `<div class="done"><div class="ci">✓</div><b>${esc(screen.params.title || 'Payment successful')}</b><span>${esc(screen.params.text || '')}</span>${screen.params.warn ? `<span style="color:#b3261e">${esc(screen.params.warn)}</span>` : ''}</div>`;
    else h += `<div class="card">${(P.items || []).map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}
      <div class="tot"><span>Total</span><b>${esc(P.total || '')}</b></div></div>`;
    if (chip) h += `<div class="keyc${chip.status === 'bad' ? ' bad' : ''}" style="opacity:${fade(t, chipStep.time)};transform:scale(${pop(t, chipStep.time) || 1})"><span>${esc(chip.label)}</span><span>${esc(chip.value)}</span></div>`;
    if (state !== 'success' && P.method) h += `<div class="card"><div class="row"><span>Pay with</span><span>${esc(P.method)}</span></div></div>`;
    const tries = by.tap.filter(s => t >= s.time).map((s, i) => {
      const result = by.screen.find(x => x.time > s.time && x.params.attempt && t >= x.time);
      const tone = !result ? '#5a6b77' : result.params.state === 'error' || result.params.warn ? '#b3261e' : '#0b8a4a';
      return `<div><span>Attempt ${i + 1}</span><span style="color:${tone}">${esc(result ? result.params.attempt : 'sending…')}</span></div>`;
    });
    if (tries.length) h += `<div class="tries">${tries.slice(-4).join('')}</div>`;
    if (state === 'error' && !busy) h += `<div class="toast err" style="opacity:${fade(t, screen.time)}"><b>${esc(screen.params.title || 'Something went wrong')}</b>${esc(screen.params.text || '')}</div>`;
    const ripple = tap && t < tap.time + .5 ? (() => { const p = seg(t, tap.time, tap.time + .5); return `<span class="rip" style="transform:scale(${.5 + p});opacity:${1 - p}"></span>`; })() : '';
    const name = busy ? `<span class="spin" style="transform:rotate(${Math.round(t * 420)}deg)"></span>Processing…`
      : state === 'error' ? 'Try again' : state === 'success' ? 'Done' : esc(P.button || `Pay ${P.total || ''}`);
    return h + `<div class="pay${busy ? ' busy' : ''}"><span>${name}</span>${ripple}</div></div>`;
  }

  // Portrait has no room for the phone, so its card says in a few words what the screen would show.
  function phoneLine(t) {
    const tap = last(by.tap, t), screen = last(by.screen.filter(s => s.params.state), t);
    if (tap && (!screen || screen.time < tap.time)) return t < tap.time + 4 ? 'sending…' : 'waiting…';
    if (!screen || screen.params.state === 'idle') return 'ready to pay';
    return (screen.params.state === 'error' ? '✕ ' : '✓ ') + (screen.params.attempt || screen.params.state);
  }

  // ---- wire: the request being sent, typed out, and the response when it comes -----------------
  function wireHTML(t) {
    const sent = last(by.send.filter(s => s.params.wire), t), note = last(by.note, t);
    const noteHTML = n => `<div class="note" style="--hue:var(--${n.params.status === 'bad' ? 'err' : n.params.status === 'ok' ? 'ok' : 'client'});opacity:${fade(t, n.time)}">${esc(n.params.text)}</div>`;
    if (!sent) return `<div class="ph"><span class="lbl">On the wire</span></div>${note ? `<div style="height:14px"></div>${noteHTML(note)}` : '<div class="empty">Nothing has been sent yet.</div>'}`;
    const w = sent.params.wire, pk = packets[by.send.indexOf(sent)];
    const chips = pk.path.map(id => `<span class="chipc" style="--hue:var(--${lane[id]})">${esc(label[id])}</span>`).join('<span class="arrow">→</span>');
    let h = `<div class="ph">${chips}${w.tag ? `<span class="r" style="color:var(--${w.bad ? 'err' : 'retry'});font-weight:700">${esc(w.tag)}</span>` : ''}</div>
      <div class="wtitle disp">${esc(w.title || 'Request')}</div><div class="req"><span class="meth">${esc(w.method || 'POST')}</span><span>${esc(w.path || '')}</span></div><div class="hdrs">`;
    for (const [k, v] of Object.entries(w.headers || {})) {
      const hot = (w.hi || ['Idempotency-Key']).includes(k), missing = v === null;
      if (!L && !hot) continue;  // portrait keeps only the header the story is about
      h += `<span class="k${hot ? ' hi' : ''}" style="--hue:var(--${missing ? 'err' : 'client'})">${esc(k)}</span><span class="v${hot ? ' hi' : ''}" style="--hue:var(--${missing ? 'err' : 'client'})">${missing ? '— not sent —' : esc(v)}</span>`;
    }
    h += '</div>';
    if (L && w.body !== undefined) h += `<div class="sec"><div class="sl"><span class="lbl">Body</span></div><pre class="code">${hl(typed(text(w.body), seg(t, sent.time + .05, sent.time + .75)))}</pre></div>`;
    const reply = last(by.send.filter(s => s.params.response && s.time >= sent.time), t);
    if (reply) {
      const r = reply.params.response, p = seg(t, reply.time, reply.time + .35), rp = packets[by.send.indexOf(reply)];
      const dead = reply.params.lost !== undefined && t >= rp.a + rp.d;
      h += `<div class="sec"><div class="sl"><span class="lbl">Response</span><b class="${r.bad ? 'bad' : ''}">${esc(r.status || '')}</b>${dead ? `<b class="bad">✕ never reached ${esc(label[rp.to])}</b>` : ''}</div>
        <pre class="code">${hl(typed(text(r.body === undefined ? '' : r.body), p))}</pre></div>`;
    } else h += '<div class="sec"><div class="sl"><span class="lbl">Response</span></div><div class="wait">waiting…</div></div>';
    if (note && note.time >= sent.time) h += noteHTML(note);
    return h;
  }

  // ---- panels: a table whose rows change in place, or a list that grows ------------------------
  function panelHTML(p, t) {
    const glow = id => Math.max(0, ...by.highlight.filter(s => s.target === id).map(s => bump(t, s.time, 1.4)));
    const stamp = last(by.stamp.filter(s => s.target === p.id), t);
    const stampHTML = stamp ? `<div class="stamp disp" style="--hue:var(--${stamp.params.status === 'bad' ? 'err' : 'ok'});transform:scale(${pop(t, stamp.time) || 1}) rotate(-4deg);opacity:${fade(t, stamp.time, .15)}">${esc(stamp.params.text)}</div>` : '';
    if (p.kind === 'list') {
      const items = by.item.filter(s => s.target === p.id && t >= s.time);
      // An item is green unless it says otherwise: bad is red, info takes the panel's own colour.
      const tone = s => s.params.status === 'bad' ? '--hue:var(--err);' : s.params.status === 'info' ? '' : '--hue:var(--ok);';
      const rows = items.map(s => `<div class="chg" style="${tone(s)}opacity:${fade(t, s.time)}"><span>${esc(s.params.text)}</span><span>${esc(s.params.value || '')}</span></div>`).join('');
      return `<div class="ph"><span class="lbl">${esc(p.title)}</span><span class="r">${items.length} ${esc(p.unit || 'items')}</span></div>
        <div class="chips">${rows || `<div class="empty" style="padding:0">${esc(p.empty || 'Nothing yet.')}</div>`}</div>${stampHTML}`;
    }
    const rows = new Map();
    for (const s of by.row.filter(s => s.target === p.id && t >= s.time)) rows.set(String(s.params.key), [...(rows.get(String(s.params.key)) || []), s]);
    const head = p.columns.map(c => `<th>${esc(c)}${c === p.unique ? ` <span class="uq" style="box-shadow:0 0 ${Math.round(26 * glow(p.id + '.unique'))}px var(--hue)">UNIQUE</span>` : ''}</th>`).join('');
    let h = `<div class="ph"><span class="lbl">${esc(p.title)}</span><span class="r">${rows.size} row${rows.size === 1 ? '' : 's'}</span></div><table class="t"><tr>${head}</tr>`;
    let message = '';
    for (const [key, history] of rows) {
      const now = history[history.length - 1], shown = [...history].reverse().find(s => !s.params.conflict) || now;
      const clash = now.params.conflict ? bump(t, now.time, 1.4) : 0, lit = Math.max(...history.map(s => s.params.conflict ? 0 : bump(t, s.time, 1.4)));
      const style = clash > 0 ? `box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--err) ${Math.round(100 * clash)}%,transparent)` : `background:color-mix(in srgb,var(--hue) ${Math.round(24 * lit)}%,transparent)`;
      const tone = { ok: 'ok', bad: 'err', info: 'hue' }[shown.params.status || 'info'];
      h += `<tr style="${style}"><td>${esc(key)}</td>${(shown.params.cells || []).map((c, i) => `<td${i === 0 ? ` style="color:var(--${tone})"` : ''}>${esc(c)}</td>`).join('')}</tr>`;
      if (now.params.conflict && now.params.message && t < now.time + 3.5) message = `<div class="empty" style="color:var(--err);opacity:${fade(t, now.time)}">${esc(now.params.message)}</div>`;
    }
    return h + `</table>${rows.size ? message : `<div class="empty">${esc(p.empty || 'Nothing stored yet.')}</div>`}${stampHTML}`;
  }

  function render(t) {
    const hot = new Set(by.highlight.filter(s => t >= s.time && t < s.time + 1.6).map(s => s.target));
    packets.forEach((p, i) => {
      const el = $('pk-' + i), end = p.a + p.d, lost = p.lost !== undefined;
      if (t < p.a || t > end + (lost ? .7 : .12)) { el.hidden = true; return; }
      const xs = p.path.map(id => X[id]), legs = xs.slice(1).map((x, j) => Math.abs(x - xs[j])), total = legs.reduce((a, b) => a + b, 0);
      let need = ease(seg(t, p.a, end)) * (lost ? p.lost : 1) * total, x = xs[0];
      for (let j = 0; j < legs.length; j++) { if (need <= legs[j]) { x = xs[j] + (xs[j + 1] - xs[j]) * (legs[j] ? need / legs[j] : 0); break; } need -= legs[j]; x = xs[j + 1]; }
      const dead = lost && t > end;
      el.hidden = false; el.className = 'pkt' + (p.back ? ' back' : '') + (dead ? ' dead' : '');
      el.style.cssText = `left:${x}px;top:${trackY}px;--hue:var(--${p.colour});opacity:${dead ? 1 - seg(t, end + .35, end + .7) : 1}`;
      el.lastChild.textContent = dead ? '✕ lost' : p.text;
      if (!dead) p.path.forEach(id => hot.add(id));
    });
    for (const s of [...(D.phone && !L ? [{ id: 'phone', sub: 'your phone' }] : []), ...D.systems]) {
      const logs = s.id === 'phone' ? [{ params: { text: phoneLine(t) } }]
        : by.log.filter(x => x.target === s.id && t >= x.time).slice(L ? -2 : -1);
      const lines = (logs.length ? logs.map(x => x.params.text) : [s.idle || 'idle']).map(x => `<div>› ${esc(x)}</div>`).join('');
      set('n-' + s.id, `<span class="led" style="opacity:${hot.has(s.id) ? 1 : .25}"></span><div class="nt disp">${esc(label[s.id])}</div><div class="ns">${esc(s.sub || '')}</div><div class="lg">${lines}</div>`);
      $('n-' + s.id).classList.toggle('hot', hot.has(s.id));
    }
    set('wire', wireHTML(t));
    for (const p of D.panels || []) { set('p-' + p.id, panelHTML(p, t)); $('p-' + p.id).classList.toggle('hot', hot.has(p.id)); }
    if (D.phone && L) {
      set('scr', phoneHTML(t));
      // The phone glows only when a step points at it; its screen already shows what it does.
      $('scr').parentElement.classList.toggle('hot', by.highlight.some(s => s.target === 'phone' && t >= s.time && t < s.time + 1.6));
    }
    if (!L) {
      // Portrait shows one panel: the one the latest step was about.
      const touch = s => s.action === 'row' || s.action === 'item' || s.action === 'stamp' ? s.target
        : s.action === 'highlight' && (D.panels || []).some(p => s.target.split('.')[0] === p.id) ? s.target.split('.')[0]
        : (s.action === 'send' && (s.params.wire || s.params.response)) || s.action === 'note' ? 'wire' : null;
      const latest = last(steps.filter(touch), t), focus = latest ? touch(latest) : 'wire';
      $('wire').style.display = focus === 'wire' ? 'flex' : 'none';
      for (const p of D.panels || []) $('p-' + p.id).style.display = focus === p.id ? 'flex' : 'none';
    }
  }

  return { build, render };
})();

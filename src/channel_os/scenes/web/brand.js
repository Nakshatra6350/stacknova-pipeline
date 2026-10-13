// Brand scenes for long videos: the logo intro (played after the hook) and the outro.
// The planner adds them; episodes never write them. decl: { scene: 'intro' | 'outro', ... }.
SN.stages.brand = (() => {
  const { ease, seg, fade, pop, bump, esc, $, ICON } = SN;
  let D, duration;

  function buildIntro(root) {
    root.style.background = 'radial-gradient(1100px 760px at 50% 40%,#140b2c,#020008 70%)';
    root.innerHTML = `<div class="center"><div style="display:grid;justify-items:center;gap:26px">
      <div class="emblem" id="em" style="width:470px;height:470px"></div>
      <div class="word disp"><span id="w1" style="display:inline-block">Stack</span><span class="grad" id="w2" style="display:inline-block">Nova</span></div>
      <div class="tag"><i id="t1"></i><span id="tt">${esc(D.tagline)}</span><i id="t2"></i></div></div></div>
      <div class="abs" id="flare" style="left:50%;top:292px;width:10px;height:10px;border-radius:50%"></div>`;
  }

  function renderIntro(t) {
    const rise = ease(seg(t, .15, 1.25)), burst = bump(t, .95, 1.5);
    Object.assign($('em').style, { opacity: rise, transform: `translateY(${40 * (1 - rise)}px) scale(${.82 + .18 * rise + .03 * burst})`, filter: `blur(${12 * (1 - rise)}px) brightness(${1 + .55 * burst})` });
    $('flare').style.boxShadow = `0 0 ${220 * burst}px ${70 * burst}px rgba(255,190,90,${.5 * burst})`;
    [['w1', 1.25], ['w2', 1.5]].forEach(([id, at]) => { const p = ease(seg(t, at, at + .6)); Object.assign($(id).style, { opacity: p, transform: `translateY(${50 * (1 - p)}px)` }); });
    const line = ease(seg(t, 2.15, 2.9));
    $('t1').style.width = $('t2').style.width = 150 * line + 'px';
    Object.assign($('tt').style, { opacity: line, letterSpacing: (.2 + .22 * line) + 'em' });
    // In from black and out to black, so it sits cleanly between two scenes.
    $('stage').style.filter = `brightness(${fade(t, 0, .25) * (1 - ease(seg(t, duration - .6, duration - .1)))})`;
  }

  const asks = () => [
    ['comment', 'Got a question?', 'Ask it in the comments. Feedback is welcome too.', 'a', 1.0],
    ['like', 'Did this help?', 'A like tells YouTube to show it to more engineers.', 'err', 3.2],
    ['bell', 'Subscribe', `${D.youtube} · ${D.cadence}`, 'b', 5.2],
    ['share', 'Share it', 'Send it to one engineer who would use it.', 'c', 7.0],
  ];

  function buildOutro(root) {
    const next = D.next ? `<div class="abs lbl" style="left:1010px;top:226px">Next episode</div>
      <div class="next" id="next" style="left:1010px;top:262px;width:840px;height:472px"><span class="disp" style="font-size:44px;color:var(--ink);padding:0 40px">${esc(D.next.title)}</span></div>
      <div class="abs" style="left:1010px;top:770px;width:840px;font-size:24px;color:var(--muted);line-height:1.45">${esc(D.next.teaser || '')}</div>` : '';
    root.innerHTML = `<div class="top abs"><span class="mark"></span><span class="ttl disp">Stack<span class="grad">Nova</span></span><span class="pill">${esc(D.tagline)}</span></div>
      <div class="abs disp" style="left:70px;top:112px;font-size:64px">Thanks for watching.</div>
      ${asks().map((a, i) => `<div class="act" id="a${i}" style="left:70px;top:${226 + i * 142}px;width:860px;--hue:var(--${a[3]})"><span class="ic">${ICON[a[0]]}</span><span><b>${esc(a[1])}</b><span>${esc(a[2])}</span></span></div>`).join('')}
      <div class="act" id="ig" style="left:70px;top:810px;width:860px;--hue:#ff4d8d"><span class="ic" style="background:var(--brand)">${ICON.cam}</span><span><b>${esc(D.instagram)}</b><span>Follow on Instagram for Reels and carousels between episodes.</span></span></div>
      ${next}<div class="prog" id="prog"></div>`;
  }

  function renderOutro(t) {
    asks().forEach((a, i) => {
      const el = $('a' + i), p = fade(t, a[4] - .5, .4);
      el.style.opacity = p; el.style.transform = `translateX(${-40 * (1 - p)}px) scale(${pop(t, a[4]) || 1})`;
      el.classList.toggle('on', t >= a[4] && t < a[4] + 1.8);
    });
    const p = fade(t, 8.4, .4);
    Object.assign($('ig').style, { opacity: p, transform: `translateX(${-40 * (1 - p)}px) scale(${pop(t, 8.8) || 1})` });
    $('ig').classList.toggle('on', t >= 8.8);
    if ($('next')) $('next').style.opacity = fade(t, .6, .6);
    $('prog').style.width = (100 * t / duration) + '%';
    $('stage').style.filter = `brightness(${fade(t, 0, .3)})`;
  }

  return {
    build(clip, root) { D = clip.decl; duration = clip.duration; (D.scene === 'intro' ? buildIntro : buildOutro)(root); },
    render(t) { (D.scene === 'intro' ? renderIntro : renderOutro)(t); },
  };
})();

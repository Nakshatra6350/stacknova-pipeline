// The HashMap draft: a hall of 16 lockers (the buckets), the engineer and Nova, and every camera
// move, prop and caption as a function of t. Times come from data (the spoken lines and events).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COLORS, toon, glow, card, roundRect, clamp, lerp, smooth, smoother, easeOut, easeIn, backOut, span, window_, vlerp, rng, wobble } from './lib/kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const deg = THREE.MathUtils.degToRad;

export async function buildShow({ scene, camera, bloom, emblem, data, makeEngineer, makeNova }) {
  const ev = data.events;
  const lines = data.lines;
  const L = Object.fromEntries(lines.map((l) => [l.id, l]));
  const said = (id, key, which = 0, end = false) => {
    const hits = L[id].said.filter((w) => w.k === key);
    if (!hits.length) return end ? L[id].end : L[id].start;
    const w = hits[Math.min(which, hits.length - 1)];
    return end ? w.e : w.s;
  };

  // ------------------------------------------------------------------ the world
  scene.fog = new THREE.FogExp2(0x040713, 0.035);
  const R = 4.2;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 96), toon(0x070b18));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const grid = new THREE.GridHelper(32, 64, 0x2fb7e6, 0x15405e);
  grid.material.transparent = true; grid.material.toneMapped = false; grid.position.y = 0.003; scene.add(grid);
  const ringMat = glow(COLORS.cyan, 0.9, 2.2);
  const centerRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.66, 96), ringMat);
  centerRing.rotation.x = -Math.PI / 2; centerRing.position.set(0.35, 0.006, 1.0); scene.add(centerRing);
  const scan = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.0, 128), glow(0x8ff6ff, 1, 3));
  scan.rotation.x = -Math.PI / 2; scan.position.set(0.35, 0.01, 1.0); scene.add(scan);

  // the data city far behind
  const winTex = card(1, 1, 256, (ctx, w, h) => {
    ctx.fillStyle = '#05080f'; ctx.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let y = 8; y < h; y += 14) for (let x = 6; x < w; x += 12) {
      const k = r();
      ctx.fillStyle = k > 0.82 ? '#3fd8ff' : k > 0.74 ? '#2a5cff' : '#0b1422';
      ctx.fillRect(x, y, 6, 7);
    }
  }).userData.tex.tex;
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const towerMat = new THREE.MeshBasicMaterial({ map: winTex, color: new THREE.Color(0.85, 0.85, 0.85), toneMapped: false });
  const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), towerMat, 46);
  { const r = rng(11), m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + r() * 0.1, rad = 14 + r() * 8, h = 3 + r() * 11, w = 1 + r() * 1.8;
      m.compose(V(Math.sin(a) * rad, h / 2, -Math.cos(a) * rad), q.setFromEuler(new THREE.Euler(0, -a, 0)), V(w, h, w));
      towers.setMatrixAt(i, m);
    } }
  scene.add(towers);

  // particles drifting up
  const PN = 700, pr = rng(5);
  const pBase = new Float32Array(PN * 3), pPos = new Float32Array(PN * 3);
  for (let i = 0; i < PN; i++) { const a = pr() * Math.PI * 2, rad = 1 + pr() * 11; pBase.set([Math.sin(a) * rad, pr() * 6, -Math.cos(a) * rad + 1], i * 3); }
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: new THREE.Color(0.5, 2.2, 2.8), size: 0.03, transparent: true, opacity: 0.4, toneMapped: false, depthWrite: false });
  scene.add(new THREE.Points(pGeo, pMat));

  // lockers: the 16 buckets of a HashMap with the default capacity
  const lockers = [];
  const plateDraw = (i) => (ctx, w, h, s = {}) => {
    ctx.fillStyle = s.red ? 'rgba(60,8,16,0.95)' : 'rgba(4,16,28,0.95)'; roundRect(ctx, 4, 4, w - 8, h - 8, 18); ctx.fill();
    ctx.strokeStyle = s.red ? '#ff3b5c' : s.hot ? '#8ff6ff' : '#22d3ff'; ctx.lineWidth = s.hot ? 8 : 5; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = s.hot ? 30 : 14; ctx.stroke();
    ctx.shadowBlur = s.hot ? 26 : 10; ctx.fillStyle = s.red ? '#ffb3c0' : '#d9faff';
    ctx.font = '700 88px "JetBrains Mono"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i).padStart(2, '0'), w / 2, h / 2 + 4);
  };
  const doorDraw = (ctx, w, h) => {
    ctx.fillStyle = '#1a2238'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#0c1120'; ctx.lineWidth = 6;
    for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(w * 0.22, h * 0.1 + k * 22); ctx.lineTo(w * 0.78, h * 0.1 + k * 22); ctx.stroke(); }
    ctx.fillStyle = '#22d3ff'; ctx.fillRect(w * 0.82, h * 0.45, 10, 70);
    ctx.strokeStyle = '#2a3554'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, w - 20, h - 20);
  };
  for (let i = 0; i < 16; i++) {
    const a = deg(-80 + (i * 160) / 15);
    const g = new THREE.Group(); g.position.set(R * Math.sin(a), 0, -R * Math.cos(a)); g.lookAt(0, 0, 0); scene.add(g);
    const bodyMat = toon(COLORS.steel, { transparent: true });
    const bodyGeo = new RoundedBoxGeometry(0.66, 1.9, 0.5, 3, 0.04);
    const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.95; g.add(body);
    const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0.4, 2.2, 2.9), transparent: true, opacity: 0, toneMapped: false });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.66, 1.9, 0.5)), edgeMat); edges.position.y = 0.95; g.add(edges);
    const insideMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.1, 0.15), toneMapped: false });
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.62), insideMat);
    inside.position.set(0, 0.92, 0.0); g.add(inside);
    const pivot = new THREE.Group(); pivot.position.set(-0.29, 0.92, 0.256); g.add(pivot);
    const doorTex = card(0.58, 1.66, 200, doorDraw).userData.tex.tex;
    const doorMat = toon(0xffffff, { map: doorTex, transparent: true });
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.66, 0.03), doorMat); door.position.x = 0.29; pivot.add(door);
    const plate = card(0.4, 0.2, 400, plateDraw(i)); plate.position.set(0, 1.97, 0.2); g.add(plate);
    const alarm = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.05), glow(COLORS.red, 1, 3)); alarm.position.set(0, 1.86, 0.262); alarm.visible = false; g.add(alarm);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.025), glow(COLORS.cyan, 1, 2.2)); strip.position.set(0, 0.04, 0.262); g.add(strip);
    const front = V(0, 0, 0).sub(g.position).normalize();
    lockers.push({ g, pivot, bodyMat, doorMat, edgeMat, insideMat, plate, alarm, front, pos: g.position.clone(), plateKey: '' });
  }
  const P = (i, out = 0.35, y = 1.0) => lockers[i].pos.clone().addScaledVector(lockers[i].front, out).setY(y);

  // ghost lockers for "grows the table" (32 buckets)
  const ghosts = [];
  for (let i = 0; i < 16; i++) {
    const a = deg(-80 + ((i + 0.5) * 160) / 15.5);
    const m = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 1.7, 0.4)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(0.5, 2.0, 2.6), transparent: true, opacity: 0, toneMapped: false }));
    m.position.set((R + 1.1) * Math.sin(a), 0.85, -(R + 1.1) * Math.cos(a)); m.lookAt(0, 0.85, 0); scene.add(m); ghosts.push(m);
  }

  // ------------------------------------------------------------------ props
  const mono = '"JetBrains Mono", monospace';
  const keyCardDraw = (text, accent) => (ctx, w, h) => {
    ctx.fillStyle = 'rgba(3,14,26,0.94)'; roundRect(ctx, 8, 8, w - 16, h - 16, 26); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 7; ctx.shadowColor = accent; ctx.shadowBlur = 24; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = accent; ctx.font = `700 34px ${mono}`; ctx.textBaseline = 'top'; ctx.fillText('KEY', 34, 26);
    ctx.fillStyle = '#ffffff'; ctx.font = `700 82px ${mono}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.shadowColor = accent; ctx.shadowBlur = 16; ctx.fillText(`"${text}"`, w / 2, h * 0.6);
  };
  const key1 = card(0.66, 0.3, 900, keyCardDraw('user:42', '#22d3ff'), { order: 20 }); scene.add(key1);
  const key2 = card(0.66, 0.3, 900, keyCardDraw('user:97', '#ffb020'), { order: 20 }); scene.add(key2);
  const trailN = 60, trailPos = new Float32Array(trailN * 3);
  const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(0.6, 2.6, 3.2), transparent: true, toneMapped: false }));
  scene.add(trail);

  const C = V(0, 1.3, -1.7); // where the key is hashed
  const A_IN = C.clone().add(V(0, 0, 0.9)), B_OUT = C.clone().add(V(0, 0, -0.3));
  const gate = new THREE.Group(); gate.position.copy(C); scene.add(gate);
  gate.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.016, 12, 96), glow(COLORS.cyan, 1, 3)));
  const gateInner = new THREE.Group(); gate.add(gateInner);
  for (let k = 0; k < 24; k++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.01), glow(0x8ff6ff, 1, 2.4));
    const a = (k / 24) * Math.PI * 2; tick.position.set(Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0); tick.rotation.z = a + Math.PI / 2; gateInner.add(tick);
  }
  const gateLabel = card(0.5, 0.12, 700, (ctx, w, h) => {
    ctx.fillStyle = '#8ff6ff'; ctx.font = `700 54px ${mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#22d3ff'; ctx.shadowBlur = 18; ctx.fillText('hash(key)', w / 2, h / 2);
  }, { order: 21 }); gateLabel.position.set(0, 0.55, 0); gate.add(gateLabel);

  const code = (rows) => (ctx, w, h, s = {}) => {
    ctx.fillStyle = 'rgba(4,10,20,0.92)'; roundRect(ctx, 6, 6, w - 12, h - 12, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(34,211,255,0.85)'; ctx.lineWidth = 4; ctx.shadowColor = '#22d3ff'; ctx.shadowBlur = 16; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff5f7e'; ctx.beginPath(); ctx.arc(34, 30, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffbd2e'; ctx.beginPath(); ctx.arc(58, 30, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#28c840'; ctx.beginPath(); ctx.arc(82, 30, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#6f86a8'; ctx.font = `400 26px ${mono}`; ctx.textBaseline = 'middle'; ctx.fillText(s.file || 'HashMap.java', 108, 31);
    ctx.font = `400 28px ${mono}`;
    rows.forEach((row, i) => {
      const prog = s.progress ? s.progress[i] ?? 1 : 1;
      const y = 82 + i * 44;
      if (s.hl === i) { ctx.fillStyle = 'rgba(34,211,255,0.16)'; ctx.fillRect(16, y - 22, w - 32, 42); }
      let x = 28, left = Math.floor(prog * row.reduce((n, [txt]) => n + txt.length, 0));
      for (const [txt, col] of row) {
        if (left <= 0) break;
        const part_ = txt.slice(0, left); left -= txt.length;
        ctx.fillStyle = col; ctx.fillText(part_, x, y); x += ctx.measureText(part_).width;
      }
    });
  };
  const K = '#ff7ab6', TY = '#7fb2ff', STR = '#ffd479', CM = '#5f7896', TX = '#e6f2ff', NUM = '#7dffcb';
  const hashCode = card(0.92, 0.36, 900, code([
    [['int ', TY], ['h', TX], [' = ', TX], ['"user:42"', STR], ['.hashCode();', TX]],
    [['// h = ', CM], ['-147170163', NUM]],
    [['return ', K], ['h ^ (h >>> 16);', TX], ['  // ', CM], ['-147149897', NUM]],
  ]), { order: 22 });
  scene.add(hashCode);
  const indexCode = card(0.92, 0.28, 900, code([
    [['int ', TY], ['i', TX], [' = (n - 1) & hash;', TX], ['  // n = 16', CM]],
    [['// i = ', CM], ['7', NUM], ['  → tab[7]', CM]],
  ]), { order: 22 });
  scene.add(indexCode);
  const SPREAD = (-147149897) >>> 0;
  const bits = SPREAD.toString(2).padStart(32, '0');
  const strip = card(0.92, 0.3, 900, (ctx, w, h, s = {}) => {
    ctx.fillStyle = 'rgba(4,10,20,0.92)'; roundRect(ctx, 6, 6, w - 12, h - 12, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(34,211,255,0.85)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#6f86a8'; ctx.font = `400 26px ${mono}`; ctx.textBaseline = 'middle'; ctx.fillText('hash in bits', 28, 36);
    ctx.font = `700 30px ${mono}`;
    const groups = bits.match(/.{4}/g);
    let x = 28;
    groups.forEach((g, i) => {
      const last = i === 7;
      if (last && s.hl) {
        ctx.fillStyle = `rgba(34,211,255,${0.25 * s.hl})`; roundRect(ctx, x - 6, 66, ctx.measureText(g).width + 12, 52, 10); ctx.fill();
        ctx.shadowColor = '#22d3ff'; ctx.shadowBlur = 20 * s.hl;
      }
      ctx.fillStyle = last && s.hl ? '#ffffff' : (s.hl ? 'rgba(160,190,220,0.35)' : '#cfe6ff');
      ctx.fillText(g, x, 92); x += ctx.measureText(g).width + 13; ctx.shadowBlur = 0;
    });
    if (s.result) {
      ctx.globalAlpha = s.result; ctx.font = `700 30px ${mono}`; ctx.fillStyle = '#7dffcb'; ctx.textAlign = 'right';
      ctx.fillText('0111 = bucket 7', w - 30, 36); ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }
  }, { order: 22 });
  scene.add(strip);

  // chain nodes (HashMap.Node: hash, key, value, next) that later rise into a tree
  const nodeData = [['user:42', 'alice'], ['user:97', 'bob'], ['user:20', 'cara'], ['user:31', 'dev'],
                    ['user:53', 'eli'], ['user:64', 'fay'], ['user:75', 'gus'], ['user:86', 'hana']];
  const nodes = nodeData.map(([k, v], i) => card(0.84, 0.3, 800, (ctx, w, h, s = {}) => {
    const col = s.ok ? '#3dffa8' : s.red ? '#ff3b5c' : i === 0 ? '#22d3ff' : i === 1 ? '#ffb020' : '#7fb2ff';
    ctx.fillStyle = 'rgba(4,10,20,0.94)'; roundRect(ctx, 6, 6, w - 12, h - 12, 18); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.shadowColor = col; ctx.shadowBlur = 18; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.font = `400 22px ${mono}`; ctx.fillStyle = '#6f86a8'; ctx.textBaseline = 'top';
    const cols = [[22, 'hash'], [250, 'key'], [480, 'value'], [600, 'next']];
    cols.forEach(([x, label]) => ctx.fillText(label, x, 20));
    ctx.font = `700 34px ${mono}`; ctx.textBaseline = 'middle';
    ctx.fillStyle = NUM; ctx.fillText(i < 2 ? (i === 0 ? '-1471…897' : '-1471……') : '…0111', 22, 132);
    ctx.fillStyle = s.ok ? '#3dffa8' : STR; ctx.fillText(`"${k}"`, 250, 132);
    ctx.fillStyle = TX; ctx.fillText(v, 480, 132);
    ctx.fillStyle = '#8ff6ff'; ctx.fillText(s.last ? 'null' : '→', 620, 132);
    if (s.ok) { ctx.fillStyle = '#3dffa8'; ctx.font = `700 40px ${mono}`; ctx.fillText('✓ equals', w - 230, 50); }
  }, { order: 23 }));
  nodes.forEach((n) => scene.add(n));
  const links = nodes.slice(1).map(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 8), glow(0x8ff6ff, 1, 1.8)); scene.add(m); return m;
  });
  const equalsCode = card(0.92, 0.28, 900, code([
    [['if ', K], ['(e.hash == hash &&', TX]],
    [['    key.', TX], ['equals', TY], ['(e.key))  ', TX], ['return ', K], ['e;', TX]],
  ]), { order: 22 });
  scene.add(equalsCode);
  const redX = [0, 1, 2].map(() => {
    const c = card(0.36, 0.36, 400, (ctx, w, h) => {
      ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 34; ctx.lineCap = 'round'; ctx.shadowColor = '#ff3b5c'; ctx.shadowBlur = 30;
      ctx.beginPath(); ctx.moveTo(w * 0.22, h * 0.22); ctx.lineTo(w * 0.78, h * 0.78); ctx.moveTo(w * 0.78, h * 0.22); ctx.lineTo(w * 0.22, h * 0.78); ctx.stroke();
    }, { order: 24 });
    scene.add(c); return c;
  });

  // ------------------------------------------------------------------ characters
  const eng = makeEngineer(emblem), nova = makeNova(emblem);
  scene.add(eng.root, nova.root);
  const ENG = V(0.35, 0, 1.0), NOVA_HOME = V(-0.42, 1.02, 0.92);
  const WALK = [ev.open2 - 0.2, L.e1.start + 1.9], WALK_FROM = V(0.95, 0, -2.3);
  const engWalkPos = (t) => WALK_FROM.clone().lerp(ENG, smoother(span(t, WALK[0], WALK[1])));

  // ------------------------------------------------------------------ HUD
  const hud = document.getElementById('hud');
  hud.innerHTML = `
    <div class="vignette"></div>
    <div class="bar"><div class="title"><span>HASHMAP</span><small>EP 007 · PART 1</small></div><div class="steps"></div></div>
    <div class="cap"><div class="who"></div><div class="line"></div></div>
    <div class="big" style="top:330px"></div>
    <div class="end"><div class="kicker">PART 2</div><div class="head">When a bucket<br>becomes a tree</div><div class="follow">Follow for part 2</div></div>
    <div class="flash"></div>`;
  const $ = (s) => hud.querySelector(s);
  const STEPS = [['SEARCH?', 0.55, ev.vision], ['HASH', ev.vision, L.e4.start], ['BUCKET', L.e4.start, ev.drop],
                 ['COLLISION', ev.drop, L.e7.start], ['TREE', L.e7.start, ev.end]];
  $('.steps').innerHTML = STEPS.map(([n]) => `<div class="step"><i><b></b></i>${n}</div>`).join('');
  const stepEls = [...hud.querySelectorAll('.step')];
  let capKey = '', bigKey = '';

  function hudAt(t) {
    const barOn = window_(t, 0.3, ev.end + 0.2, 0.4);
    $('.bar').style.opacity = barOn;
    STEPS.forEach(([, a, b], i) => {
      const k = span(t, a, b);
      stepEls[i].querySelector('b').style.width = `${(k * 100).toFixed(1)}%`;
      stepEls[i].classList.toggle('on', t >= a);
    });
    // captions: the current line, word by word
    const line = lines.find((l) => t >= l.start - 0.08 && t <= l.end + 0.3);
    const cap = $('.cap');
    if (!line || t > ev.end) { cap.style.opacity = 0; } else {
      cap.style.opacity = 1;
      const key = line.id + '|' + line.words.map((w) => (t >= w.e ? 2 : t >= w.s ? 1 : 0)).join('');
      if (key !== capKey) {
        capKey = key;
        $('.who').className = `who ${line.who}`;
        $('.who').textContent = line.who === 'nova' ? 'NOVA' : 'ENGINEER';
        $('.line').innerHTML = line.words.map((w) => `<span class="${t >= w.e ? 'said' : t >= w.s ? 'now' : ''}">${w.w}</span>`).join(' ');
      }
    }
    // big words
    const bigs = [['ONE JUMP', ev.jump - 0.1, ev.jump + 1.3, ''], ['O(1)', ev.o1 - 0.1, L.e5.end, ''],
                  ['COLLISION', ev.drop + 0.45, ev.drop + 2.2, 'red'], ['8 KEYS', ev.eight - 0.1, ev.eight + 1.4, 'red']];
    const big = bigs.find(([, a, b]) => t >= a && t <= b);
    const bigEl = $('.big');
    if (big) {
      const [txt, a, b, cls] = big;
      if (bigKey !== txt) { bigKey = txt; bigEl.textContent = txt; bigEl.className = `big ${cls}`; }
      const k = span(t, a, a + 0.25);
      bigEl.style.opacity = Math.min(k, 1 - span(t, b - 0.25, b));
      bigEl.style.transform = `scale(${lerp(1.5, 1, backOut(k)).toFixed(3)})`;
    } else { bigEl.style.opacity = 0; }
    $('.flash').style.opacity = Math.max(window_(t, ev.vision - 0.08, ev.vision + 0.5, 0.1) * 0.9, window_(t, ev.jump - 0.05, ev.jump + 0.25, 0.08) * 0.5,
      window_(t, ev.part2, ev.part2 + 0.35, 0.08) * 0.6);
    const end = span(t, ev.end, ev.end + 0.6);
    $('.end').style.opacity = end;
    $('.end').style.transform = `translateY(${lerp(40, 0, easeOut(end)).toFixed(1)}px)`;
  }

  // ------------------------------------------------------------------ timing helpers
  const blinkAt = (t, seed) => { const p = (t + seed) % 3.7; return p < 0.13 ? Math.sin((p / 0.13) * Math.PI) : 0; };
  const mouthOf = (who, t) => {
    const l = lines.find((x) => x.who === who && t >= x.start && t <= x.end);
    if (!l) return 0;
    return l.env[Math.min(l.env.length - 1, Math.floor((t - l.start) * 30))] || 0;
  };
  const talking = (who, t) => lines.some((x) => x.who === who && t >= x.start && t <= x.end);
  const sys = (t) => smooth(span(t, ev.vision, ev.vision + 1.1));

  // camera shots: [start, end, (k, t) => {pos, look, fov}]
  const hand = (t, s) => V(wobble(t * 0.7, s) * 0.012, wobble(t * 0.6, s + 3) * 0.01, 0);
  const shots = [
    [0, 2.3, (k) => ({ pos: vlerp([0.2, 3.4, 6.2], [-1.4, 1.9, 2.4], smoother(k)), look: vlerp([0, 1.0, -2.2], [-2.8, 1.0, -1.2], smoother(k)), fov: 44 })],
    [2.3, 5.2, (k, t) => { const n = novaPos(t); const f = lockers[1].front; const side = V(f.z, 0, -f.x);
      return { pos: n.clone().addScaledVector(f, 0.45).addScaledVector(side, 1.9).add(V(0, 0.15, 0)), look: n.clone().addScaledVector(f, -0.22).addScaledVector(side, 0.08).add(V(0, -0.1, 0)), fov: 40 }; }],
    [5.2, 8.55, (k, t) => { const w = engWalkPos(t);
      return { pos: vlerp([0.75, 0.3, 3.7], [0.62, 0.42, 3.1], smooth(k)), look: [w.x * 0.8, 0.82, w.z], fov: 34 }; }],
    [8.55, 11.3, (k) => ({ pos: vlerp([-0.02, 1.0, 4.7], [-0.03, 0.96, 4.35], smooth(k)), look: [-0.03, 0.82, 0.95], fov: 34 })],
    [11.3, ev.vision, (k) => ({ pos: vlerp([0.5, 1.02, 2.45], [0.44, 1.0, 2.15], smooth(k)), look: [0.33, 0.9, 1.0], fov: 34 })],
    [ev.vision, L.e3.start + 0.2, (k) => ({ pos: vlerp([0.4, 1.0, 1.75], [-0.6, 2.4, 4.4], easeOut(k)), look: vlerp([0.35, 0.97, 1.0], [0, 1.0, -0.8], easeOut(k)), fov: lerp(34, 46, easeOut(k)) })],
    [L.e3.start + 0.2, L.e4.start + 0.1, (k) => { const a = lerp(deg(28), deg(-12), smooth(k));
      return { pos: [C.x + Math.sin(a) * 2.7, 1.45, C.z + Math.cos(a) * 2.7], look: [C.x, C.y + 0.26, C.z], fov: 40 }; }],
    [L.e4.start + 0.1, ev.seven - 0.95, (k) => ({ pos: vlerp([0.12, 1.45, C.z + 2.75], [0.05, 1.5, C.z + 2.4], smooth(k)), look: vlerp([0, 1.56, C.z], [0, 1.62, C.z], smooth(k)), fov: 40 })],
    [ev.seven - 0.95, ev.jump + 0.45, (k, t) => { const p = keyFlight(t); const ahead = keyFlight(t + 0.25);
      const back = p.clone().sub(ahead).normalize();
      return { pos: p.clone().addScaledVector(back, 2.0).add(V(0.2, 0.45, 0)), look: ahead.clone().lerp(P(7, 0.2, 1.0), 0.4), fov: 44 }; }],
    [ev.jump + 0.45, L.e5.start, (k, t) => { const n = novaPos(t);
      return { pos: n.clone().add(V(0.9, 0.12, 1.65 - k * 0.2)), look: n.clone().lerp(P(7, 0.2, 1.3), 0.15), fov: 38 }; }],
    [L.e5.start, ev.drop, (k) => ({ pos: vlerp([0.85, 0.98, 2.95], [0.7, 0.95, 2.65], smooth(k)), look: [0.3, 0.85, 1.0], fov: 34 })],
    [ev.drop, ev.drop + 2.1, (k) => ({ pos: vlerp([0.0, 1.55, -1.0], [0.0, 1.45, -1.6], smooth(k)), look: P(7, 0.2, 1.25).toArray(), fov: 42 })],
    [ev.drop + 2.1, L.e6.start, (k, t) => { const n = novaPos(t);
      return { pos: n.clone().add(V(0.3, 0.1, 1.35 - k * 0.15)), look: n.clone().add(V(0, -0.05, 0)), fov: 36 }; }],
    [L.e6.start, L.n5.start, (k) => { const f = lockers[7].front;
      const base = P(7, 3.1, 2.3); return { pos: base.clone().addScaledVector(f, lerp(0.6, 0, smooth(k))).add(V(0.25, 0, 0)), look: P(7, 0.6, 2.22).toArray(), fov: 40 }; }],
    [L.n5.start, L.e7.start + 0.4, (k) => { const f = lockers[7].front;
      return { pos: P(7, lerp(3.1, 4.9, smooth(k)), lerp(2.3, 1.6, k)).add(V(0.25, 0, 0)), look: P(7, 0.6, lerp(2.22, 1.3, smooth(k))).toArray(), fov: 42 }; }],
    [L.e7.start + 0.4, ev.end, (k) => { const c = P(7, 0.6, 1.85); const a = lerp(deg(-18), deg(14), smooth(k)); const f = lockers[7].front;
      const side = V(f.z, 0, -f.x); return { pos: c.clone().addScaledVector(f, 4.1 * Math.cos(a)).addScaledVector(side, 4.1 * Math.sin(a)).add(V(0, 0.35, 0)), look: c.toArray(), fov: 40 }; }],
    [ev.end, 999, (k) => ({ pos: vlerp([0.03, 1.05, 5.3], [0.03, 1.0, 4.95], smooth(k)), look: [0.03, 0.62, 0.95], fov: 36 })],
  ];

  // ------------------------------------------------------------------ choreography
  function novaPos(t) {
    const home = NOVA_HOME.clone();
    const L0 = P(0, 0.95, 1.25), L1 = P(1, 0.95, 1.25), L2 = P(2, 0.95, 1.25);
    if (t < 2.75) return V(1.1, 2.3, 1.8).lerp(L0, smoother(span(t, 0.2, 2.75)));
    if (t < ev.open1 - 0.2) return L0.clone().lerp(L1, smoother(span(t, ev.open0 + 0.4, ev.open1 - 0.2)));
    if (t < ev.open2 - 0.2) return L1.clone().lerp(L2, smoother(span(t, ev.open1 + 0.35, ev.open2 - 0.2)));
    if (t < L.n2.start) return L2.clone().lerp(home, smoother(span(t, L.e1.start + 0.6, L.n2.start - 0.1)));
    if (t < ev.seven - 0.7) return home;
    const near7 = P(7, 0.95, 1.45).add(V(-0.55, 0, 0));
    if (t < L.e5.start + 0.3) return home.clone().lerp(near7, smoother(span(t, ev.seven - 0.6, ev.jump + 0.2)));
    if (t < ev.drop + 0.4) return near7.clone().lerp(home, smoother(span(t, L.e5.start + 0.3, L.e5.start + 1.6)));
    const scared = V(-0.25, 1.12, 1.55);
    if (t < L.e6.start) return home.clone().lerp(scared, smoother(span(t, ev.drop + 0.4, ev.drop + 1.0)))
      .add(V(Math.sin(t * 41) * 0.012 * window_(t, L.n4.start, L.n4.end), 0, 0));
    const peek = P(7, 1.05, 1.95).add(V(-0.62, 0, 0));
    if (t < ev.end) return scared.clone().lerp(peek, smoother(span(t, L.e6.start, L.e6.start + 1.3)));
    return peek.clone().lerp(V(-0.3, 0.98, 1.15), smoother(span(t, ev.end, ev.end + 0.9)));
  }

  const flightCurve = new THREE.CatmullRomCurve3([B_OUT.clone(), V(0.65, 2.05, -2.5), V(0.35, 1.65, -3.4), P(7, 0.36, 1.0)]);
  function keyFlight(t) { return flightCurve.getPoint(smoother(span(t, ev.seven - 0.9, ev.jump - 0.05))); }

  function poseEngineer(t) {
    const vis = t > WALK[0] - 0.05;
    eng.root.visible = vis;
    if (!vis) return;
    const walkK = span(t, WALK[0], WALK[1]);
    const from = WALK_FROM;
    const pos = engWalkPos(t);
    const walking = walkK > 0 && walkK < 1;
    let yaw = walking ? Math.atan2(ENG.x - from.x, ENG.z - from.z) : -0.25;
    const face = (target, k) => { yaw = lerp(yaw, target, smooth(k)); };
    face(Math.PI * 0.94, span(t, L.e3.start - 0.5, L.e3.start + 0.2));
    face(-0.3, span(t, ev.jump + 0.5, ev.jump + 1.0));
    face(Math.PI * 0.97, span(t, ev.drop, ev.drop + 0.3));
    face(-0.85, span(t, ev.drop + 2.1, ev.drop + 2.4));
    face(Math.PI * 0.95, span(t, L.e6.start - 0.2, L.e6.start + 0.3));
    face(0.1, span(t, ev.end - 0.1, ev.end + 0.5));
    let expr = 'calm';
    if (t < L.n2.start) expr = 'focus'; else if (t < L.e2.start) expr = 'smirk'; else if (t < ev.vision - 0.6) expr = 'smirk';
    else if (t < L.e3.start) expr = 'focus'; else if (t < L.n3.start) expr = 'calm'; else if (t < ev.drop) expr = 'smile';
    else if (t < ev.drop + 1.2) expr = 'surprised'; else if (t < L.e6.start) expr = 'smirk'; else if (t < L.e7.start) expr = 'calm';
    else if (t < ev.end) expr = 'smirk'; else expr = 'smile';
    const armR = window_(t, ev.vision - 0.9, ev.vision + 0.5, 0.35) > 0.5 ? { reach: [-0.11, 0.57, 0.3], pole: [-0.6, -0.6, -0.4] }
      : window_(t, ev.seven - 1.0, ev.jump + 0.4, 0.3) > 0.5 ? { reach: [-0.12, 0.5, 0.42] }
      : window_(t, L.e6.start + 0.3, L.e6.end, 0.3) > 0.5 ? { reach: [-0.1, 0.45, 0.42] }
      : t > ev.end + 0.4 ? { reach: [-0.16, 0.42, 0.24], pole: [-0.5, -1, -0.2] } : null;
    const armL = window_(t, L.e3.start - 0.3, L.e3.start + 1.2, 0.3) > 0.5 ? { reach: [0.2, 0.26, 0.28] }
      : window_(t, ev.o1 - 1.0, L.e5.end, 0.3) > 0.5 ? { reach: [0.3, 0.26, 0.22] } : null;
    eng.pose({
      t, pos: pos.toArray(), yaw, walk: walking ? 1 : 0, walkPhase: walkK * 13,
      expr, blink: blinkAt(t, 0.4), mouth: mouthOf('engineer', t) * 0.9, look: [talking('engineer', t) ? 0.1 : 0.35, 0],
      armR, armL, glasses: Math.max(span(t, ev.vision - 0.4, ev.vision) * (1 - span(t, ev.vision + 0.4, ev.vision + 1.6)), sys(t) * 0.18),
      headTilt: talking('engineer', t) ? Math.sin(t * 2.3) * 0.05 : 0, headPitch: talking('engineer', t) ? Math.sin(t * 3.1) * 0.03 : 0,
    });
  }

  function poseNova(t) {
    const p = novaPos(t);
    let expr = 'normal';
    const opened = [ev.open0, ev.open1, ev.open2].some((o) => t > o + 0.25 && t < o + 0.9);
    if (t < L.e1.start) expr = opened ? 'confused' : 'normal';
    else if (t < L.n2.start) expr = 'surprised'; else if (t < L.e2.start) expr = 'confused';
    else if (t < ev.vision - 0.2) expr = 'normal'; else if (t < ev.vision + 1.2) expr = 'surprised';
    else if (t < ev.jump) expr = 'normal'; else if (t < L.e5.start) expr = 'sparkle'; else if (t < ev.drop) expr = 'happy';
    else if (t < ev.drop + 0.9) expr = 'surprised'; else if (t < L.e6.start) expr = 'panic'; else if (t < L.n5.start) expr = 'squint';
    else if (t < ev.part2) expr = 'surprised'; else if (t < ev.end) expr = 'sparkle'; else expr = 'happy';
    const mouth = mouthOf('nova', t);
    let yaw = 0.3;
    if (t < L.e1.start) yaw = Math.atan2(-lockers[1].front.x, -lockers[1].front.z) * 0.9;
    else if (t < ev.vision) yaw = Math.atan2(ENG.x - p.x, ENG.z - p.z) * 0.8;
    else if (t < ev.jump) yaw = Math.PI * 0.9;
    else if (t < L.e5.start + 0.3) yaw = 0.6;
    else if (t < ev.drop) yaw = Math.PI * 0.9;
    else if (t < L.e6.start) yaw = -0.2;
    else if (t < ev.end) yaw = Math.PI * 0.85;
    else yaw = 0.25;
    const waving = t > ev.end + 0.5;
    nova.pose({
      t, pos: p.toArray(), yaw, expr, mouth, bounce: mouth, blink: expr === 'normal' ? blinkAt(t, 1.7) : 0,
      look: [Math.sin(t * 0.9) * 0.3, 0], tilt: expr === 'confused' ? 0.25 : 0, hop: expr === 'sparkle' ? Math.abs(Math.sin(t * 9)) * 0.05 : 0,
      armL: waving ? { x: -0.3, z: 2.4 + Math.sin(t * 10) * 0.35 } : expr === 'panic' ? { x: -0.4, z: 2.6 + Math.sin(t * 25) * 0.3 } : null,
      armR: expr === 'panic' ? { x: -0.4, z: -2.6 - Math.sin(t * 23) * 0.3 } : null,
    });
  }

  function poseWorld(t, camPos) {
    const s = sys(t);
    // lockers: dark metal before System Vision, see-through with glowing edges after
    lockers.forEach((lk, i) => {
      let open = 0;
      if (i < 3) { const o = [ev.open0, ev.open1, ev.open2][i]; open = easeOut(span(t, o - 0.12, o + 0.25)) * (1 - smooth(span(t, ev.vision, ev.vision + 0.8))); }
      if (i === 7) open = Math.max(open, easeOut(span(t, ev.jump - 0.5, ev.jump - 0.15)));
      lk.pivot.rotation.y = -1.85 * open;
      lk.bodyMat.opacity = lerp(1, 0.38, s); lk.doorMat.opacity = lerp(1, 0.4, s);
      const lit = i === 7 && t > ev.jump - 0.2 ? 1 : 0;
      lk.insideMat.color.setRGB(0.02 + lit * 0.03, 0.1 + lit * 0.18, 0.15 + lit * 0.25).multiplyScalar(lerp(1, 0.35, s * (1 - lit)));
      lk.edgeMat.opacity = s;
      const hot = i === 7 && t > ev.jump - 0.2 && t < ev.drop + 0.2;
      const red = i === 7 && t > ev.drop + 0.45;
      const key = (hot ? 'h' : '') + (red ? 'r' : '');
      if (key !== lk.plateKey) { lk.plate.userData.tex.redraw({ hot, red }); lk.plateKey = key; }
      lk.alarm.visible = red && t < L.e6.start && Math.floor(t * 4) % 2 === 0;
      lk.g.position.copy(lk.pos);
      if (i === 7) lk.g.position.x += Math.sin(t * 60) * 0.02 * window_(t, ev.drop + 0.45, ev.drop + 0.9, 0.05);
    });
    grid.material.opacity = 0.35 + 0.5 * s;
    grid.material.color.setScalar(1 + 1.4 * s);
    ringMat.opacity = 0.5 + 0.4 * s;
    const sk = span(t, ev.vision, ev.vision + 1.4);
    scan.visible = sk > 0 && sk < 1; scan.scale.setScalar(0.2 + sk * 14); scan.material.opacity = 1 - sk;
    pMat.opacity = 0.18 + 0.55 * s;
    for (let i = 0; i < PN; i++) {
      const y = (pBase[i * 3 + 1] + t * (0.18 + (i % 7) * 0.03)) % 6;
      pPos.set([pBase[i * 3], y, pBase[i * 3 + 2]], i * 3);
    }
    pGeo.attributes.position.needsUpdate = true;
    scene.fog.color.setRGB(lerp(0.016, 0.01, s), lerp(0.027, 0.05, s), lerp(0.075, 0.12, s));
    scene.background = scene.fog.color;
    bloom.strength = lerp(0.6, 0.78, s);
    ghosts.forEach((gh, i) => { gh.material.opacity = window_(t, said('e7', 'grows') - 0.1 + i * 0.03, said('e7', 'tree') - 0.4, 0.2) * 0.8; });

    // red X on the empty lockers Nova opened
    redX.forEach((x, i) => {
      const o = [ev.open0, ev.open1, ev.open2][i];
      const k = window_(t, o + 0.2, o + 1.0, 0.12);
      x.visible = k > 0; x.position.copy(P(i, 0.3, 1.3)); x.scale.setScalar(lerp(0.6, 1, backOut(span(t, o + 0.2, o + 0.4))));
      x.material.opacity = k;
    });

    // key 1: appears in his hand, is hashed, flies to bucket 7
    const k1On = t > L.e3.start - 0.3 && t < L.e6.start + 0.2;
    key1.visible = k1On;
    if (k1On) {
      const handAt = eng.handPoint('L');
      let pos;
      if (t < L.e3.start + 1.2) pos = handAt.clone().add(V(0, 0.18, 0)).lerp(A_IN, smoother(span(t, L.e3.start + 0.2, L.e3.start + 1.2)));
      else if (t < ev.hash + 0.1) pos = A_IN.clone().lerp(B_OUT, smoother(span(t, ev.hash - 0.9, ev.hash + 0.1)));
      else if (t < ev.seven - 0.9) pos = B_OUT.clone().add(V(0, Math.sin(t * 2) * 0.02, 0));
      else pos = keyFlight(t);
      if (t > ev.jump - 0.05) pos = P(7, lerp(0.36, -0.05, smooth(span(t, ev.jump - 0.05, ev.jump + 0.35))), 1.0);
      key1.position.copy(pos);
      key1.scale.setScalar(t > ev.jump ? lerp(1, 0.7, smooth(span(t, ev.jump, ev.jump + 0.3))) : 1);
      key1.material.opacity = 1 - span(t, ev.jump + 1.0, ev.jump + 1.4);
    }
    gate.visible = t > ev.vision + 0.6 && t < ev.seven;
    const gs = easeOut(span(t, ev.vision + 0.6, L.e3.start + 0.6)) * (1 - span(t, ev.seven - 1.0, ev.seven - 0.6));
    gate.scale.setScalar(Math.max(0.001, gs));
    gateInner.rotation.z = t * (t > ev.hash - 0.4 && t < ev.mix + 1 ? 4.5 : 0.8);
    gate.lookAt(camPos);
    // code panels
    hashCode.visible = t > ev.hash - 0.3 && t < ev.bits;
    hashCode.position.copy(C).add(V(0, 0.68, 0.05));
    hashCode.userData.tex.redraw({ progress: [span(t, ev.hash - 0.2, ev.hash + 0.7), span(t, ev.hash + 0.6, ev.hash + 0.9), span(t, ev.mix - 0.1, ev.mix + 0.9)], hl: t > ev.mix ? 2 : t > ev.hash ? 0 : -1 });
    hashCode.material.opacity = window_(t, ev.hash - 0.3, ev.bits, 0.25);
    const bucketAt = said('e4', 'bucket');
    strip.visible = t > ev.bits - 0.15 && t < bucketAt + 0.35;
    strip.position.copy(C).add(V(0, 0.66, 0.06));
    const hl = smooth(span(t, said('e4', 'zero') - 0.2, said('e4', 'zero') + 0.3));
    strip.userData.tex.redraw({ hl, result: smooth(span(t, said('e4', 'bucket') - 0.1, said('e4', 'bucket') + 0.3)) });
    strip.material.opacity = window_(t, ev.bits - 0.15, bucketAt + 0.35, 0.2);
    indexCode.visible = t > bucketAt + 0.15 && t < ev.seven - 0.6;
    indexCode.position.copy(C).add(V(0, 0.64, 0.06));
    indexCode.material.opacity = window_(t, bucketAt + 0.15, ev.seven - 0.6, 0.2);


    // trail behind the flying key
    trail.visible = t > ev.seven - 0.9 && t < ev.jump + 0.8;
    if (trail.visible) {
      const head = span(t, ev.seven - 0.9, ev.jump - 0.05);
      for (let i = 0; i < trailN; i++) {
        const u = smoother(clamp(head - (1 - i / (trailN - 1)) * 0.45)) ;
        flightCurve.getPoint(u, V()).toArray(trailPos, i * 3);
      }
      trailGeo.attributes.position.needsUpdate = true;
      trail.material.opacity = 1 - span(t, ev.jump, ev.jump + 0.8);
    }

    // key 2 drops into bucket 7
    key2.visible = t > ev.drop && t < L.e6.start + 0.2;
    if (key2.visible) {
      const k = easeIn(span(t, ev.drop, ev.drop + 0.45));
      key2.position.copy(P(7, 0.3, lerp(3.4, 1.0, k))).add(V(0, Math.max(0, Math.sin(span(t, ev.drop + 0.45, ev.drop + 0.8) * Math.PI)) * 0.12, 0));
      key2.rotation.z = (1 - k) * 0.6;
      key2.material.opacity = 1 - span(t, L.e6.start - 0.3, L.e6.start + 0.2);
    }

    // the chain, then the tree
    const f7 = lockers[7].front, side = V(f7.z, 0, -f7.x);
    const chainAt = (i) => P(7, 0.62, 2.3 - i * 0.31);
    const treeSlots = [[0, 2.5], [-0.62, 2.05], [0.62, 2.05], [-0.93, 1.6], [-0.31, 1.6], [0.31, 1.6], [0.93, 1.6], [-1.08, 1.15]];
    const treeAt = (i) => P(7, 0.62, treeSlots[i][1]).addScaledVector(side, treeSlots[i][0]);
    const morph = smoother(span(t, said('e7', 'tree') - 0.7, said('e7', 'tree') + 0.6));
    nodes.forEach((n, i) => {
      const appear = i < 2 ? span(t, said('e6', 'chain') - 0.5 + i * 0.35, said('e6', 'chain') + i * 0.35)
        : span(t, ev.eight - 1.25 + (i - 2) * 0.2, ev.eight - 1.05 + (i - 2) * 0.2);
      n.visible = appear > 0 && t < ev.end + 0.3;
      if (!n.visible) return;
      const pos = chainAt(i).lerp(treeAt(i), morph);
      const rise = 1 - easeOut(appear);
      n.position.copy(pos).addScaledVector(f7, -rise * 0.6).add(V(0, -rise * 0.3, 0));
      n.scale.setScalar(lerp(1, 0.62, morph) * lerp(0.5, 1, easeOut(appear)));
      n.material.opacity = appear * (1 - span(t, ev.end, ev.end + 0.3));
      const ok = i === 1 && t > ev.equals - 0.1 && t < L.n5.start;
      const red = t > ev.eight - 0.2 && t < said('e7', 'tree') - 0.7;
      const last = i === (t > ev.eight - 1.3 ? 7 : 1);
      const key = `${ok}|${red}|${last}`;
      if (n.userData.key !== key) { n.userData.key = key; n.userData.tex.redraw({ ok, red, last }); }
    });
    links.forEach((m, j) => {
      const a = nodes[j], b = nodes[j + 1];
      const parent = morph > 0.5 ? nodes[[0, 0, 0, 1, 1, 2, 2, 3][j + 1]] : a;
      m.visible = a.visible && b.visible;
      if (!m.visible) return;
      const from = parent.position.clone().add(V(0, -0.15 * parent.scale.y, 0)), to = b.position.clone().add(V(0, 0.15 * b.scale.y, 0));
      const mid = from.clone().lerp(to, 0.5), len = from.distanceTo(to);
      m.position.copy(mid); m.scale.set(1, Math.max(0.001, len), 1);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), to.sub(from).normalize());
    });
    equalsCode.visible = t > ev.equals - 0.4 && t < L.n5.start + 0.2;
    equalsCode.position.copy(P(7, 0.95, 2.74));
    equalsCode.material.opacity = window_(t, ev.equals - 0.4, L.n5.start + 0.2, 0.2);
    equalsCode.userData.tex.redraw({ progress: [span(t, ev.equals - 0.4, ev.equals + 0.1), span(t, ev.equals, ev.equals + 0.6)], file: 'HashMap.getNode' });
  }

  // ------------------------------------------------------------------ the frame
  return (t) => {
    const shot = shots.find(([a, b]) => t >= a && t < b) || shots[shots.length - 1];
    const k = span(t, shot[0], Math.min(shot[1], data.duration));
    poseNova(t);
    poseEngineer(t);
    scene.updateMatrixWorld(true);
    const c = shot[2](k, t);
    const pos = (Array.isArray(c.pos) ? V(...c.pos) : c.pos).add(hand(t, 1));
    const look = Array.isArray(c.look) ? V(...c.look) : c.look;
    // a short shake when the second key lands
    const shake = window_(t, ev.drop + 0.45, ev.drop + 0.85, 0.05) * 0.03;
    pos.add(V(Math.sin(t * 73) * shake, Math.sin(t * 61) * shake, 0));
    camera.position.copy(pos); camera.fov = c.fov || 40; camera.updateProjectionMatrix();
    camera.lookAt(look);
    poseWorld(t, camera.position);
    scene.traverse((o) => { if (o.userData && o.userData.billboard) o.quaternion.copy(camera.quaternion); });
    for (const m of [key1, key2, hashCode, indexCode, strip, equalsCode, ...nodes, ...redX]) m.quaternion.copy(camera.quaternion);
    hudAt(t);
  };
}

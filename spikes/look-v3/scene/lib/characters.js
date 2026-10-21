// The engineer and Nova, built from simple solids with cel shading and ink outlines, faces drawn
// on canvases so they can blink, talk and change expression on any frame.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COLORS, toon, toonSoft, glow, part, ink, canvasTex, rng, clamp, lerp } from './kit.js';

const UP = new THREE.Vector3(0, 1, 0);
function orient(mesh, dir) { mesh.quaternion.setFromUnitVectors(UP, dir.clone().normalize()); }

// ---------------------------------------------------------------- the engineer's face drawing

function almond(ctx, cx, cy, w, h) {
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy + h * 0.05);
  ctx.bezierCurveTo(cx - w * 0.38, cy - h * 0.62, cx + w * 0.30, cy - h * 0.66, cx + w / 2, cy - h * 0.12);
  ctx.bezierCurveTo(cx + w * 0.42, cy + h * 0.55, cx - w * 0.30, cy + h * 0.60, cx - w / 2, cy + h * 0.05);
  ctx.closePath();
}

function drawEye(ctx, cx, cy, w, h, open, mirror, look, expr) {
  ctx.save();
  ctx.translate(cx, cy);
  if (mirror) ctx.scale(-1, 1);
  const happy = expr === 'smile';
  const narrow = expr === 'focus' ? 0.72 : expr === 'surprised' ? 1.15 : 1;
  const o = clamp(open) * narrow;
  if (o < 0.18 || happy) {
    ctx.strokeStyle = '#1a0f12'; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath();
    if (happy) { ctx.moveTo(-w / 2, h * 0.08); ctx.quadraticCurveTo(0, -h * 0.42, w / 2, h * 0.02); }
    else { ctx.moveTo(-w / 2, 0); ctx.quadraticCurveTo(0, h * 0.22, w / 2, -h * 0.04); }
    ctx.stroke();
    ctx.restore();
    return;
  }
  const eh = h * o;
  almond(ctx, 0, 0, w, eh);
  ctx.fillStyle = '#fbfbff'; ctx.fill();
  ctx.save(); ctx.clip();
  const ix = (mirror ? -look[0] : look[0]) * w * 0.14, iy = look[1] * eh * 0.12 + eh * 0.04;
  const g = ctx.createLinearGradient(0, iy - eh * 0.5, 0, iy + eh * 0.5);
  g.addColorStop(0, '#24130e'); g.addColorStop(0.55, '#6b3a22'); g.addColorStop(1, '#c47a3f');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(ix, iy, w * 0.28, eh * 0.54, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0d0607';
  ctx.beginPath(); ctx.ellipse(ix, iy + eh * 0.03, w * 0.12, eh * 0.26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.ellipse(ix - w * 0.1, iy - eh * 0.2, w * 0.08, eh * 0.12, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(ix + w * 0.1, iy + eh * 0.2, w * 0.035, eh * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#140a0c'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(-w / 2 - 2, eh * 0.06);
  ctx.bezierCurveTo(-w * 0.38, -eh * 0.62, w * 0.30, -eh * 0.68, w / 2 + 6, -eh * 0.16);
  ctx.lineTo(w / 2 + 18, -eh * 0.32);
  ctx.stroke();
  ctx.lineWidth = 4; ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.moveTo(-w * 0.32, eh * 0.42); ctx.quadraticCurveTo(0, eh * 0.62, w * 0.36, eh * 0.38); ctx.stroke();
  ctx.restore();
}

function drawEngineerFace(ctx, W, H, s) {
  const expr = s.expr || 'calm';
  const open = 1 - clamp(s.blink || 0);
  const look = s.look || [0, 0];
  const ew = W * 0.24, eh = H * 0.27;
  ctx.fillStyle = 'rgba(255,110,110,0.2)';
  ctx.beginPath(); ctx.ellipse(W * 0.25, H * 0.7, W * 0.07, H * 0.028, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(W * 0.75, H * 0.7, W * 0.07, H * 0.028, 0, 0, Math.PI * 2); ctx.fill();
  drawEye(ctx, W * 0.31, H * EYE_V, ew, eh, open, false, look, expr);
  drawEye(ctx, W * 0.69, H * EYE_V, ew, eh, open, true, look, expr);
  const lift = expr === 'surprised' ? -18 : expr === 'focus' ? 10 : 0;
  const tiltIn = expr === 'focus' ? 12 : expr === 'smirk' ? -4 : 2;
  ctx.strokeStyle = '#17121a'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(W * 0.19, H * 0.3 + lift); ctx.quadraticCurveTo(W * 0.29, H * 0.26 + lift, W * 0.4, H * 0.29 + lift + tiltIn); ctx.stroke();
  const rLift = expr === 'smirk' ? lift - 14 : lift;
  ctx.beginPath(); ctx.moveTo(W * 0.81, H * 0.3 + rLift); ctx.quadraticCurveTo(W * 0.71, H * 0.26 + rLift, W * 0.6, H * 0.29 + rLift + tiltIn); ctx.stroke();
  ctx.strokeStyle = 'rgba(160,90,80,0.55)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(W * 0.505, H * 0.69); ctx.lineTo(W * 0.492, H * 0.72); ctx.stroke();
  const m = clamp(s.mouth || 0);
  const mx = W * 0.5, my = H * 0.81;
  if (m > 0.07) {
    const mw = W * (0.075 + m * 0.03), mh = H * (0.018 + m * 0.06);
    ctx.fillStyle = '#5e1a24';
    ctx.beginPath(); ctx.moveTo(mx - mw, my - mh * 0.2);
    ctx.quadraticCurveTo(mx, my - mh * 0.55, mx + mw, my - mh * 0.2);
    ctx.quadraticCurveTo(mx + mw * 0.6, my + mh * 1.2, mx, my + mh * 1.25);
    ctx.quadraticCurveTo(mx - mw * 0.6, my + mh * 1.2, mx - mw, my - mh * 0.2);
    ctx.fill();
    ctx.fillStyle = '#e46b78';
    ctx.beginPath(); ctx.ellipse(mx, my + mh * 0.85, mw * 0.5, mh * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a0f16'; ctx.lineWidth = 4; ctx.stroke();
  } else {
    ctx.strokeStyle = '#3a1418'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    if (expr === 'smile') { ctx.moveTo(mx - W * 0.07, my - 6); ctx.quadraticCurveTo(mx, my + 14, mx + W * 0.07, my - 6); }
    else if (expr === 'smirk') { ctx.moveTo(mx - W * 0.05, my + 2); ctx.quadraticCurveTo(mx + W * 0.02, my + 6, mx + W * 0.065, my - 8); }
    else if (expr === 'surprised') { ctx.ellipse(mx, my, W * 0.02, H * 0.022, 0, 0, Math.PI * 2); }
    else { ctx.moveTo(mx - W * 0.045, my); ctx.quadraticCurveTo(mx, my + 6, mx + W * 0.045, my - 1); }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- the engineer
// Chibi proportions (about 2.4 heads tall): a big expressive head on a small body.

const HEAD_R = 0.27;
const EYE_V = 0.53;
const FACE = { phiStart: Math.PI / 2 - 0.82, phiLength: 1.64, thetaStart: 1.0, thetaLength: 1.32 };

function onFace(u, v, r) {
  const phi = FACE.phiStart + u * FACE.phiLength, theta = FACE.thetaStart + v * FACE.thetaLength;
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

function limb(radius, length, material) {
  return part(new THREE.CapsuleGeometry(radius, length, 6, 14), material, [0, -length / 2 - radius * 0.3, 0]);
}

export function makeEngineer(emblem) {
  const root = new THREE.Group();
  const skin = toonSoft(COLORS.skin, { emissive: 0x4a2418, emissiveIntensity: 0.3 }), hoodie = toon(COLORS.hoodie), pants = toon(COLORS.pants);
  const hairMat = toon(COLORS.hair), shine = toon(0x3c4c74), black = toon(0x0b0c12), white = toon(0xdfe4ee);
  const cyan = glow(COLORS.cyan);

  const hips = new THREE.Group(); hips.position.y = 0.37; root.add(hips);
  hips.add(part(new THREE.SphereGeometry(0.125, 20, 14), pants, [0, 0, 0], { scale: [1, 0.62, 0.8] }));

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(side * 0.068, -0.02, 0); hips.add(hip);
    hip.add(limb(0.062, 0.09, pants));
    const knee = new THREE.Group(); knee.position.y = -0.165; hip.add(knee);
    knee.add(limb(0.056, 0.08, pants));
    const ankle = new THREE.Group(); ankle.position.y = -0.15; knee.add(ankle);
    ankle.add(part(new RoundedBoxGeometry(0.115, 0.06, 0.2, 3, 0.028), white, [0, -0.012, 0.035]));
    ankle.add(part(new RoundedBoxGeometry(0.105, 0.05, 0.15, 3, 0.024), black, [0, 0.03, 0.015]));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 0.1), cyan);
    stripe.position.set(side * 0.058, -0.012, 0.04); ankle.add(stripe);
    legs.push({ hip, knee, ankle });
  }

  const torso = new THREE.Group(); torso.position.y = 0.02; hips.add(torso);
  torso.add(part(new THREE.CapsuleGeometry(0.15, 0.13, 8, 20), hoodie, [0, 0.19, 0], { scale: [1, 1, 0.8] }));
  const trim = glow(COLORS.cyan, 1, 1.6);
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.2, 0.006), trim); zip.position.set(0, 0.2, 0.121); torso.add(zip);
  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.17, 0.004), trim);
    pipe.position.set(side * 0.118, 0.21, 0.075); pipe.rotation.z = side * 0.08; torso.add(pipe);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.08, 6), glow(0xd8f6ff, 1, 1.4));
    string.position.set(side * 0.035, 0.27, 0.124); torso.add(string);
  }
  torso.add(part(new RoundedBoxGeometry(0.2, 0.07, 0.03, 2, 0.015), hoodie, [0, 0.085, 0.112]));
  torso.add(part(new THREE.TorusGeometry(0.105, 0.048, 10, 24, Math.PI * 1.35), hoodie, [0, 0.335, -0.035], { rot: [Math.PI / 2 + 0.3, 0, Math.PI * 0.82] }));
  if (emblem) {
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.034, 32), new THREE.MeshBasicMaterial({ map: emblem, toneMapped: false }));
    badge.position.set(-0.065, 0.255, 0.118); badge.rotation.y = -0.3; torso.add(badge);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.034, 0.04, 32), cyan);
    ring.position.copy(badge.position); ring.rotation.copy(badge.rotation); torso.add(ring);
  }

  const head = new THREE.Group(); head.position.y = 0.36; torso.add(head);
  head.add(part(new THREE.CylinderGeometry(0.045, 0.052, 0.06, 12), skin, [0, 0.0, 0]));
  const skull = part(new THREE.SphereGeometry(HEAD_R, 44, 32), skin, [0, HEAD_R * 0.9, 0], { scale: [0.97, 1.0, 0.95], ink: 0.011 });
  head.add(skull);
  skull.add(part(new THREE.SphereGeometry(HEAD_R * 0.55, 24, 16), skin, [0, -HEAD_R * 0.52, HEAD_R * 0.3], { scale: [1.1, 0.75, 0.9], ink: false }));
  const face = canvasTex(512, 512, drawEngineerFace);
  const faceMesh = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_R * 1.012, 48, 32, FACE.phiStart, FACE.phiLength, FACE.thetaStart, FACE.thetaLength),
    new THREE.MeshBasicMaterial({ map: face.tex, transparent: true, depthWrite: false }));
  faceMesh.renderOrder = 2;
  skull.add(faceMesh);
  for (const side of [-1, 1]) skull.add(part(new THREE.SphereGeometry(0.045, 12, 10), skin, [side * HEAD_R * 0.96, -0.04, -0.01], { scale: [0.5, 1, 0.8] }));

  // hair: a cap and back shell, swept locks, bangs over the brow and an anime shine band
  skull.add(part(new THREE.SphereGeometry(HEAD_R * 1.07, 40, 20, 0, Math.PI * 2, 0, 1.24), hairMat, [0, 0.012, -0.004], { ink: 0.013 }));
  skull.add(part(new THREE.SphereGeometry(HEAD_R * 1.06, 40, 24, Math.PI / 2 + 0.98, Math.PI * 2 - 1.96, 0, 2.2), hairMat, [0, 0, -0.012], { ink: 0.013 }));
  const rand = rng(7);
  const lock = (pos, dir, r, len) => {
    const c = part(new THREE.ConeGeometry(r, len, 8), hairMat, [0, 0, 0], { ink: 0.011 });
    orient(c, dir); c.position.copy(pos).addScaledVector(dir.clone().normalize(), len * 0.4); skull.add(c);
  };
  // crown and back: locks sweep back and slightly to his left
  for (let i = 0; i < 24; i++) {
    const phi = Math.PI / 2 + 0.9 + rand() * (Math.PI * 2 - 1.8), theta = 0.25 + rand() * 1.3;
    const n = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
    const dir = n.clone().add(new THREE.Vector3(0.25, -0.35 - theta * 0.3, -0.5)).normalize();
    lock(n.clone().multiplyScalar(HEAD_R * 1.0), dir, 0.07 + rand() * 0.035, 0.17 + rand() * 0.13);
  }
  // top: a few tall spikes for the silhouette
  for (const [phi, theta, len] of [[0.6, 0.35, 0.3], [2.4, 0.3, 0.32], [1.5, 0.15, 0.34], [3.6, 0.4, 0.28], [5.0, 0.35, 0.26]]) {
    const n = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
    lock(n.clone().multiplyScalar(HEAD_R), n.clone().add(new THREE.Vector3(0.1, 0.2, -0.45)).normalize(), 0.075, len);
  }
  // bangs: hang over the brow, swept to one side, tips above the eyes
  for (let k = -4; k <= 4; k++) {
    const u = 0.5 + k * 0.1, v = -0.12 + Math.abs(k) * 0.025;
    const base = onFace(u, v, HEAD_R * 1.04);
    const dir = new THREE.Vector3(0.28 + k * 0.05, -1, 0.5 - Math.abs(k) * 0.05).normalize();
    lock(base, dir, 0.06, 0.14 + (k % 2 === 0 ? 0.04 : 0) + rand() * 0.03);
  }
  for (const side of [-1, 1]) {
    lock(new THREE.Vector3(side * HEAD_R * 0.94, 0.0, 0.05), new THREE.Vector3(side * 0.12, -1, 0.15), 0.055, 0.2);
    lock(new THREE.Vector3(side * HEAD_R * 0.86, 0.05, -0.1), new THREE.Vector3(side * 0.3, -1, -0.3), 0.06, 0.24);
  }

  // glasses: two frames, a bridge, arms back to the ears; lenses can glow
  const frameMat = toon(0x090a10);
  const lensMat = new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.05, toneMapped: false, depthWrite: false });
  const glasses = new THREE.Group(); skull.add(glasses);
  const lensCenters = [];
  for (const u of [0.31, 0.69]) {
    const c = onFace(u, EYE_V, HEAD_R * 1.1);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.0075, 8, 40), frameMat);
    frame.scale.set(1.12, 0.88, 1); frame.position.copy(c); frame.lookAt(c.clone().multiplyScalar(2)); glasses.add(frame);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.075, 32), lensMat);
    lens.scale.copy(frame.scale); lens.position.copy(c); lens.quaternion.copy(frame.quaternion); glasses.add(lens);
    lensCenters.push(c);
    const temple = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.2), frameMat);
    temple.position.set(c.x * 1.12 + (u < 0.5 ? -0.05 : 0.05), c.y + 0.01, c.z - 0.13); glasses.add(temple);
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, Math.abs(lensCenters[1].x - lensCenters[0].x) - 0.16, 6), frameMat);
  bridge.rotation.z = Math.PI / 2; bridge.position.copy(lensCenters[0]).lerp(lensCenters[1], 0.5); bridge.position.y += 0.015; glasses.add(bridge);

  // arms
  const arms = {};
  for (const [name, side] of [['R', -1], ['L', 1]]) {
    const shoulder = new THREE.Group(); shoulder.position.set(side * 0.165, 0.29, 0); torso.add(shoulder);
    shoulder.add(part(new THREE.SphereGeometry(0.062, 14, 12), hoodie, [0, -0.005, 0]));
    shoulder.add(limb(0.055, 0.09, hoodie));
    const elbow = new THREE.Group(); elbow.position.y = -0.155; shoulder.add(elbow);
    elbow.add(limb(0.05, 0.08, hoodie));
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.008, 6, 20), cyan);
    cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.14; elbow.add(cuff);
    const hand = part(new THREE.SphereGeometry(0.05, 14, 12), skin, [0, -0.18, 0], { scale: [0.9, 1.1, 0.8] });
    elbow.add(hand);
    if (name === 'L') {
      const watch = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.028, 18, 1, true), toon(0x0b0c12, { side: THREE.DoubleSide }));
      watch.position.y = -0.12; elbow.add(watch);
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.018, 18), cyan);
      dial.position.set(0, -0.12, 0.044); elbow.add(dial);
    }
    arms[name] = { shoulder, elbow, hand, side };
  }

  // Two-bone arm reach: the hand goes to `target` (torso space); the elbow bends toward `pole`.
  const L1 = 0.155, L2 = 0.18, DOWN = new THREE.Vector3(0, -1, 0);
  function reach(a, target, pole) {
    const s = a.shoulder.position;
    const to = new THREE.Vector3(...target).sub(s);
    const d = Math.min(to.length(), L1 + L2 - 0.005);
    const dir = to.normalize();
    const hint = new THREE.Vector3(...(pole || [a.side * 0.4, -1, -0.6]));
    hint.addScaledVector(dir, -hint.dot(dir)).normalize();
    const alpha = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const upper = dir.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(hint, Math.sin(alpha)).normalize();
    a.shoulder.quaternion.setFromUnitVectors(DOWN, upper);
    const elbowAt = s.clone().addScaledVector(upper, L1);
    const fore = s.clone().addScaledVector(dir, d).sub(elbowAt).normalize();
    const local = fore.applyQuaternion(a.shoulder.quaternion.clone().invert());
    a.elbow.quaternion.setFromUnitVectors(DOWN, local);
  }

  const state = { faceKey: '' };
  function pose(p) {
    const w = p.walk || 0, ph = p.walkPhase || 0, crouch = p.crouch || 0;
    root.position.set(...(p.pos || [0, 0, 0]));
    root.rotation.y = p.yaw || 0;
    hips.position.y = 0.37 + Math.abs(Math.sin(ph)) * 0.025 * w + Math.sin((p.t || 0) * 2.2) * 0.003 - crouch * 0.1;
    legs.forEach((leg, i) => {
      const s = i === 0 ? 1 : -1;
      const swing = Math.sin(ph) * 0.6 * w * s;
      leg.hip.rotation.x = -swing - crouch * 0.9;
      leg.knee.rotation.x = Math.max(0, Math.sin(ph + (s > 0 ? 0 : Math.PI) - 0.9)) * 0.9 * w + crouch * 1.6;
      leg.ankle.rotation.x = -leg.knee.rotation.x * 0.45 + crouch * 0.2;
      leg.hip.rotation.z = -s * 0.04;
    });
    torso.rotation.set((p.lean || 0) + crouch * 0.3, p.twist || 0, Math.sin(ph) * 0.04 * w);
    head.rotation.set((p.headPitch || 0) - crouch * 0.25 + Math.sin((p.t || 0) * 1.3) * 0.015, p.headYaw || 0, p.headTilt || 0);
    for (const [name, a] of Object.entries(arms)) {
      const q = (name === 'R' ? p.armR : p.armL) || {};
      const swing = Math.sin(ph) * 0.5 * w * (name === 'R' ? 1 : -1);
      if (q.reach) {
        reach(a, q.reach, q.pole);
      } else {
        a.shoulder.quaternion.identity(); a.elbow.quaternion.identity();
        a.shoulder.rotation.set((q.x ?? 0.05) + swing, q.y ?? 0, q.z ?? a.side * 0.18);
        a.elbow.rotation.set(q.elbow ?? -0.25, q.twist ?? 0, 0);
      }
    }
    lensMat.opacity = 0.05 + clamp(p.glasses || 0) * 0.85;
    lensMat.color.setHex(COLORS.cyan).multiplyScalar(1 + clamp(p.glasses || 0) * 2);
    const key = [p.expr, (p.blink || 0).toFixed(2), (p.mouth || 0).toFixed(2), (p.look || [0, 0]).map((x) => x.toFixed(2)).join()].join('|');
    if (key !== state.faceKey) { face.redraw({ expr: p.expr, blink: p.blink, mouth: p.mouth, look: p.look }); state.faceKey = key; }
  }
  return {
    root, pose, arms,
    headPoint() { const v = new THREE.Vector3(); skull.getWorldPosition(v); return v; },
    handPoint(name = 'R') { const v = new THREE.Vector3(); arms[name].hand.getWorldPosition(v); return v; },
    glassesPoint() { const v = new THREE.Vector3(); glasses.children[0].getWorldPosition(v); return v; },
  };
}

// ---------------------------------------------------------------- Nova

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 === 0 ? r : r * 0.32;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

function drawNovaFace(ctx, W, H, s) {
  const expr = s.expr || 'normal';
  const open = 1 - clamp(s.blink || 0);
  const m = clamp(s.mouth || 0);
  const col = '#5ff0ff';
  ctx.shadowColor = '#22d3ff'; ctx.shadowBlur = 22;
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const ex = [W * 0.34, W * 0.66], ey = H * 0.44 + (s.bounce || 0) * 6;
  const lx = (s.look || [0, 0])[0] * 18, ly = (s.look || [0, 0])[1] * 10;
  for (let i = 0; i < 2; i++) {
    const x = ex[i] + lx, y = ey + ly;
    ctx.lineWidth = 20;
    if (expr === 'happy') {
      ctx.beginPath(); ctx.moveTo(x - 38, y + 12); ctx.quadraticCurveTo(x, y - 40, x + 38, y + 12); ctx.stroke();
    } else if (expr === 'sparkle') {
      star(ctx, x, y, 46);
    } else if (expr === 'panic') {
      ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(x - 30, y - 30); ctx.lineTo(x + 30, y + 30); ctx.moveTo(x + 30, y - 30); ctx.lineTo(x - 30, y + 30); ctx.stroke();
    } else if (expr === 'surprised') {
      ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    } else if (expr === 'confused' && i === 1) {
      ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(x - 30, y + 4); ctx.lineTo(x + 30, y + 4); ctx.stroke();
    } else if (expr === 'squint') {
      ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(x - 32, y - (i ? -8 : 8)); ctx.lineTo(x + 32, y + (i ? -8 : 8)); ctx.stroke();
    } else {
      const h = 64 * open + 6;
      ctx.beginPath(); ctx.ellipse(x, y, 27, h / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.ellipse(x - 9, y - h * 0.22, 7, Math.max(2, h * 0.12), 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col; ctx.shadowBlur = 22;
    }
  }
  if (expr === 'confused') {
    ctx.font = 'bold 84px Inter, sans-serif'; ctx.fillText('?', W * 0.8, H * 0.3);
  }
  // mouth
  const mx = W * 0.5, my = H * 0.7;
  ctx.lineWidth = 12;
  if (m > 0.08) {
    ctx.beginPath(); ctx.ellipse(mx, my, 20 + m * 8, 6 + m * 26, 0, 0, Math.PI * 2); ctx.fill();
  } else if (expr === 'panic') {
    ctx.beginPath(); ctx.moveTo(mx - 34, my); for (let k = 0; k < 6; k++) ctx.lineTo(mx - 34 + (k + 1) * 11.5, my + (k % 2 ? -8 : 8)); ctx.stroke();
  } else if (expr === 'surprised') {
    ctx.beginPath(); ctx.ellipse(mx, my, 12, 14, 0, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(mx - 26, my - 4); ctx.quadraticCurveTo(mx, my + 18, mx + 26, my - 4); ctx.stroke();
  }
  // reflection on the visor
  ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.arc(W * 0.5, H * 0.95, W * 0.46, Math.PI * 1.17, Math.PI * 1.32); ctx.stroke();
}

export function makeNova(emblem) {
  const root = new THREE.Group();
  const bob = new THREE.Group(); root.add(bob);
  const shell = toon(0xf3f6ff), dark = new THREE.MeshStandardMaterial({ color: 0x04060c, roughness: 0.18, metalness: 0.3 });
  const cyan = glow(COLORS.cyan);
  const head = part(new THREE.SphereGeometry(0.2, 40, 28), shell, [0, 0, 0], { scale: [1.14, 0.96, 1.02], ink: 0.009 });
  bob.add(head);
  const VIS = { phiStart: Math.PI / 2 - 1.0, phiLength: 2.0, thetaStart: 0.6, thetaLength: 1.45 };
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.2015, 48, 32, VIS.phiStart, VIS.phiLength, VIS.thetaStart, VIS.thetaLength), dark));
  const face = canvasTex(512, 320, drawNovaFace);
  const eyes = new THREE.Mesh(new THREE.SphereGeometry(0.203, 48, 32, VIS.phiStart + 0.15, VIS.phiLength - 0.3, VIS.thetaStart + 0.12, VIS.thetaLength - 0.24),
    new THREE.MeshBasicMaterial({ map: face.tex, color: new THREE.Color(2.2, 2.2, 2.2), transparent: true, toneMapped: false, depthWrite: false }));
  eyes.renderOrder = 3; head.add(eyes);
  for (const side of [-1, 1]) {
    const ear = part(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 24), shell, [side * 0.225, 0.0, 0], { rot: [0, 0, Math.PI / 2] });
    head.add(ear);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 8, 28), cyan);
    ring.position.set(side * 0.257, 0, 0); ring.rotation.y = Math.PI / 2; head.add(ring);
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 6), toon(0xcfd6e8));
  antenna.position.set(0.06, 0.23, 0); antenna.rotation.z = -0.3; head.add(antenna);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), cyan); tip.position.set(0.075, 0.27, 0); head.add(tip);

  const body = part(new THREE.SphereGeometry(0.13, 28, 20), shell, [0, -0.25, 0], { scale: [1, 0.92, 0.9], ink: 0.009 });
  bob.add(body);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.007, 8, 40), cyan); belt.rotation.x = Math.PI / 2; belt.position.y = -0.02; body.add(belt);
  if (emblem) {
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.036, 28), new THREE.MeshBasicMaterial({ map: emblem, toneMapped: false }));
    badge.position.set(0, 0.03, 0.118); body.add(badge);
  }
  const arms = {};
  for (const [name, side] of [['R', -1], ['L', 1]]) {
    const pivot = new THREE.Group(); pivot.position.set(side * 0.13, -0.2, 0); bob.add(pivot);
    pivot.add(part(new THREE.CapsuleGeometry(0.03, 0.07, 4, 10), shell, [0, -0.06, 0]));
    pivot.add(part(new THREE.SphereGeometry(0.038, 12, 10), shell, [0, -0.13, 0]));
    arms[name] = { pivot, side };
  }
  const jet = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  jet.rotation.x = Math.PI; jet.position.y = -0.47; bob.add(jet);
  const jetCore = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), glow(0xbff6ff)); jetCore.position.y = -0.36; bob.add(jetCore);

  const state = { faceKey: '' };
  function pose(p) {
    const t = p.t || 0;
    root.position.set(...(p.pos || [0, 1.3, 0]));
    root.rotation.set(0, p.yaw || 0, 0);
    bob.position.y = Math.sin(t * 2.4) * 0.035 * (p.float ?? 1) + (p.hop || 0);
    bob.rotation.set((p.tiltX || 0) + Math.sin(t * 1.7) * 0.04, 0, (p.tilt || 0) + Math.sin(t * 2.1) * 0.05);
    head.rotation.set(p.headPitch || 0, p.headYaw || 0, p.headTilt || 0);
    for (const [name, a] of Object.entries(arms)) {
      const q = (name === 'R' ? p.armR : p.armL) || {};
      a.pivot.rotation.set(q.x ?? 0.1, 0, (q.z ?? a.side * 0.35) + Math.sin(t * 3 + a.side) * 0.08);
    }
    jet.material.opacity = 0.4 + 0.2 * Math.sin(t * 31) * Math.sin(t * 17);
    jet.scale.set(1, 0.85 + 0.25 * Math.abs(Math.sin(t * 23)) * (p.thrust ?? 1), 1);
    const key = [p.expr, (p.blink || 0).toFixed(2), (p.mouth || 0).toFixed(2), (p.bounce || 0).toFixed(2), (p.look || [0, 0]).map((x) => x.toFixed(2)).join()].join('|');
    if (key !== state.faceKey) { face.redraw({ expr: p.expr, blink: p.blink, mouth: p.mouth, bounce: p.bounce, look: p.look }); state.faceKey = key; }
  }
  return { root, pose, arms, headPoint() { const v = new THREE.Vector3(); head.getWorldPosition(v); return v; } };
}

// Explore mode: the HashMap world live in the browser. Orbit the camera, click a bucket to look
// inside it, type a key to watch the engineer hash it and drop it into its bucket. Nova follows,
// and reacts when two keys collide. Uses the same world, characters and props as the videos.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Stage } from '../app/stage';
import type { Cast } from '../characters';
import type { Expression, GestureState } from '../characters/types';
import { HashMapWorld } from '../world/hashmapWorld';
import { EntrySlab, keyCard, bucketOf, javaHash, spread } from '../props/cards';
import { blinkAt, easeOut, smoother, span, V } from '../util/math';

interface Flight { key: string; bucket: number; slot: number; start: number; card: ReturnType<typeof keyCard>; slab: EntrySlab; collided: boolean }

export function startExplore(host: HTMLElement, cast: Cast): void {
  document.body.classList.add('explore');
  const stage = new Stage(host, innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
  const { scene, camera, renderer } = stage;
  const world = new HashMapWorld(scene);
  scene.add(cast.engineer.root, cast.nova.root);
  camera.position.set(0.4, 1.9, 5.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.1, -0.6);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 1.2; controls.maxDistance = 12;

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <h1>STACK<b>NOVA</b> · HASHMAP</h1>
    <p>Drag to look around. Click a bucket to look inside. Type a key and press Put: the engineer hashes it with Java's own <code>hashCode</code> and it lands in its bucket.</p>
    <div class="row"><input id="key" value="user:42" maxlength="24" aria-label="key"><button id="put">Put</button></div>
    <div class="row" style="margin-top:8px"><button id="vision">System Vision</button><button id="story">Watch the Short</button><button id="reset">Reset</button></div>
    <div class="say" id="say">Nova: <b>Where do keys go?</b></div>`;
  document.body.appendChild(panel);
  const say = (who: string, text: string) => { (panel.querySelector('#say') as HTMLElement).innerHTML = `${who}: <b>${text}</b>`; };

  const contents: string[][] = Array.from({ length: 16 }, () => []);
  const flights: Flight[] = [];
  let focus = -1, visionOn = 0, visionTarget = 0;
  let novaTarget = V(-0.25, 1.48, 1.35), novaExpr: Expression = 'normal', novaGesture: GestureState | undefined;
  let engGesture: GestureState | undefined, engExpr: Expression = 'calm';
  const clock = new THREE.Clock();

  const put = () => {
    const input = panel.querySelector('#key') as HTMLInputElement;
    const key = input.value.trim() || 'user:42';
    const b = bucketOf(key);
    const slot = contents[b].length;
    const now = clock.getElapsedTime();
    const card = keyCard(key, 'amber'); scene.add(card);
    const slab = new EntrySlab(key); slab.visible = false; scene.add(slab);
    contents[b].push(key);
    flights.push({ key, bucket: b, slot, start: now, card, slab, collided: slot > 0 });
    engGesture = { name: 'present', weight: 1, time: 0 };
    engExpr = 'calm';
    say('Engineer', `"${key}".hashCode() = ${javaHash(key)}, spread ${spread(javaHash(key))}, last four bits → bucket ${b}.`);
    novaTarget = world.front(b, 0.75, 1.5);
    novaExpr = 'normal';
  };
  (panel.querySelector('#put') as HTMLButtonElement).onclick = put;
  (panel.querySelector('#key') as HTMLInputElement).onkeydown = (e) => { if (e.key === 'Enter') put(); };
  (panel.querySelector('#vision') as HTMLButtonElement).onclick = () => { visionTarget = visionTarget ? 0 : 1; engGesture = { name: 'vision', weight: 1, time: 0 }; };
  (panel.querySelector('#story') as HTMLButtonElement).onclick = () => { location.search = '?mode=story'; };
  (panel.querySelector('#reset') as HTMLButtonElement).onclick = () => location.reload();

  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  renderer.domElement.addEventListener('click', (e) => {
    mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(world.buckets.map((b) => b.group), true)[0];
    if (!hit) return;
    const i = world.buckets.findIndex((b) => hit.object.parent === b.group || b.group.getObjectById(hit.object.id));
    if (i < 0) return;
    focus = i;
    controls.target.copy(world.front(i, 0, 0.9));
    novaTarget = world.front(i, 0.7, 1.45);
    const items = contents[i];
    say('Nova', items.length ? `Bucket ${i} holds ${items.join(', ')}.` : `Bucket ${i} is empty.`);
    novaExpr = items.length > 1 ? 'surprised' : 'happy';
  });
  addEventListener('resize', () => stage.resize(innerWidth, innerHeight));

  const loop = () => {
    const t = clock.getElapsedTime(), dt = Math.min(clock.getDelta(), 0.05);
    visionOn += (visionTarget - visionOn) * Math.min(1, dt * 3);
    world.setVision(visionOn, 0, t);
    for (const f of flights) {
      const k = span(t, f.start + 0.8, f.start + 2.2);
      const from = cast.engineer.handWorld('L').add(V(0, 0.12, 0));
      const to = world.slot(f.bucket, f.slot);
      const top = world.buckets[f.bucket].pos.clone().setY(2.0);
      const p = k < 0.75 ? from.clone().lerp(top, smoother(k / 0.75)).add(V(0, Math.sin(Math.min(1, k / 0.75) * Math.PI) * 0.6, 0))
        : top.clone().lerp(to, easeOut((k - 0.75) / 0.25));
      f.card.position.copy(p); f.card.quaternion.copy(camera.quaternion);
      f.card.visible = k < 1;
      if (k >= 1 && !f.slab.visible) {
        f.slab.visible = true; f.slab.position.copy(to); f.slab.lookAt(to.clone().add(world.buckets[f.bucket].front));
        world.setTone(f.bucket, f.collided ? 'alarm' : 'active');
        if (f.collided) {
          novaExpr = 'panic'; novaGesture = { name: 'panic', weight: 1, time: 0 }; engExpr = 'smirk';
          say('Nova', `Two keys in bucket ${f.bucket}? That can't be legal! (It's a collision: the bucket keeps a chain.)`);
        } else { novaExpr = 'sparkle'; novaGesture = { name: 'celebrate', weight: 1, time: 0 }; engExpr = 'smile'; }
      }
    }
    if (engGesture) { engGesture.time += dt; engGesture.weight = Math.max(0, 1 - Math.max(0, engGesture.time - 1.6) * 2); if (engGesture.weight <= 0) engGesture = undefined; }
    if (novaGesture) { novaGesture.time += dt; novaGesture.weight = Math.max(0, 1 - Math.max(0, novaGesture.time - 1.8) * 2); if (novaGesture.weight <= 0) novaGesture = undefined; }
    const np = cast.nova.root.position.clone().lerp(novaTarget, Math.min(1, dt * 2.2));
    cast.engineer.apply({ t, position: V(0.45, 0, 1.3), yaw: Math.PI - 0.2, gesture: engGesture, lookAt: focus >= 0 ? world.front(focus, 0, 1.0) : cast.nova.headWorld(),
      expression: engExpr, blink: blinkAt(t, 0.37), vision: visionOn * 0.4 });
    cast.nova.apply({ t, position: np, yaw: Math.atan2(camera.position.x - np.x, camera.position.z - np.z) * 0.6, lookAt: camera.position,
      expression: novaExpr, blink: blinkAt(t, 1.71), gesture: novaGesture, hop: novaExpr === 'sparkle' ? Math.abs(Math.sin(t * 8)) * 0.04 : 0 });
    controls.update();
    stage.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

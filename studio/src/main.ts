// StackNova studio. Three ways in, chosen by ?mode=:
//   explore (default)  the HashMap world live: orbit, click buckets, put keys
//   story              the HashMap Short played in real time in a 1080 x 1920 frame
//   render             for the video renderer: window.boot(timeline), then window.render(t)
import { Stage } from './app/stage';
import { loadCast } from './characters';
import { FrameHud, VIEW, type Timeline } from './hud/hud';
import { playFilm } from './film/player';
import type { FilmTimeline } from './film/types';
import { hashmapShort } from './story/hashmapShort';
import { startExplore } from './interactive/explore';

const STEPS = ['SEARCH?', 'HASH', 'BUCKET', 'COLLISION', 'TREE'];
const host = document.getElementById('app') as HTMLElement;
const mode = new URLSearchParams(location.search).get('mode') ?? 'explore';

async function fontsReady(): Promise<void> {
  await Promise.all(['800 20px "Inter Display"', '500 20px Inter', '700 20px Inter', '400 20px "JetBrains Mono"', '700 20px "JetBrains Mono"']
    .map((f) => document.fonts.load(f)));
  await document.fonts.ready;
}

/** The call to action on the end card: YouTube asks to subscribe, Instagram to follow. */
function cta(tl: Timeline, what: string): string {
  return `${(tl as FilmTimeline).variant === 'short' ? 'Subscribe' : 'Follow'} for ${what}`;
}

async function frame(tl: Timeline): Promise<{ draw: (t: number) => void; stage: Stage }> {
  await fontsReady();
  if ('film' in tl) {
    const film = (tl as FilmTimeline).film;
    const hud = new FrameHud(host, film.title, film.episode, film.steps,
      { end: film.end, cta: film.end?.cta ? cta(tl, film.end.cta) : undefined });
    const stage = new Stage(hud.view, VIEW.width, VIEW.height);
    return { draw: playFilm(stage, await loadCast(), hud, tl as FilmTimeline), stage };
  }
  const hud = new FrameHud(host, 'HASHMAP', 'EP 007 · PART 1', STEPS, { cta: cta(tl, 'part 2') });
  const stage = new Stage(hud.view, VIEW.width, VIEW.height);
  const cast = await loadCast();
  return { draw: hashmapShort(stage, cast, hud, tl), stage };
}

declare global { interface Window { boot(tl: Timeline): Promise<boolean>; render(t: number): boolean } }

if (mode === 'lab') {
  // a turntable for the characters: window.boot({cam, look, fov, engineer, nova}) then render(t)
  let draw: ((t: number) => void) | null = null;
  window.boot = (async (lab: any) => {
    await fontsReady();
    host.style.width = '1080px'; host.style.height = '1920px';
    const stage = new Stage(host, 1080, 1920);
    const { HashMapWorld } = await import('./world/hashmapWorld');
    new HashMapWorld(stage.scene);
    const cast = await loadCast();
    (window as unknown as { cast: unknown }).cast = cast;
    stage.scene.add(cast.engineer.root, cast.nova.root);
    const { V } = await import('./util/math');
    // camHead: the camera relative to the engineer's head (and looking at it), for face close-ups
    // whatever the model's height; gesture.target and look may be given as [x, y, z]
    const vec = (a: unknown) => (Array.isArray(a) ? V(...(a as [number, number, number])) : undefined);
    draw = (t) => {
      const e = lab.engineer ?? {};
      const gesture = e.gesture ? { ...e.gesture, target: vec(e.gesture.target) } : undefined;
      cast.engineer.apply({ t, ...e, position: vec(e.pos) ?? V(), yaw: e.yaw ?? 0, gesture, lookAt: vec(e.look) ?? null });
      const n = lab.nova ?? {};
      cast.nova.apply({ t, ...n, position: vec(n.pos) ?? V(0.5, 1.4, 0), yaw: n.yaw ?? 0, lookAt: vec(n.look) ?? null });
      stage.scene.updateMatrixWorld(true);
      const head = cast.engineer.headWorld();
      const cam = lab.camHead ? head.clone().add(vec(lab.camHead)!) : vec(lab.cam)!;
      const look = lab.camHead ? head : vec(lab.look)!;
      stage.camera.position.copy(cam); stage.camera.fov = lab.fov ?? 30; stage.camera.aspect = 1080 / 1920;
      stage.camera.updateProjectionMatrix(); stage.camera.lookAt(look);
      stage.render();
    };
    return true;
  }) as unknown as Window['boot'];
  window.render = (t) => { draw?.(t); return true; };
} else if (mode === 'render') {
  let current: { draw: (t: number) => void; stage: Stage } | null = null;
  window.boot = async (tl) => { current = await frame(tl); return true; };
  window.render = (t) => { if (!current) return false; current.draw(t); current.stage.render(); return true; };
} else if (mode === 'story') {
  (async () => {
    const tl: Timeline = await (await fetch(new URL('story/hashmap-short.json', document.baseURI))).json();
    const { draw, stage } = await frame(tl);
    const fit = () => { const s = Math.min(innerWidth / 1080, innerHeight / 1920); host.style.transform = `scale(${s})`; host.style.transformOrigin = 'top left'; };
    fit(); addEventListener('resize', fit);
    const audio = new Audio(new URL('local/hashmap-mix.wav', document.baseURI).href);
    let start = performance.now();
    const play = () => { start = performance.now(); audio.currentTime = 0; audio.play().catch(() => undefined); };
    addEventListener('click', play);
    const loop = () => {
      const t = ((performance.now() - start) / 1000) % (tl.duration + 1.5);
      draw(Math.min(t, tl.duration)); stage.render();
      requestAnimationFrame(loop);
    };
    play(); loop();
  })();
} else {
  loadCast().then((cast) => startExplore(host, cast));
}

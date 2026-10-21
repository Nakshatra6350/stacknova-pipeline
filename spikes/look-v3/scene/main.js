// Look v3 draft: boots the 3D stage and draws any moment t on request.
//   window.boot(data)  builds everything (data: the timeline from render_draft.py, or {lab})
//   window.render(t)   draws the frame at t seconds
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeEngineer, makeNova } from './lib/characters.js';
import { COLORS } from './lib/kit.js';

const W = 1080, H = 1920;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.45;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.night);
scene.fog = new THREE.FogExp2(COLORS.night, 0.045);
const camera = new THREE.PerspectiveCamera(38, W / H, 0.05, 200);

const target = new THREE.WebGLRenderTarget(W, H, { samples: 4, type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.7, 0.4, 1.25);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function lights() {
  scene.add(new THREE.HemisphereLight(0xe2e8ff, 0x0a0c18, 0.5));
  const key = new THREE.DirectionalLight(0xffe0c4, 1.25); key.position.set(2.5, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x3fd8ff, 1.5); rim.position.set(-3, 3, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x6a5cff, 0.3); fill.position.set(-4, 1, 3); scene.add(fill);
}

async function loadEmblem() {
  const tex = await new THREE.TextureLoader().loadAsync('/brand/emblem-1264.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let draw = () => {};

window.boot = async (data) => {
  await document.fonts.ready;
  await Promise.all(['500 20px Inter', '700 20px Inter', '800 20px "Inter Display"', '400 20px "JetBrains Mono"', '700 20px "JetBrains Mono"'].map((f) => document.fonts.load(f)));
  const emblem = await loadEmblem();
  lights();
  if (data.lab) {
    if (data.lab.bg) { scene.background = new THREE.Color(data.lab.bg); scene.fog = null; }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshToonMaterial({ color: 0x0b1020 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const grid = new THREE.GridHelper(12, 24, 0x1d8fb3, 0x123a52); grid.position.y = 0.002; scene.add(grid);
    const eng = makeEngineer(emblem), nova = makeNova(emblem);
    scene.add(eng.root, nova.root);
    draw = (t) => {
      const lab = data.lab;
      eng.pose({ ...(lab.engineer || {}), t });
      nova.pose({ ...(lab.nova || {}), t });
      camera.position.set(...lab.cam); camera.fov = lab.fov || 38; camera.updateProjectionMatrix();
      camera.lookAt(...lab.target);
    };
  } else {
    const { buildShow } = await import('./show.js');
    draw = await buildShow({ scene, camera, renderer, bloom, emblem, data, makeEngineer, makeNova });
  }
  return true;
};

window.render = (t) => {
  draw(t);
  composer.render();
  return true;
};

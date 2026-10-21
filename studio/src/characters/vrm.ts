// A VRM character (an anime model made in VRoid Studio), behind the same CharacterRig contract
// as the code-built characters. The model brings its own skeleton, face expressions, mouth
// shapes and hair physics; this class poses its humanoid bones from the story's state each frame:
// walk, breathing, arms reaching (point, explain, glasses, present), head and eyes turning,
// blinking, lip-sync and expressions. Glasses and a backpack can be added if the model lacks them.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import type { CharacterRig, CharacterState, Expression } from './types';
import { clamp, V } from '../util/math';

export interface VrmConfig {
  url: string;
  /** Adds glasses on the head bone (when the model has none), placed from the eye offset. */
  glasses?: boolean;
  glassesOffset?: [number, number, number];
  glassesScale?: number;
  /** Adds a backpack on the upper chest. */
  backpack?: boolean;
  /** Cyan-blue rim light on the model's MToon materials, 0 to switch off. */
  rim?: number;
}

const FPS = 30;
type Side = 'left' | 'right';
const FINGERS = ['Index', 'Middle', 'Ring', 'Little'] as const;
const PARTS = ['Proximal', 'Intermediate', 'Distal'] as const;

// face expressions of a VRM 1.0 model (VRoid exports these)
const EXPRESSIONS: Partial<Record<Expression, [string, number][]>> = {
  smile: [['happy', 0.75]], happy: [['happy', 1]], smirk: [['happy', 0.35], ['relaxed', 0.3]],
  surprised: [['surprised', 0.8]], focus: [['angry', 0.18]], thinking: [['relaxed', 0.35]],
  calm: [['relaxed', 0.15]], confused: [['sad', 0.3]], panic: [['surprised', 1]], celebrate: [['happy', 1]],
};
const ALL_EXPRESSIONS = ['happy', 'angry', 'sad', 'relaxed', 'surprised'];

export class VrmCharacter implements CharacterRig {
  readonly root = new THREE.Group();
  readonly height: number;
  private lookTarget = new THREE.Object3D();
  private lastT = -1;
  private rest = new Map<string, THREE.Quaternion>();
  private hipsRest = V();
  private lens?: THREE.MeshBasicMaterial;

  private constructor(private vrm: VRM, private cfg: VrmConfig) {
    VRMUtils.rotateVRM0(vrm); // a VRM 0.x model faces -Z; make it face +Z like VRM 1.0
    this.root.add(vrm.scene);
    this.root.add(this.lookTarget);
    vrm.scene.traverse((o) => { o.frustumCulled = false; });
    if (vrm.lookAt) vrm.lookAt.target = this.lookTarget;
    const box = new THREE.Box3().setFromObject(vrm.scene);
    this.height = box.max.y - box.min.y;
    for (const name of this.boneNames()) {
      const node = vrm.humanoid.getNormalizedBoneNode(name);
      if (node) this.rest.set(name, node.quaternion.clone());
    }
    this.hipsRest.copy(this.bone('hips')?.position ?? V());
    this.rimLight(cfg.rim ?? 1);
    if (cfg.glasses) this.addGlasses();
    if (cfg.backpack) this.addBackpack();
  }

  static async load(cfg: VrmConfig): Promise<VrmCharacter> {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(cfg.url);
    const vrm = gltf.userData.vrm as VRM;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    return new VrmCharacter(vrm, cfg);
  }

  private boneNames(): VRMHumanBoneName[] {
    const names: string[] = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
      'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
      'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];
    for (const s of ['left', 'right']) {
      for (const f of FINGERS) for (const p of PARTS) names.push(`${s}${f}${p}`);
      for (const p of ['Metacarpal', 'Proximal', 'Distal']) names.push(`${s}Thumb${p}`);
    }
    return names as VRMHumanBoneName[];
  }

  private bone(name: string): THREE.Object3D | null {
    return this.vrm.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName);
  }

  private rimLight(k: number): void {
    if (k <= 0) return;
    this.vrm.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as unknown as Record<string, unknown>[]) {
        const rim = m.parametricRimColorFactor as THREE.Color | undefined;
        if (rim) {
          rim.setRGB(0.05 * k, 0.17 * k, 0.3 * k);
          m.parametricRimFresnelPowerFactor = 3.2;
          m.parametricRimLiftFactor = 0.05;
        }
      }
    });
  }

  /** A raw bone (the one the skin follows) and a group on it whose axes match the model's. */
  private mount(name: VRMHumanBoneName): THREE.Group | null {
    const raw = this.vrm.humanoid.getRawBoneNode(name);
    if (!raw) return null;
    this.vrm.scene.updateMatrixWorld(true);
    const g = new THREE.Group();
    g.quaternion.copy(raw.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(this.vrm.scene.getWorldQuaternion(new THREE.Quaternion())));
    raw.add(g);
    return g;
  }

  private addGlasses(): void {
    const head = this.mount('head');
    if (!head) return;
    // centred between the model's eye bones, a little in front of the eyes
    this.vrm.scene.updateMatrixWorld(true);
    const le = this.vrm.humanoid.getRawBoneNode('leftEye'), re = this.vrm.humanoid.getRawBoneNode('rightEye');
    const [ox, oy, oz] = this.cfg.glassesOffset ?? [0, 0, 0.03];
    let mid: THREE.Vector3, half = 0.032;
    if (le && re) {
      const a = le.getWorldPosition(V()), b = re.getWorldPosition(V());
      mid = a.clone().lerp(b, 0.5); half = a.distanceTo(b) / 2;
    } else {
      mid = this.vrm.humanoid.getRawBoneNode('head')!.getWorldPosition(V()).add(V(0, 0.06, 0.06));
    }
    // the eye bones sit inside the head: find the face surface in front of them
    const ray = new THREE.Raycaster(mid.clone().add(V(0, 0, 0.5)), V(0, 0, -1), 0, 0.7);
    const hit = ray.intersectObject(this.vrm.scene, true).find((h) => (h.object as THREE.Mesh).isMesh && !h.object.userData.added);
    mid.z = (hit ? hit.point.z : mid.z + 0.06) + 0.012;
    mid.add(V(ox, oy, oz - 0.03));
    const eyes = head.worldToLocal(mid);
    const s = (this.cfg.glassesScale ?? 1) * (Math.max(half, 0.03) / 0.032);
    const frame = new THREE.MeshToonMaterial({ color: 0x0a0b10 });
    this.lens = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.08, depthWrite: false, toneMapped: false });
    const rect = (w: number, h: number, r: number) => {
      const pts: THREE.Vector3[] = [];
      for (const [cx, cy, a0] of [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI], [w / 2 - r, -h / 2 + r, Math.PI * 1.5]])
        for (let i = 0; i <= 4; i++) { const a = a0 + (i / 4) * (Math.PI / 2); pts.push(V(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0)); }
      return pts;
    };
    const g = new THREE.Group();
    g.position.copy(eyes);
    g.scale.setScalar(s);
    for (const x of [-0.032, 0.032]) {
      const ring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rect(0.05, 0.032, 0.009), true), 48, 0.0018, 6, true), frame);
      ring.position.x = x; ring.rotation.y = x * 4; g.add(ring);
      const glass = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(rect(0.049, 0.031, 0.009).map((p) => new THREE.Vector2(p.x, p.y)))), this.lens);
      glass.position.copy(ring.position); glass.rotation.copy(ring.rotation); g.add(glass);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.1), frame);
      arm.position.set(x * 1.75, 0.008, -0.05); g.add(arm);
    }
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.003, 0.003), frame));
    head.add(g);
  }

  private addBackpack(): void {
    const chest = this.mount('upperChest') ?? this.mount('chest');
    if (!chest) return;
    const pack = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.32, 0.11, 3, 0.03), new THREE.MeshToonMaterial({ color: 0x121318 }));
    pack.position.set(0, -0.06, -0.15);
    chest.add(pack);
  }

  // ------------------------------------------------------------------ posing

  private resetPose(): void {
    for (const [name, q] of this.rest) this.bone(name)?.quaternion.copy(q);
    this.bone('hips')?.position.copy(this.hipsRest);
  }

  /** Two-bone reach: the hand goes to a world point, the elbow bends toward `pole` (world). */
  private reach(side: Side, target: THREE.Vector3, pole: THREE.Vector3, weight: number): void {
    const upper = this.bone(`${side}UpperArm`), lower = this.bone(`${side}LowerArm`), hand = this.bone(`${side}Hand`);
    if (!upper || !lower || !hand || weight <= 0) return;
    this.root.updateMatrixWorld(true);
    const a = upper.getWorldPosition(V()), b = lower.getWorldPosition(V()), c = hand.getWorldPosition(V());
    const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
    const to = target.clone().sub(a);
    const d = Math.min(to.length(), l1 + l2 - 0.002);
    const dir = to.normalize();
    const hint = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const alpha = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const upperDir = dir.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(hint, Math.sin(alpha)).normalize();
    const elbow = a.clone().addScaledVector(upperDir, l1);
    const foreDir = a.clone().addScaledVector(dir, d).sub(elbow).normalize();
    // the rest direction of the arm in each bone's parent space is along x (T-pose)
    const restDir = V(side === 'left' ? 1 : -1, 0, 0);
    const aim = (node: THREE.Object3D, worldDir: THREE.Vector3) => {
      const parentQ = node.parent!.getWorldQuaternion(new THREE.Quaternion());
      const local = worldDir.clone().applyQuaternion(parentQ.invert());
      const want = new THREE.Quaternion().setFromUnitVectors(restDir, local.normalize());
      node.quaternion.slerp(want, weight);
      node.updateMatrixWorld(true);
    };
    aim(upper, upperDir);
    aim(lower, foreDir);
  }

  private fingers(side: Side, curls: [number, number, number, number], thumb: number): void {
    const s = side === 'left' ? -1 : 1;
    FINGERS.forEach((f, i) => PARTS.forEach((p, j) => {
      this.bone(`${side}${f}${p}`)?.quaternion.setFromEuler(new THREE.Euler(0, 0, s * curls[i] * (j === 0 ? 0.9 : 1.0)));
    }));
    this.bone(`${side}ThumbProximal`)?.quaternion.setFromEuler(new THREE.Euler(0, -s * thumb * 0.6, s * thumb * 0.4));
    this.bone(`${side}ThumbDistal`)?.quaternion.setFromEuler(new THREE.Euler(0, -s * thumb * 0.6, 0));
  }

  apply(s: CharacterState): void {
    const t = s.t, w = clamp(s.walk ?? 0), ph = s.walkPhase ?? 0;
    this.root.position.copy(s.position);
    this.root.rotation.set(0, s.yaw, 0);
    this.resetPose();
    const rot = (name: string, x: number, y: number, z: number) => {
      const n = this.bone(name); if (n) n.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
    };
    // breathing, walking
    const breath = Math.sin(t * 1.9);
    const hips = this.bone('hips');
    if (hips) hips.position.y += Math.abs(Math.sin(ph)) * 0.025 * w;
    rot('hips', 0, Math.sin(ph) * 0.08 * w, 0);
    rot('spine', 0.03 * w + breath * 0.008, -Math.sin(ph) * 0.1 * w, 0);
    rot('chest', breath * 0.012, 0, 0);
    for (const [side, k] of [['left', -1], ['right', 1]] as const) {
      const swing = Math.sin(ph) * 0.45 * w * k;
      rot(`${side}UpperLeg`, -swing, 0, 0);
      rot(`${side}LowerLeg`, Math.max(0, Math.sin(ph + (k > 0 ? 0 : Math.PI) - 1.1)) * 0.8 * w, 0, 0);
      rot(`${side}Foot`, swing * 0.2, 0, 0);
      // arms down by the sides from the T-pose, swinging when walking
      const sgn = side === 'left' ? -1 : 1;
      rot(`${side}UpperArm`, 0, 0, sgn * 1.2);
      rot(`${side}UpperArm`, swing * 0.6 + Math.sin(t * 1.1 + k) * 0.015, 0, 0);
      rot(`${side}LowerArm`, 0, sgn * 0.25, 0);
      this.fingers(side, [0.35, 0.45, 0.55, 0.6], 0.3);
    }
    // gestures
    const g = s.gesture, gw = g ? clamp(g.weight) : 0;
    if (g && gw > 0.01) {
      this.root.updateMatrixWorld(true);
      const chest = this.bone('upperChest') ?? this.bone('chest')!;
      const at = (x: number, y: number, z: number) => chest.localToWorld(V(x, y, z));
      const pole = (x: number, y: number, z: number) => V(x, y, z).applyQuaternion(this.root.quaternion);
      const gt = g.time;
      switch (g.name) {
        case 'point': {
          const sh = this.bone('rightUpperArm')!.getWorldPosition(V());
          const target = g.target ?? at(-0.3, 0.1, 0.8);
          this.reach('right', sh.clone().addScaledVector(target.clone().sub(sh).normalize(), 0.6), pole(-0.5, -0.7, -0.3), gw);
          this.fingers('right', [0, 1.4, 1.4, 1.4], 1.0);
          break;
        }
        case 'explain': {
          const a = Math.sin(gt * 3.1) * 0.03, b = Math.sin(gt * 2.3 + 1) * 0.03;
          this.reach('right', at(-0.2 + a, -0.15 + b, 0.3), pole(-0.6, -0.7, -0.2), gw);
          this.reach('left', at(0.22 - b, -0.13 + a, 0.28), pole(0.6, -0.7, -0.2), gw);
          this.fingers('right', [0.1, 0.1, 0.15, 0.2], -0.1); this.fingers('left', [0.1, 0.1, 0.15, 0.2], -0.1);
          break;
        }
        case 'present': this.reach('left', at(0.15, -0.12, 0.36), pole(0.6, -0.7, -0.2), gw); this.fingers('left', [0.1, 0.1, 0.1, 0.15], -0.1); break;
        case 'vision': {
          const eye = this.bone('head')!.localToWorld((this.vrm.lookAt?.offsetFromHeadBone ?? V(0, 0.06, 0.04)).clone().add(V(-0.05, -0.02, 0.06)));
          this.reach('right', eye, pole(-0.7, -0.6, -0.1), gw);
          this.fingers('right', [0, 1.3, 1.4, 1.4], 0.9);
          break;
        }
        case 'think': {
          const chin = this.bone('head')!.localToWorld(V(0, -0.03, 0.09));
          this.reach('right', chin, pole(-0.4, -0.9, 0.2), gw);
          this.fingers('right', [0.6, 1.0, 1.2, 1.3], 0.3);
          break;
        }
        case 'thumbsUp': this.reach('right', at(-0.12, -0.05, 0.3), pole(-0.6, -0.7, -0.2), gw); this.fingers('right', [1.5, 1.5, 1.5, 1.5], -0.6); break;
        case 'wave': this.reach('right', at(-0.32 + Math.sin(gt * 9) * 0.05, 0.3, 0.12), pole(-0.8, -0.4, 0), gw); this.fingers('right', [0.05, 0.05, 0.05, 0.1], -0.2); break;
        case 'celebrate':
          this.reach('right', at(-0.25, 0.45, 0.1), pole(-0.8, -0.3, 0), gw); this.reach('left', at(0.25, 0.45, 0.1), pole(0.8, -0.3, 0), gw);
          this.fingers('right', [1.5, 1.5, 1.5, 1.5], 1.0); this.fingers('left', [1.5, 1.5, 1.5, 1.5], 1.0); break;
        case 'nod': rot('head', Math.max(0, Math.sin(gt * 7)) * 0.18 * gw * Math.max(0, 1 - gt / 1.2), 0, 0); break;
        default: break;
      }
    }
    // head and eyes
    if (s.lookAt) {
      this.lookTarget.position.copy(this.root.worldToLocal(s.lookAt.clone()));
      const local = this.lookTarget.position.clone().sub(V(0, this.height * 0.92, 0));
      const yaw = clamp(Math.atan2(local.x, local.z), -0.8, 0.8), pitch = clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.4, 0.35);
      rot('neck', pitch * 0.4, yaw * 0.4, 0);
      rot('head', pitch * 0.5, yaw * 0.5, Math.sin(t * 0.6) * 0.02);
    } else {
      this.lookTarget.position.set(0, this.height * 0.92, 2);
    }
    // face: expression, blink, mouth
    const em = this.vrm.expressionManager;
    if (em) {
      for (const name of ALL_EXPRESSIONS) em.setValue(name, 0);
      for (const [name, v] of EXPRESSIONS[s.expression ?? 'calm'] ?? []) em.setValue(name, v);
      const smiling = s.expression === 'smile' || s.expression === 'happy';
      em.setValue('blink', smiling ? 0 : clamp(s.blink ?? 0));
      const m = clamp(s.mouth ?? 0);
      const shape = Math.floor(t * 9) % 3;
      em.setValue('aa', m * (shape === 0 ? 0.9 : 0.5));
      em.setValue('oh', m * (shape === 1 ? 0.6 : 0.1));
      em.setValue('ih', m * (shape === 2 ? 0.5 : 0.1));
    }
    if (this.lens) { const v = clamp(s.vision ?? 0); this.lens.opacity = 0.08 + v * 0.55; this.lens.color.setHex(0x9fe8ff).multiplyScalar(1 + v * 0.6); }
    // let the model apply it: bones, expressions, look-at, hair physics. A jump in time (a new
    // part of the video, or a still) settles the hair over a second first, so parts match.
    const step = 1 / FPS;
    if (this.lastT < 0 || Math.abs(t - this.lastT - step) > 1e-3) {
      this.vrm.springBoneManager?.reset();
      for (let i = 0; i < FPS; i++) this.vrm.update(step);
    }
    this.vrm.update(step);
    this.lastT = t;
  }

  headWorld(out = V()): THREE.Vector3 { return (this.bone('head') ?? this.root).getWorldPosition(out).add(V(0, 0.08, 0)); }
  handWorld(side: 'L' | 'R', out = V()): THREE.Vector3 { return (this.bone(side === 'L' ? 'leftHand' : 'rightHand') ?? this.root).getWorldPosition(out); }
}

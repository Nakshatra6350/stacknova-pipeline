// A character drawn from a rigged glTF/GLB model. It fulfils the same CharacterRig contract as the
// code-built characters, so a production model can replace them by editing characters.json only.
// Animation clips play through an AnimationMixer whose time is set from the story time, so a
// frame drawn at t always looks the same (needed to draw a video in parts).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CharacterConfig, CharacterRig, CharacterState, Gesture } from './types';
import { clamp, V } from '../util/math';

export class GltfCharacter implements CharacterRig {
  readonly root = new THREE.Group();
  readonly height: number;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private bones: Record<string, THREE.Object3D | undefined> = {};
  private morphMeshes: THREE.Mesh[] = [];

  private constructor(private cfg: CharacterConfig, model: THREE.Object3D, clips: THREE.AnimationClip[], height: number) {
    this.height = height;
    model.scale.setScalar(cfg.scale ?? 1);
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      action.play(); action.enabled = true; action.setEffectiveWeight(0);
      this.actions.set(clip.name, action);
    }
    for (const [role, name] of Object.entries(cfg.bones ?? {})) if (name) this.bones[role] = model.getObjectByName(name);
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary) this.morphMeshes.push(mesh);
    });
  }

  static async load(cfg: CharacterConfig, height: number): Promise<GltfCharacter> {
    if (!cfg.url) throw new Error('a gltf character needs a url');
    const gltf = await new GLTFLoader().loadAsync(cfg.url);
    return new GltfCharacter(cfg, gltf.scene, gltf.animations, height);
  }

  private clip(role: 'idle' | 'walk' | Gesture): THREE.AnimationAction | undefined {
    const name = this.cfg.clips?.[role];
    return name ? this.actions.get(name) : undefined;
  }

  private morph(role: string, value: number): void {
    const name = (this.cfg.morphs as Record<string, string | undefined> | undefined)?.[role];
    if (!name) return;
    for (const mesh of this.morphMeshes) {
      const index = mesh.morphTargetDictionary?.[name];
      if (index !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = value;
    }
  }

  apply(s: CharacterState): void {
    this.root.position.copy(s.position);
    this.root.rotation.set(0, s.yaw, 0);
    for (const action of this.actions.values()) action.setEffectiveWeight(0);
    const walk = clamp(s.walk ?? 0);
    const idle = this.clip('idle'), walking = this.clip('walk');
    if (idle) { idle.setEffectiveWeight(1 - walk); idle.time = s.t % idle.getClip().duration; }
    if (walking) { walking.setEffectiveWeight(walk); walking.time = ((s.walkPhase ?? 0) / (Math.PI * 2)) * walking.getClip().duration % walking.getClip().duration; }
    const g = s.gesture;
    if (g && g.weight > 0) {
      const action = this.clip(g.name);
      if (action) { action.setEffectiveWeight(clamp(g.weight)); action.time = Math.min(g.time, action.getClip().duration - 1e-3); }
    }
    this.mixer.update(0);
    // head turns toward what the character looks at, on top of the clip
    const head = this.bones.head;
    if (head && s.lookAt) {
      this.root.updateMatrixWorld(true);
      const local = this.root.worldToLocal(s.lookAt.clone());
      head.rotation.y += clamp(Math.atan2(local.x, local.z), -0.9, 0.9) * 0.7;
    }
    // face: blink, mouth and the expression, if the model has those morph targets
    for (const e of Object.keys(this.cfg.morphs ?? {})) if (e !== 'blink' && e !== 'mouth') this.morph(e, 0);
    if (s.expression) this.morph(s.expression, 1);
    this.morph('blink', clamp(s.blink ?? 0));
    this.morph('mouth', clamp(s.mouth ?? 0));
  }

  headWorld(out = V()): THREE.Vector3 {
    return (this.bones.head ?? this.root).getWorldPosition(out).add(this.bones.head ? V() : V(0, this.height * 0.9, 0));
  }
  handWorld(side: 'L' | 'R', out = V()): THREE.Vector3 {
    const bone = side === 'L' ? this.bones.leftHand : this.bones.rightHand;
    return (bone ?? this.root).getWorldPosition(out);
  }
}

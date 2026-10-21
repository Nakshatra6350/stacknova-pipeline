// The contract every character representation fulfils. Scenes, stories and the interactive
// mode only ever talk to a CharacterRig, so the code-built characters can be replaced by rigged
// .glb models (see README) without touching any scene logic.
import type * as THREE from 'three';

export type Expression =
  | 'calm' | 'smile' | 'smirk' | 'surprised' | 'focus' | 'thinking' // the engineer
  | 'happy' | 'confused' | 'panic' | 'sparkle' | 'squint' | 'celebrate' | 'normal'; // Nova

export type Gesture =
  | 'none'
  | 'point'      // aims at `target`
  | 'explain'    // open hands, talking
  | 'think'      // hand to chin
  | 'vision'     // touches the glasses: System Vision
  | 'present'    // offers something on an open palm
  | 'nod'        // acknowledges
  | 'shake'      // shakes the head: no
  | 'wave'
  | 'celebrate'
  | 'thumbsUp'
  | 'panic';

export interface GestureState {
  name: Gesture;
  /** 0..1, how much of the gesture shows over the idle or walking pose. */
  weight: number;
  /** Seconds since the gesture began (drives its own motion). */
  time: number;
  /** World point for 'point', 'present' and the like. */
  target?: THREE.Vector3;
}

export interface CharacterState {
  t: number;
  position: THREE.Vector3;
  /** Facing, radians about +Y; 0 faces +Z (toward the default camera). */
  yaw: number;
  /** 0..1 walking amount and the phase of the walk cycle (radians). */
  walk?: number;
  walkPhase?: number;
  gesture?: GestureState;
  /** World point the head and eyes turn toward. */
  lookAt?: THREE.Vector3 | null;
  expression?: Expression;
  /** Seconds since `expression` began (drives reactions such as a start). */
  expressionTime?: number;
  /** 0..1 mouth opening (from the voice) and eyelids (1 closed). */
  mouth?: number;
  /** 0..1 how much the character is speaking, and how stressed the syllable being said is (from the voice). */
  talk?: number;
  emphasis?: number;
  blink?: number;
  /** 0..1 System Vision: the glasses light up. */
  vision?: number;
  /** Nova only: a small hop, or how much it tilts. */
  hop?: number;
  tilt?: number;
  /** 0..1 how much of the character has appeared (a 2.5D character materialises instead of walking in). */
  appear?: number;
  /** World position of the camera for this frame (a 2.5D character turns to face it). */
  camera?: THREE.Vector3;
}

export interface CharacterRig {
  readonly root: THREE.Object3D;
  /** Standing height in metres (Nova: its size). */
  readonly height: number;
  /** False when the character cannot walk (a 2.5D illustration): the story makes it appear instead. */
  readonly canWalk?: boolean;
  /** Cameras keep at least this far from the character's head (a 2.5D illustration blurs closer). */
  readonly minShotDistance?: number;
  apply(state: CharacterState): void;
  headWorld(out?: THREE.Vector3): THREE.Vector3;
  handWorld(side: 'L' | 'R', out?: THREE.Vector3): THREE.Vector3;
}

/** How a character is drawn: built in code, or a rigged glTF model. */
export interface CharacterConfig {
  kind: 'procedural' | 'gltf' | 'vrm' | 'sprite';
  /** gltf: model URL, the name of its bones, its clips and its face morphs. */
  url?: string;
  scale?: number;
  bones?: Partial<Record<'hips' | 'spine' | 'chest' | 'neck' | 'head' | 'rightArm' | 'rightForeArm' | 'rightHand' | 'leftArm' | 'leftForeArm' | 'leftHand', string>>;
  clips?: Partial<Record<'idle' | 'walk' | Gesture, string>>;
  morphs?: Partial<Record<'blink' | 'mouth' | Expression, string>>;
  /** vrm: add glasses / a backpack when the model has none, and tune the glasses' fit. */
  glasses?: boolean;
  glassesOffset?: [number, number, number];
  glassesScale?: number;
  backpack?: boolean;
  rim?: number;
}

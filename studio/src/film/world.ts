// What a film needs from a world: named places, a way to register world beats, and a draw at t.
import type * as THREE from 'three';
import type { WorldOp } from './types';
import { HashMapFilm } from '../world/hashmapFilm';

export interface FilmWorld {
  /** A named place ("bucket:7"), or null when the world has no such place. */
  place(name: string): THREE.Vector3 | null;
  /** The direction a camera stands in when it looks at a place "from the front". */
  facing(name: string): THREE.Vector3;
  op(op: WorldOp, at: number, until?: number): void;
  update(t: number, camera: THREE.Camera): { vision: number };
}

export function makeWorld(name: string, scene: THREE.Scene): FilmWorld {
  switch (name) {
    case 'hashmap': return new HashMapFilm(scene);
    // episode 008: a table of five rows, each tube a row, each slab a row version
    case 'mvcc': return new HashMapFilm(scene, { count: 5, arc: 64, radius: 3.4, tube: 0.34, slab: 0.56, label: (i) => `id ${i + 1}` });
    default: throw new Error(`no world called ${name}`);
  }
}

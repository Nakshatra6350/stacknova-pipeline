// Picks how each character is drawn, from public/characters.json: built in code (the default) or a
// rigged glTF model. Everything else in the studio only sees the CharacterRig contract.
import type { CharacterConfig, CharacterRig } from './types';
import { ProceduralEngineer } from './engineer';
import { ProceduralNova } from './nova';
import { GltfCharacter } from './gltf';

export interface Cast { engineer: CharacterRig; nova: CharacterRig }

const DEFAULT: Record<keyof Cast, CharacterConfig> = { engineer: { kind: 'procedural' }, nova: { kind: 'procedural' } };

async function readConfig(): Promise<Record<keyof Cast, CharacterConfig>> {
  try {
    const reply = await fetch(new URL('characters.json', document.baseURI));
    if (!reply.ok) return DEFAULT;
    return { ...DEFAULT, ...(await reply.json()) };
  } catch {
    return DEFAULT;
  }
}

export async function loadCast(): Promise<Cast> {
  const cfg = await readConfig();
  const engineer = cfg.engineer.kind === 'gltf' ? await GltfCharacter.load(cfg.engineer, 1.8) : new ProceduralEngineer();
  const nova = cfg.nova.kind === 'gltf' ? await GltfCharacter.load(cfg.nova, 0.4) : new ProceduralNova();
  return { engineer, nova };
}

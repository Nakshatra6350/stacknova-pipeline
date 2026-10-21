// Picks how each character is drawn, from public/characters.json: built in code (the default) or a
// rigged glTF model. Everything else in the studio only sees the CharacterRig contract.
import type { CharacterConfig, CharacterRig } from './types';
import { ProceduralEngineer } from './engineer';
import { ProceduralNova } from './nova';
import { GltfCharacter } from './gltf';
import { VrmCharacter } from './vrm';
import { SpriteCharacter } from './sprite';

export interface Cast { engineer: CharacterRig; nova: CharacterRig }

const DEFAULT: Record<keyof Cast, CharacterConfig> = { engineer: { kind: 'procedural' }, nova: { kind: 'procedural' } };

/** public/local/characters.json (not committed: it points at the private model) wins over
 *  public/characters.json. */
async function readConfig(): Promise<Record<keyof Cast, CharacterConfig>> {
  for (const path of ['local/characters.json', 'characters.json']) {
    try {
      const reply = await fetch(new URL(path, document.baseURI));
      if (reply.ok) return { ...DEFAULT, ...(await reply.json()) };
    } catch {
      // try the next one
    }
  }
  return DEFAULT;
}

export async function loadCast(): Promise<Cast> {
  const cfg = await readConfig();
  const make = async (c: CharacterConfig, height: number, fallback: () => CharacterRig): Promise<CharacterRig> => {
    if (c.kind === 'vrm' && c.url) return VrmCharacter.load({ ...c, url: c.url });
    if (c.kind === 'sprite' && c.url) return SpriteCharacter.load(c.url, height);
    if (c.kind === 'gltf') return GltfCharacter.load(c, height);
    return fallback();
  };
  const engineer = await make(cfg.engineer, 1.8, () => new ProceduralEngineer());
  const nova = await make(cfg.nova, 0.4, () => new ProceduralNova());
  return { engineer, nova };
}

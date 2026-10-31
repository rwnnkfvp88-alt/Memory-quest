import { idFromRng } from '../core/ids';
import { BLOCKING_PROPS } from '../core/props';
import { randomAppearance, randomVillagerName } from '../core/creatures';
import type { Rng } from '../core/rng';
import { Biome, type CharacterObject, type PropObject, type TileGrid } from '../core/types';

const WALKABLE = new Set<number>([Biome.Sand, Biome.Grass, Biome.Forest, Biome.Hills]);

export interface Meadow {
  x: number;
  z: number;
  free: number;
}

/** Find the most open grassland spots (by free walkable tiles in a 9x9 window), best first. */
export function findMeadows(grid: TileGrid, props: PropObject[]): Meadow[] {
  const n = grid.size;
  const blocked = new Uint8Array(n * n);
  for (const p of props) {
    if (BLOCKING_PROPS.has(p.type)) blocked[Math.floor(p.z) * n + Math.floor(p.x)] = 1;
  }
  const free = (x: number, z: number): boolean => {
    if (x < 0 || z < 0 || x >= n || z >= n) return false;
    const i = z * n + x;
    return !blocked[i] && WALKABLE.has(grid.biome[i]);
  };
  const out: Meadow[] = [];
  for (let z = 4; z < n - 4; z += 2) {
    for (let x = 4; x < n - 4; x += 2) {
      if (grid.biome[z * n + x] !== Biome.Grass || !free(x, z)) continue;
      let count = 0;
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) if (free(x + dx, z + dz)) count++;
      out.push({ x, z, free: count });
    }
  }
  const c = n / 2;
  out.sort((a, b) => b.free - a.free || Math.hypot(a.x - c, a.z - c) - Math.hypot(b.x - c, b.z - c));
  return out;
}

export function generateCreatures(grid: TileGrid, props: PropObject[], rng: Rng, idRng: Rng, meadows: Meadow[]): CharacterObject[] {
  const n = grid.size;
  const blocked = new Uint8Array(n * n);
  for (const p of props) if (BLOCKING_PROPS.has(p.type)) blocked[Math.floor(p.z) * n + Math.floor(p.x)] = 1;
  const taken = new Set<number>();
  const out: CharacterObject[] = [];

  const spawnAround = (cx: number, cz: number, count: number, species: 'villager' | 'sheep'): void => {
    let placed = 0;
    for (let attempt = 0; attempt < count * 40 && placed < count; attempt++) {
      const tx = Math.floor(cx + rng.range(-3.5, 3.5));
      const tz = Math.floor(cz + rng.range(-3.5, 3.5));
      if (tx < 0 || tz < 0 || tx >= n || tz >= n) continue;
      const i = tz * n + tx;
      if (blocked[i] || taken.has(i) || !WALKABLE.has(grid.biome[i])) continue;
      taken.add(i);
      out.push({
        id: idFromRng('character', idRng),
        kind: 'character',
        species,
        name: species === 'villager' ? randomVillagerName(rng) : 'Sheep',
        x: tx + 0.5,
        z: tz + 0.5,
        appearance: randomAppearance(rng),
      });
      placed++;
    }
  };

  const chosen: Meadow[] = [];
  for (const m of meadows) {
    if (chosen.length >= 3) break;
    if (chosen.every((c) => Math.hypot(c.x - m.x, c.z - m.z) >= 12)) chosen.push(m);
  }
  const villagers = Math.max(4, Math.round(n / 10));
  if (chosen[0]) spawnAround(chosen[0].x, chosen[0].z, villagers, 'villager');
  if (chosen[1]) spawnAround(chosen[1].x, chosen[1].z, 5, 'sheep');
  if (chosen[2]) spawnAround(chosen[2].x, chosen[2].z, 4, 'sheep');
  return out;
}

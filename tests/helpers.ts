import { footprintRect } from '../src/core/buildingDefs';
import { generateWorld } from '../src/generation';
import { Biome, type BuildingTypeId, type World } from '../src/core/types';
import { validateBuildingPlacement } from '../src/editing/placement';

export const TEST_ID = 'world_testtesttest';

export function makeWorld(seed = 'mnemosyne', terrain: 'temperate' | 'highlands' | 'islands' | 'plains' = 'temperate', size: 'small' | 'medium' | 'large' = 'medium'): World {
  return generateWorld({ seed, size, terrain }, { id: TEST_ID, now: 1_700_000_000_000 });
}

/** Scan for the first spot where a building validates, optionally skipping the first `skip` hits. */
export function findSpot(world: World, type: BuildingTypeId, rotation = 0, skip = 0): { x: number; z: number } {
  let seen = 0;
  for (let z = 0; z < world.size; z++) {
    for (let x = 0; x < world.size; x++) {
      if (validateBuildingPlacement(world, type, rotation, x, z).ok) {
        if (seen++ === skip) return { x, z };
      }
    }
  }
  throw new Error(`no valid spot for ${type}`);
}

export function findTile(world: World, biome: number): { x: number; z: number } {
  for (let z = 1; z < world.size - 1; z++) {
    for (let x = 1; x < world.size - 1; x++) if (world.tiles.biome[z * world.size + x] === biome) return { x, z };
  }
  throw new Error(`no tile of biome ${biome}`);
}

export const BIOMES = Biome;
export { footprintRect };

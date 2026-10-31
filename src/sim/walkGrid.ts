import { MAX_WALK_STEP } from '../core/constants';
import { vertexHeights } from '../core/heightfield';
import { getObjectIndex } from '../core/objectIndex';
import { Biome, type World } from '../core/types';

const WALKABLE_BIOMES = new Set<number>([Biome.Sand, Biome.Grass, Biome.Forest, Biome.Hills]);

export interface WalkGrid {
  size: number;
  walkable: Uint8Array;
  /** Surface height at each tile centre. */
  height: Float32Array;
}

/** Which tiles a creature may stand on: dry open ground with no building or tree on it. */
export function buildWalkGrid(world: World): WalkGrid {
  const n = world.size;
  const vs = n + 1;
  const vh = vertexHeights(world.tiles);
  const index = getObjectIndex(world);
  const walkable = new Uint8Array(n * n);
  const height = new Float32Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      height[i] = (vh[z * vs + x] + vh[z * vs + x + 1] + vh[(z + 1) * vs + x] + vh[(z + 1) * vs + x + 1]) / 4;
      walkable[i] = WALKABLE_BIOMES.has(world.tiles.biome[i]) && !index.blocked[i] ? 1 : 0;
    }
  }
  return { size: n, walkable, height };
}

export function isWalkable(grid: WalkGrid, tx: number, tz: number): boolean {
  return tx >= 0 && tz >= 0 && tx < grid.size && tz < grid.size && grid.walkable[tz * grid.size + tx] === 1;
}

export function stepAllowed(grid: WalkGrid, from: number, to: number): boolean {
  return Math.abs(grid.height[from] - grid.height[to]) <= MAX_WALK_STEP;
}

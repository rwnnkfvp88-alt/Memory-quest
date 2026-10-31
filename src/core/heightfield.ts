import { RIVER_WATER_OFFSET, SEA_Q, qToHeight } from './constants';
import { Biome, type TileGrid } from './types';

/**
 * Terrain is stored per tile but rendered/sampled as a smooth vertex grid of (size+1)^2 points.
 * A vertex touching a river tile takes only the river bed height, which cuts a clean valley:
 * the bank tiles slope down to the water instead of hiding it.
 */
/** Height of the sea floor at the very edge of the world (always below sea level). */
export const EDGE_FLOOR = qToHeight(SEA_Q - 38);

const cache = new WeakMap<TileGrid, Float32Array>();

export function isWaterBiome(b: number): boolean {
  return b === Biome.DeepWater || b === Biome.ShallowWater;
}

export function vertexHeights(tiles: TileGrid): Float32Array {
  const hit = cache.get(tiles);
  if (hit) return hit;
  const n = tiles.size;
  const vs = n + 1;
  const out = new Float32Array(vs * vs);
  for (let vz = 0; vz < vs; vz++) {
    for (let vx = 0; vx < vs; vx++) {
      let sum = 0;
      let count = 0;
      let riverSum = 0;
      let riverCount = 0;
      for (let k = 0; k < 4; k++) {
        const tx = vx - 1 + (k & 1);
        const tz = vz - 1 + (k >> 1);
        if (tx < 0 || tz < 0 || tx >= n || tz >= n) continue;
        const i = tz * n + tx;
        const h = qToHeight(tiles.height[i]);
        sum += h;
        count++;
        if (tiles.biome[i] === Biome.River) {
          riverSum += h;
          riverCount++;
        }
      }
      const h = riverCount > 0 ? riverSum / riverCount : sum / count;
      // The outermost ring is always sea: hold it at one flat depth so the cut-away edge reads as a clean slab.
      const onEdge = vx === 0 || vz === 0 || vx === n || vz === n;
      out[vz * vs + vx] = onEdge ? EDGE_FLOOR : h;
    }
  }
  cache.set(tiles, out);
  return out;
}

/** Smooth ground height at a world position (tile units). */
export function heightAt(tiles: TileGrid, x: number, z: number): number {
  const n = tiles.size;
  const vs = n + 1;
  const vh = vertexHeights(tiles);
  const cx = Math.min(Math.max(x, 0), n - 1e-6);
  const cz = Math.min(Math.max(z, 0), n - 1e-6);
  const x0 = Math.floor(cx);
  const z0 = Math.floor(cz);
  const fx = cx - x0;
  const fz = cz - z0;
  const h00 = vh[z0 * vs + x0];
  const h10 = vh[z0 * vs + x0 + 1];
  const h01 = vh[(z0 + 1) * vs + x0];
  const h11 = vh[(z0 + 1) * vs + x0 + 1];
  return h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
}

/** Min and max vertex height across a tile rectangle (inclusive of all its corners). */
export function rectHeightRange(tiles: TileGrid, x0: number, z0: number, w: number, d: number): { min: number; max: number } {
  const vs = tiles.size + 1;
  const vh = vertexHeights(tiles);
  let min = Infinity;
  let max = -Infinity;
  for (let vz = z0; vz <= z0 + d; vz++) {
    for (let vx = x0; vx <= x0 + w; vx++) {
      const h = vh[vz * vs + vx];
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  return { min, max };
}

/** Water surface height for a river tile. */
export function riverWaterLevel(tiles: TileGrid, tileIndex: number): number {
  return qToHeight(tiles.height[tileIndex]) + RIVER_WATER_OFFSET;
}

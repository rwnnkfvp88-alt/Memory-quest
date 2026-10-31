import { SEA_Q, WORLD_SIZES } from '../core/constants';
import { Rng } from '../core/rng';
import { Biome, type GenerationParams, type TerrainType, type TileGrid } from '../core/types';
import { MinHeap } from '../core/heap';
import { Noise2D, clamp01, smoothstep } from './noise';

interface Preset {
  /** Feature frequency in cycles per tile. */
  freq: number;
  /** Fraction of tiles that end up under water. */
  waterFraction: number;
  /** Strength of the fall-off that sinks the map edge into the sea. */
  edge: number;
  /** Weight of ridged mountain ranges. */
  mountain: number;
  /** Share of LAND by elevation band: [sand, grass, hills, mountain, snow]. Sums to 1. */
  shares: readonly [number, number, number, number, number];
  /** Share of grassland that becomes forest. */
  forestShare: number;
}

const PRESETS: Record<TerrainType, Preset> = {
  temperate: { freq: 0.034, waterFraction: 0.28, edge: 0.8, mountain: 0.55, shares: [0.05, 0.58, 0.22, 0.13, 0.02], forestShare: 0.36 },
  highlands: { freq: 0.04, waterFraction: 0.22, edge: 0.7, mountain: 1.1, shares: [0.02, 0.38, 0.3, 0.24, 0.06], forestShare: 0.3 },
  islands: { freq: 0.05, waterFraction: 0.55, edge: 1.1, mountain: 0.5, shares: [0.07, 0.55, 0.22, 0.14, 0.02], forestShare: 0.45 },
  plains: { freq: 0.028, waterFraction: 0.26, edge: 0.75, mountain: 0.15, shares: [0.05, 0.78, 0.13, 0.035, 0.005], forestShare: 0.22 },
};

const DEEP_BAND = 14;
const BEACH_BAND = 5;
const HILL_Q = 150;
const MOUNTAIN_Q = 188;
const SNOW_Q = 232;

export function classifyQ(q: number): number {
  if (q < SEA_Q - DEEP_BAND) return Biome.DeepWater;
  if (q < SEA_Q) return Biome.ShallowWater;
  if (q < SEA_Q + BEACH_BAND) return Biome.Sand;
  if (q >= SNOW_Q) return Biome.Snow;
  if (q >= MOUNTAIN_Q) return Biome.Mountain;
  if (q >= HILL_Q) return Biome.Hills;
  return Biome.Grass;
}

const isWaterQ = (q: number): boolean => q < SEA_Q;

export function generateTiles(params: GenerationParams): TileGrid {
  const n = WORLD_SIZES[params.size];
  const preset = PRESETS[params.terrain];
  const total = n * n;
  const key = `${params.seed}|${params.terrain}|${params.size}`;
  const base = new Noise2D(`${key}|base`);
  const ridge = new Noise2D(`${key}|ridge`);
  const wet = new Noise2D(`${key}|moisture`);
  const f = preset.freq;

  // 1. Raw height field.
  const raw = new Float32Array(total);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n - 0.5;
      const v = (z + 0.5) / n - 0.5;
      const broad = base.fbm(x * f, z * f, 5) * 0.5 + 0.5;
      const mask = clamp01((ridge.fbm(x * f * 0.45 + 31.7, z * f * 0.45 + 11.3, 3) + 0.12) * 1.9);
      const crest = ridge.ridged(x * f * 0.9, z * f * 0.9, 4);
      let h = broad * 0.8 + preset.mountain * mask * crest * crest * 0.55;
      const square = Math.max(Math.abs(u), Math.abs(v)) * 2;
      const radial = Math.hypot(u, v) * 2;
      h -= smoothstep(0.5, 0.98, square * 0.4 + radial * 0.6) * preset.edge * 0.95;
      // Guaranteed 2-tile moat, so the world is always a bounded diorama surrounded by sea.
      if (Math.min(x, z, n - 1 - x, n - 1 - z) < 2) h -= 4;
      raw[z * n + x] = h;
    }
  }

  // 2. Rank-based remap: the noise decides WHERE things are, the preset decides HOW MUCH of each
  //    elevation band exists. Rank order is preserved, so the landscape's shape is untouched.
  const order = Uint32Array.from({ length: total }, (_, i) => i).sort((a, b) => raw[a] - raw[b] || a - b);
  const waterCount = Math.floor(preset.waterFraction * total);
  const landCount = total - waterCount;
  const height = new Uint8Array(total);
  const BAND_Q: ReadonlyArray<readonly [number, number]> = [
    [SEA_Q + 1, SEA_Q + BEACH_BAND],
    [SEA_Q + BEACH_BAND, HILL_Q],
    [HILL_Q, MOUNTAIN_Q],
    [MOUNTAIN_Q, SNOW_Q],
    [SNOW_Q, 255],
  ];
  for (let rank = 0; rank < total; rank++) {
    const i = order[rank];
    let q: number;
    if (rank < waterCount) {
      q = 18 + ((SEA_Q - 1 - 18) * rank) / Math.max(1, waterCount - 1);
    } else {
      const r = (rank - waterCount) / Math.max(1, landCount - 1); // 0..1 across land
      let acc = 0;
      q = 255;
      for (let b = 0; b < BAND_Q.length; b++) {
        const share = preset.shares[b];
        if (r <= acc + share || b === BAND_Q.length - 1) {
          const t = share > 0 ? (r - acc) / share : 0;
          q = BAND_Q[b][0] + clamp01(t) * (BAND_Q[b][1] - BAND_Q[b][0]);
          break;
        }
        acc += share;
      }
    }
    height[i] = Math.min(255, Math.max(0, Math.round(q)));
  }

  const biome = new Uint8Array(total);
  for (let i = 0; i < total; i++) biome[i] = classifyQ(height[i]);
  const grid: TileGrid = { size: n, height, biome };

  // 3. Rivers cut valleys and override biomes.
  carveRivers(grid, new Rng(`${key}|rivers`));

  // 4. Forests: wettest grassland.
  const moisture = new Float32Array(total);
  const grassTiles: number[] = [];
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      moisture[i] = wet.fbm(x * 0.07 + 400, z * 0.07 + 400, 4);
      if (biome[i] === Biome.Grass) grassTiles.push(i);
    }
  }
  grassTiles.sort((a, b) => moisture[b] - moisture[a] || a - b);
  const forestCount = Math.floor(grassTiles.length * preset.forestShare);
  for (let k = 0; k < forestCount; k++) biome[grassTiles[k]] = Biome.Forest;

  return grid;
}

const NEIGHBORS4: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Rivers follow a priority-flood drainage map: every land tile gets a "receiver" it drains
 * into, guaranteeing each river reaches water (or the map edge) without dead-ending in pits.
 * Beds are carved so they never rise going downstream.
 */
export function carveRivers(grid: TileGrid, rng: Rng): void {
  const n = grid.size;
  const total = n * n;
  const { height, biome } = grid;

  const fill = new Float32Array(total).fill(Infinity);
  const receiver = new Int32Array(total).fill(-2); // -2 unvisited, -1 sink
  const heap = new MinHeap();
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      const border = x === 0 || z === 0 || x === n - 1 || z === n - 1;
      if (isWaterQ(height[i]) || border) {
        fill[i] = height[i];
        receiver[i] = -1;
        heap.push(i, height[i]);
      }
    }
  }
  while (heap.size > 0) {
    const cur = heap.pop();
    const cx = cur % n;
    const cz = (cur - cx) / n;
    for (const [dx, dz] of NEIGHBORS4) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const ni = nz * n + nx;
      if (receiver[ni] !== -2) continue;
      receiver[ni] = cur;
      fill[ni] = Math.max(height[ni], fill[cur]);
      heap.push(ni, fill[ni]);
    }
  }

  const target = Math.min(6, Math.max(2, Math.round(n / 14)));
  const minSpacing = Math.max(8, Math.floor(n / 6));
  const candidates: number[] = [];
  for (let i = 0; i < total; i++) {
    const b = biome[i];
    if ((b === Biome.Hills || b === Biome.Mountain) && height[i] < SNOW_Q - 6) candidates.push(i);
  }
  rng.shuffle(candidates);

  const isRiver = new Uint8Array(total);
  const sources: number[] = [];
  let made = 0;
  for (const src of candidates) {
    if (made >= target) break;
    const sx = src % n;
    const sz = (src - sx) / n;
    if (sources.some((s) => Math.max(Math.abs((s % n) - sx), Math.abs(Math.floor(s / n) - sz)) < minSpacing)) continue;

    // Follow the drainage map to the sea. If we meet an existing river we keep going along it, so a
    // tributary shares its parent's tail and flow stays monotone through every junction.
    const path: number[] = [src];
    let cur = src;
    for (let guard = 0; guard < n * 6; guard++) {
      const next = receiver[cur];
      if (next < 0) break; // cur is a border sink
      if (isWaterQ(height[next])) break; // reached the sea or a lake
      path.push(next);
      cur = next;
    }
    const fresh = path.filter((t) => !isRiver[t]).length;
    if (fresh < (fresh === path.length ? 10 : 8)) continue;

    let bed = Infinity;
    for (const t of path) {
      const surface = isRiver[t] ? height[t] : height[t] - 1; // an existing bed is already carved
      bed = Math.max(SEA_Q, Math.min(bed, surface));
      height[t] = bed;
      biome[t] = Biome.River;
      isRiver[t] = 1;
    }
    sources.push(src);
    made++;
  }
}

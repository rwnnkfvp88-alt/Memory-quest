import * as THREE from 'three';
import { RIVER_WATER_OFFSET, qToHeight } from '../core/constants';
import { vertexHeights } from '../core/heightfield';
import { Biome, type TileGrid } from '../core/types';

const BIOME_COLORS: Record<number, THREE.Color> = {
  [Biome.DeepWater]: new THREE.Color('#2b5f7a'),
  [Biome.ShallowWater]: new THREE.Color('#79b0a8'),
  [Biome.River]: new THREE.Color('#5f93a6'),
  [Biome.Sand]: new THREE.Color('#e0cf98'),
  [Biome.Grass]: new THREE.Color('#82b457'),
  [Biome.Forest]: new THREE.Color('#5c9145'),
  [Biome.Hills]: new THREE.Color('#a3a868'),
  [Biome.Mountain]: new THREE.Color('#8f8a84'),
  [Biome.Snow]: new THREE.Color('#f3f6f8'),
};
const ROCK = new THREE.Color('#8c8780');
const EARTH_TOP = new THREE.Color('#6a5441');
const EARTH_BOTTOM = new THREE.Color('#3a2c22');
export const SKIRT_BOTTOM = -1.4;

const hash2 = (x: number, z: number): number => {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * Flat-shaded terrain mesh: two triangles per tile (diagonal chosen to follow the ground), one
 * colour per tile with slope-driven rock reveal, plus an earth skirt so the world reads as a
 * floating diorama.
 */
export function buildTerrainGeometry(tiles: TileGrid): THREE.BufferGeometry {
  const n = tiles.size;
  const vs = n + 1;
  const vh = vertexHeights(tiles);
  const skirtQuads = n * 4;
  const triCount = n * n * 2 + skirtQuads * 2;
  const pos = new Float32Array(triCount * 9);
  const col = new Float32Array(triCount * 9);
  let p = 0;
  const tmp = new THREE.Color();

  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number], ca: THREE.Color, cb: THREE.Color = ca, cc: THREE.Color = ca): void => {
    pos.set([...a, ...b, ...c], p);
    col.set([ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b], p);
    p += 9;
  };

  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      const h00 = vh[z * vs + x];
      const h10 = vh[z * vs + x + 1];
      const h01 = vh[(z + 1) * vs + x];
      const h11 = vh[(z + 1) * vs + x + 1];
      const biome = tiles.biome[i];
      const q = tiles.height[i];
      const base = BIOME_COLORS[biome];
      const slope = Math.max(h00, h10, h01, h11) - Math.min(h00, h10, h01, h11);

      tmp.copy(base);
      if (biome === Biome.Mountain || biome === Biome.Hills) {
        // Higher ground fades toward cold rock.
        tmp.lerp(new THREE.Color('#b9b6b0'), Math.min(0.5, Math.max(0, (q - 150) / 180)));
      } else if (biome === Biome.Grass || biome === Biome.Forest) {
        tmp.lerp(new THREE.Color('#a8c767'), Math.max(0, 0.25 - (q - 86) / 280));
      }
      if (biome !== Biome.Snow && biome !== Biome.Sand && slope > 0.55) tmp.lerp(ROCK, Math.min(0.6, (slope - 0.55) * 0.7));
      const jitter = 0.94 + hash2(x, z) * 0.12;
      tmp.multiplyScalar(jitter);

      const c1 = tmp.clone();
      const c2 = tmp.clone().multiplyScalar(0.985 + hash2(z, x) * 0.03);
      if (Math.abs(h00 - h11) <= Math.abs(h10 - h01)) {
        tri([x, h00, z], [x, h01, z + 1], [x + 1, h11, z + 1], c1);
        tri([x, h00, z], [x + 1, h11, z + 1], [x + 1, h10, z], c2);
      } else {
        tri([x, h00, z], [x, h01, z + 1], [x + 1, h10, z], c1);
        tri([x + 1, h10, z], [x, h01, z + 1], [x + 1, h11, z + 1], c2);
      }
    }
  }

  // Earth skirt on all four sides, wound to face outward.
  const wall = (ax: number, az: number, bx: number, bz: number, ha: number, hb: number, ox: number, oz: number): void => {
    const A: [number, number, number] = [ax, ha, az];
    const B: [number, number, number] = [bx, hb, bz];
    const A0: [number, number, number] = [ax, SKIRT_BOTTOM, az];
    const B0: [number, number, number] = [bx, SKIRT_BOTTOM, bz];
    const e = new THREE.Vector3(bx - ax, 0, bz - az);
    const flip = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), e).dot(new THREE.Vector3(ox, 0, oz)) > 0;
    const top = EARTH_TOP;
    const bot = EARTH_BOTTOM;
    if (!flip) {
      tri(A, A0, B0, top, bot, bot);
      tri(A, B0, B, top, bot, top);
    } else {
      tri(A, B0, A0, top, bot, bot);
      tri(A, B, B0, top, top, bot);
    }
  };
  for (let i = 0; i < n; i++) {
    wall(i, 0, i + 1, 0, vh[i], vh[i + 1], 0, -1);
    wall(i, n, i + 1, n, vh[n * vs + i], vh[n * vs + i + 1], 0, 1);
    wall(0, i, 0, i + 1, vh[i * vs], vh[(i + 1) * vs], -1, 0);
    wall(n, i, n, i + 1, vh[i * vs + n], vh[(i + 1) * vs + n], 1, 0);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const RIVER_SUB = 4;

/**
 * River water on a 4x sub-grid. Each grid vertex records how many of its four neighbouring tiles
 * are river; bilinear interpolation of that field, thresholded at one half, rounds outer corners
 * and fills inner ones, so a 4-connected stair-step course reads as a smooth bending channel.
 * Straight stretches stay exactly one tile wide. Each tile keeps its own water level, so the
 * surface steps gently downhill toward the sea.
 */
export function buildRiverGeometry(tiles: TileGrid): THREE.BufferGeometry | null {
  const n = tiles.size;
  const vs = n + 1;
  const frac = new Float32Array(vs * vs);
  const level = new Float32Array(vs * vs).fill(Infinity);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      if (tiles.biome[i] !== Biome.River) continue;
      const y = qToHeight(tiles.height[i]) + RIVER_WATER_OFFSET;
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const v = (z + dz) * vs + x + dx;
        frac[v] += 0.25;
        if (y < level[v]) level[v] = y;
      }
    }
  }
  const out: number[] = [];
  const step = 1 / RIVER_SUB;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const a = z * vs + x;
      const f00 = frac[a];
      const f10 = frac[a + 1];
      const f01 = frac[a + vs];
      const f11 = frac[a + vs + 1];
      if (f00 + f10 + f01 + f11 === 0) continue;
      const own = tiles.biome[z * n + x] === Biome.River ? qToHeight(tiles.height[z * n + x]) + RIVER_WATER_OFFSET : Math.min(level[a], level[a + 1], level[a + vs], level[a + vs + 1]);
      for (let sj = 0; sj < RIVER_SUB; sj++) {
        for (let si = 0; si < RIVER_SUB; si++) {
          const u = (si + 0.5) * step;
          const v = (sj + 0.5) * step;
          const val = f00 * (1 - u) * (1 - v) + f10 * u * (1 - v) + f01 * (1 - u) * v + f11 * u * v;
          if (val < 0.5 - 1e-6) continue;
          const x0 = x + si * step;
          const z0 = z + sj * step;
          out.push(x0, own, z0, x0, own, z0 + step, x0 + step, own, z0 + step, x0, own, z0, x0 + step, own, z0 + step, x0 + step, own, z0);
        }
      }
    }
  }
  if (out.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

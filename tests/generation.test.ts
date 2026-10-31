import { describe, expect, it } from 'vitest';
import { WORLD_SIZES, SEA_Q } from '../src/core/constants';
import { isValidId } from '../src/core/ids';
import { BLOCKING_PROPS } from '../src/core/props';
import { Biome, TERRAIN_TYPES, type World } from '../src/core/types';
import { generateWorld } from '../src/generation';
import { makeWorld } from './helpers';

const counts = (w: World): number[] => {
  const c = new Array(9).fill(0);
  for (const b of w.tiles.biome) c[b]++;
  return c;
};

describe('G1 determinism', () => {
  it('same seed + params -> identical terrain and objects', () => {
    const a = makeWorld('castle-keep');
    const b = makeWorld('castle-keep');
    expect(a.tiles.height).toEqual(b.tiles.height);
    expect(a.tiles.biome).toEqual(b.tiles.biome);
    expect(a.objects).toEqual(b.objects);
    expect(a.name).toBe(b.name);
  });
  it('different seeds -> different worlds', () => {
    const a = makeWorld('seed-one');
    const b = makeWorld('seed-two');
    expect(a.tiles.height).not.toEqual(b.tiles.height);
  });
  it('terrain type changes the world', () => {
    const a = makeWorld('same', 'plains');
    const b = makeWorld('same', 'highlands');
    expect(a.tiles.height).not.toEqual(b.tiles.height);
  });
  it('a fresh world id is minted when none is given', () => {
    const a = generateWorld({ seed: 's', size: 'small', terrain: 'plains' });
    const b = generateWorld({ seed: 's', size: 'small', terrain: 'plains' });
    expect(a.id).not.toBe(b.id);
    expect(isValidId(a.id)).toBe(true);
  });
});

describe('G2 landscape content', () => {
  for (const terrain of TERRAIN_TYPES) {
    it(`${terrain}: has water, land, forest, hills, mountains and rivers`, () => {
      const seeds = ['mnemosyne', 'amber-fox-123', 'north-owl-777'];
      const totals = new Array(9).fill(0);
      for (const seed of seeds) counts(makeWorld(seed, terrain)).forEach((c, i) => (totals[i] += c));
      for (const b of [Biome.DeepWater, Biome.ShallowWater, Biome.River, Biome.Sand, Biome.Grass, Biome.Forest, Biome.Hills, Biome.Mountain]) {
        expect(totals[b], `biome ${b}`).toBeGreaterThan(0);
      }
    });
  }

  for (const [name, n] of Object.entries(WORLD_SIZES)) {
    it(`size ${name} produces a ${n}x${n} grid`, () => {
      const w = makeWorld('size-test', 'temperate', name as keyof typeof WORLD_SIZES);
      expect(w.size).toBe(n);
      expect(w.tiles.height.length).toBe(n * n);
      expect(w.tiles.biome.length).toBe(n * n);
    });
  }

  it('the map edge sinks into the sea (a bounded, diorama-like world)', () => {
    for (const terrain of TERRAIN_TYPES) {
      const w = makeWorld('edge', terrain);
      const n = w.size;
      let wet = 0;
      let total = 0;
      for (let i = 0; i < n; i++) {
        for (const idx of [i, (n - 1) * n + i, i * n, i * n + n - 1]) {
          total++;
          if (w.tiles.height[idx] < SEA_Q) wet++;
        }
      }
      expect(wet / total, terrain).toBeGreaterThan(0.85);
    }
  });

  it('rivers always drain downhill to water or the map edge', () => {
    for (const terrain of TERRAIN_TYPES) {
      for (const seed of ['mnemosyne', 'amber-fox-123', 'river-run']) {
        const w = makeWorld(seed, terrain);
        const n = w.size;
        const { height, biome } = w.tiles;
        const reaches = new Map<number, boolean>();
        const drains = (start: number): boolean => {
          // Follow river neighbours whose bed never rises; succeed on touching water/edge.
          const seen = new Set<number>([start]);
          const stack = [start];
          while (stack.length) {
            const cur = stack.pop()!;
            const x = cur % n;
            const z = (cur - x) / n;
            if (x === 0 || z === 0 || x === n - 1 || z === n - 1) return true;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const ni = (z + dz) * n + (x + dx);
              if (biome[ni] === Biome.DeepWater || biome[ni] === Biome.ShallowWater) return true;
              if (biome[ni] === Biome.River && height[ni] <= height[cur] && !seen.has(ni)) {
                seen.add(ni);
                stack.push(ni);
              }
            }
          }
          return false;
        };
        for (let i = 0; i < n * n; i++) {
          if (biome[i] !== Biome.River) continue;
          if (!reaches.has(i)) reaches.set(i, drains(i));
          expect(reaches.get(i), `${terrain}/${seed} river tile ${i}`).toBe(true);
          expect(height[i]).toBeGreaterThanOrEqual(SEA_Q);
        }
      }
    }
  });

  it('every object has a valid, unique id and a position inside the world', () => {
    const w = makeWorld('ids');
    const seen = new Set<string>();
    for (const o of Object.values(w.objects)) {
      expect(isValidId(o.id)).toBe(true);
      expect(w.objects[o.id]).toBe(o);
      expect(seen.has(o.id)).toBe(false);
      seen.add(o.id);
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.x).toBeLessThanOrEqual(w.size);
      expect(o.z).toBeGreaterThanOrEqual(0);
      expect(o.z).toBeLessThanOrEqual(w.size);
    }
  });

  it('flora never grows on water or rivers; creatures start on open dry ground', () => {
    const w = makeWorld('flora');
    const n = w.size;
    const blockedByTree = new Set<number>();
    for (const o of Object.values(w.objects)) {
      const ti = Math.floor(o.z) * n + Math.floor(o.x);
      const b = w.tiles.biome[ti];
      if (o.kind === 'prop') {
        expect([Biome.DeepWater, Biome.ShallowWater, Biome.River]).not.toContain(b);
        if (BLOCKING_PROPS.has(o.type)) blockedByTree.add(ti);
      }
    }
    for (const o of Object.values(w.objects)) {
      if (o.kind !== 'character') continue;
      const ti = Math.floor(o.z) * n + Math.floor(o.x);
      expect([Biome.Sand, Biome.Grass, Biome.Forest, Biome.Hills]).toContain(w.tiles.biome[ti]);
      expect(blockedByTree.has(ti)).toBe(false);
    }
  });

  it('spawns villagers and sheep', () => {
    const w = makeWorld('life');
    const species = new Set(Object.values(w.objects).filter((o) => o.kind === 'character').map((o) => (o.kind === 'character' ? o.species : '')));
    expect(species.has('villager')).toBe(true);
    expect(species.has('sheep')).toBe(true);
  });

  it('starts uncustomised, revision 0, with a camera focus', () => {
    const w = makeWorld('fresh');
    expect(w.customized).toBe(false);
    expect(w.revision).toBe(0);
    expect(w.view).toBeDefined();
  });
});

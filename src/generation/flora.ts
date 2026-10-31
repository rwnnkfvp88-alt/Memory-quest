import { idFromRng } from '../core/ids';
import type { Rng } from '../core/rng';
import { Biome, type PropObject, type PropType, type TileGrid } from '../core/types';

interface PropRule {
  type: PropType;
  chance: number;
  scale: [number, number];
}

/** Trees, rocks and ground cover by biome. Forest tiles are handled separately (denser). */
const RULES: Partial<Record<number, PropRule[]>> = {
  [Biome.Grass]: [
    { type: 'oak', chance: 0.035, scale: [0.85, 1.2] },
    { type: 'bush', chance: 0.05, scale: [0.7, 1.1] },
    { type: 'flowers', chance: 0.09, scale: [0.8, 1.2] },
    { type: 'rock', chance: 0.012, scale: [0.6, 1.0] },
  ],
  [Biome.Hills]: [
    { type: 'pine', chance: 0.1, scale: [0.8, 1.2] },
    { type: 'rock', chance: 0.12, scale: [0.7, 1.3] },
    { type: 'bush', chance: 0.04, scale: [0.7, 1.0] },
  ],
  [Biome.Mountain]: [
    { type: 'rock', chance: 0.16, scale: [0.9, 1.7] },
    { type: 'pine', chance: 0.03, scale: [0.7, 1.0] },
  ],
  [Biome.Snow]: [{ type: 'rock', chance: 0.07, scale: [0.9, 1.5] }],
  [Biome.Sand]: [
    { type: 'rock', chance: 0.025, scale: [0.5, 0.9] },
    { type: 'bush', chance: 0.02, scale: [0.6, 0.9] },
  ],
};

export function generateFlora(grid: TileGrid, rng: Rng, idRng: Rng): PropObject[] {
  const n = grid.size;
  const props: PropObject[] = [];
  const add = (type: PropType, tx: number, tz: number, scale: [number, number]): void => {
    props.push({
      id: idFromRng('prop', idRng),
      kind: 'prop',
      type,
      x: tx + rng.range(0.18, 0.82),
      z: tz + rng.range(0.18, 0.82),
      scale: rng.range(scale[0], scale[1]),
      rotationY: rng.range(0, Math.PI * 2),
      shade: rng.range(0.88, 1.1),
    });
  };
  for (let tz = 0; tz < n; tz++) {
    for (let tx = 0; tx < n; tx++) {
      const i = tz * n + tx;
      const biome = grid.biome[i];
      if (biome === Biome.Forest) {
        const count = 1 + (rng.chance(0.6) ? 1 : 0) + (rng.chance(0.18) ? 1 : 0);
        for (let k = 0; k < count; k++) {
          const pine = grid.height[i] > 118 ? rng.chance(0.75) : rng.chance(0.25);
          add(pine ? 'pine' : 'oak', tx, tz, [0.85, 1.3]);
        }
        if (rng.chance(0.2)) add('bush', tx, tz, [0.6, 0.9]);
        continue;
      }
      const rules = RULES[biome];
      if (!rules) continue;
      for (const rule of rules) {
        if (rng.chance(rule.chance)) add(rule.type, tx, tz, rule.scale);
      }
    }
  }
  return props;
}

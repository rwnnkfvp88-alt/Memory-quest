import type * as THREE from 'three';
import type { PropType } from '../core/types';
import { GeoBuilder } from './geo';

const builders: Record<PropType, (b: GeoBuilder) => void> = {
  oak: (b) => {
    b.cyl(0.06, 0.09, 0.5, 0, 0, 0, '#6b4a2f', 6);
    b.blob(0.36, 0, 0, 0.78, 0, '#4f8f3e', { sy: 0.88 });
    b.blob(0.26, 0, 0.2, 0.58, 0.06, '#5ea04a');
    b.blob(0.25, 0, -0.16, 0.9, -0.1, '#6aae52');
  },
  pine: (b) => {
    b.cyl(0.05, 0.08, 0.34, 0, 0, 0, '#5d4030', 6);
    b.cone(0.36, 0.55, 0, 0.26, 0, '#2c6444', 7);
    b.cone(0.29, 0.5, 0, 0.58, 0, '#34744d', 7);
    b.cone(0.2, 0.46, 0, 0.9, 0, '#3e8556', 7);
  },
  bush: (b) => {
    b.blob(0.2, 0, 0, 0.15, 0, '#558f42', { sy: 0.8 });
    b.blob(0.15, 0, 0.17, 0.12, 0.05, '#62a04b');
    b.blob(0.14, 0, -0.14, 0.12, -0.06, '#4d8539');
  },
  rock: (b) => {
    b.blob(0.22, 0, 0, 0.13, 0, '#8d8b86', { sy: 0.7, jitter: 0.08 });
    b.blob(0.12, 0, 0.2, 0.07, 0.08, '#77756f', { jitter: 0.05 });
  },
  flowers: (b) => {
    const cols = ['#e86f9a', '#f2cc4a', '#f7f3ea', '#9a6fd8', '#f2cc4a'];
    const spots: Array<[number, number]> = [[0, 0], [0.18, 0.08], [-0.15, 0.12], [0.06, -0.17], [-0.12, -0.1]];
    spots.forEach(([x, z], i) => {
      b.cyl(0.012, 0.012, 0.12, x, 0, z, '#4f8a3c', 4);
      b.blob(0.045, 0, x, 0.14, z, cols[i], { flat: true });
    });
  },
};

const cache = new Map<PropType, THREE.BufferGeometry>();

export function getPropGeometry(type: PropType): THREE.BufferGeometry {
  let g = cache.get(type);
  if (!g) {
    const b = new GeoBuilder();
    builders[type](b);
    g = b.finish().solid!;
    cache.set(type, g);
  }
  return g;
}

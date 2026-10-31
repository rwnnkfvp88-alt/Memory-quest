import * as THREE from 'three';
import { BUILDING_DEFS } from '../core/buildingDefs';
import type { BuildingTypeId } from '../core/types';
import { GeoBuilder } from './geo';

/**
 * Procedural medieval buildings. Local space: origin at the footprint centre on the ground,
 * +z is the front (door side). Wall and roof colours are baked in so recoloring is just a
 * different cache key.
 */
export interface BuiltBuilding {
  solid: THREE.BufferGeometry;
  /** Lit windows. */
  glow?: THREE.BufferGeometry;
  /** Forge fire; flickers. */
  flame?: THREE.BufferGeometry;
  /** Windmill sails, rotating about `pivot`. */
  sails?: THREE.BufferGeometry;
  pivot?: [number, number, number];
}

const C = {
  wood: '#6b4a2f',
  darkWood: '#4a3322',
  stone: '#8f918d',
  stoneDark: '#6d706d',
  door: '#5a3a22',
  glass: '#ffd98a',
  iron: '#3b3e44',
  cloth: '#efe5c9',
  ember: '#ff8a2a',
  barrel: '#7a5532',
  plank: '#a0794c',
  banner: '#b8342f',
};

interface BuildExtras {
  pivot: [number, number, number];
  sailsGeometry: THREE.BufferGeometry;
}
type Build = (b: GeoBuilder, v: number, wall: string, roof: string) => BuildExtras | void;

const window = (b: GeoBuilder, x: number, y: number, z: number, side: 'front' | 'left' | 'right' = 'front'): void => {
  if (side === 'front') {
    b.box(0.3, 0.3, 0.05, x, y, z, C.glass, { layer: 'glow', flat: true });
    b.box(0.4, 0.06, 0.07, x, y - 0.05, z, C.darkWood);
    b.box(0.07, 0.3, 0.07, x - 0.19, y, z, C.darkWood);
    b.box(0.07, 0.3, 0.07, x + 0.19, y, z, C.darkWood);
  } else {
    b.box(0.05, 0.3, 0.3, x, y, z, C.glass, { layer: 'glow', flat: true });
    b.box(0.07, 0.06, 0.4, x, y - 0.05, z, C.darkWood);
  }
};

const cottage: Build = (b, v, wall, roof) => {
  b.box(1.62, 0.14, 1.42, 0, 0, 0, C.stoneDark);
  b.box(1.5, 1.05, 1.3, 0, 0.14, 0, wall);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.1, 1.19, 0.1, sx * 0.75, 0, sz * 0.65, C.darkWood);
  b.box(1.58, 0.07, 1.38, 0, 1.12, 0, C.darkWood);
  b.box(0.07, 0.99, 1.3, 0, 0.14, 0, C.darkWood, { flat: true });
  b.gable(1.62, 1.4, 0.88, 0, 1.19, 0, roof);
  b.box(0.38, 0.74, 0.06, -0.28, 0.14, 0.67, C.door);
  b.box(0.5, 0.08, 0.1, -0.28, 0.88, 0.67, C.darkWood);
  window(b, 0.38, 0.5, 0.67);
  window(b, 0.77, 0.5, 0, 'right');
  window(b, -0.77, 0.5, 0, 'left');
  b.box(0.24, 1.0, 0.24, 0.45, 1.19, -0.3, C.stone);
  b.box(0.32, 0.07, 0.32, 0.45, 2.19, -0.3, C.stoneDark);
  if (v === 1) {
    // porch with posts and a flower box
    b.gable(0.9, 0.36, 0.26, -0.28, 0.9, 0.84, roof);
    b.box(0.07, 0.9, 0.07, -0.68, 0.14, 0.9, C.wood);
    b.box(0.07, 0.9, 0.07, 0.12, 0.14, 0.9, C.wood);
    b.box(0.46, 0.14, 0.14, 0.4, 0.28, 0.78, C.wood);
    b.blob(0.09, 0, 0.3, 0.44, 0.78, '#d95f8a');
    b.blob(0.09, 0, 0.46, 0.44, 0.78, '#f2cc4a');
  } else if (v === 2) {
    // dormer, barrel and woodpile
    b.box(0.42, 0.4, 0.3, 0.3, 1.36, 0.46, wall);
    b.gable(0.5, 0.42, 0.26, 0.3, 1.76, 0.46, roof, { ry: Math.PI / 2 });
    window(b, 0.3, 1.46, 0.62);
    b.cyl(0.12, 0.12, 0.28, 0.66, 0, 0.84, C.barrel);
    for (let i = 0; i < 3; i++) b.cyl(0.05, 0.05, 0.5, -0.68, 0.05 + i * 0.1, 0.84 + (i % 2) * 0.04, C.wood, 6, { rz: Math.PI / 2 });
  }
};

const tavern: Build = (b, v, wall, roof) => {
  b.box(2.36, 0.14, 1.56, -0.3, 0, 0, C.stoneDark);
  b.box(2.2, 0.85, 1.4, -0.3, 0.14, 0, wall);
  b.box(2.3, 0.82, 1.5, -0.3, 0.99, 0, wall);
  b.box(2.34, 0.09, 1.54, -0.3, 0.9, 0, C.darkWood);
  for (const x of [-1.42, -0.3, 0.82]) for (const sz of [-1, 1]) b.box(0.1, 0.82, 0.1, x, 0.99, sz * 0.75, C.darkWood);
  b.gable(2.4, 1.64, 0.98, -0.3, 1.81, 0, roof);
  b.box(0.44, 0.78, 0.06, -0.95, 0.14, 0.71, C.door);
  b.box(0.56, 0.08, 0.1, -0.95, 0.92, 0.71, C.darkWood);
  window(b, 0.0, 0.44, 0.71);
  window(b, 0.5, 0.44, 0.71);
  for (const x of [-1.0, -0.3, 0.4]) window(b, x, 1.2, 0.77);
  window(b, -1.42, 1.2, 0, 'left');
  b.box(0.8, 0.95, 1.06, 1.15, 0.14, 0, wall);
  b.wedge(0.9, 1.2, 0.3, 0.1, 1.1, 1.09, 0, roof);
  b.box(0.36, 0.7, 0.06, 1.15, 0.14, 0.56, C.door);
  b.box(0.26, 1.1, 0.26, -0.9, 1.81, 0.2, C.stone);
  b.box(0.34, 0.07, 0.34, -0.9, 2.87, 0.2, C.stoneDark);
  b.box(0.06, 1.35, 0.06, 1.3, 0, 0.95, C.darkWood);
  b.box(0.62, 0.05, 0.05, 1.02, 1.28, 0.95, C.iron);
  b.box(0.36, 0.3, 0.05, 0.85, 0.94, 0.95, C.plank);
  b.cyl(0.06, 0.06, 0.1, 0.85, 1.03, 0.98, C.glass, 6, { layer: 'glow', flat: true });
  if (v === 1) {
    for (const [x, z] of [[0.5, 0.86], [0.78, 0.86], [0.64, 0.7]]) b.cyl(0.12, 0.12, 0.3, x, 0, z, C.barrel);
  } else if (v === 2) {
    b.box(0.6, 0.05, 0.24, -0.3, 0.34, 0.88, C.plank);
    b.box(0.05, 0.34, 0.05, -0.54, 0, 0.88, C.wood);
    b.box(0.05, 0.34, 0.05, -0.06, 0, 0.88, C.wood);
  }
};

const blacksmith: Build = (b, v, wall, roof) => {
  b.box(1.84, 0.12, 1.64, -0.55, 0, -0.1, C.stoneDark);
  b.box(1.7, 1.0, 1.5, -0.55, 0.12, -0.1, wall);
  for (const x of [-1.4, 0.3]) for (const sz of [-0.85, 0.65]) b.box(0.1, 1.12, 0.1, x, 0, sz, C.darkWood);
  b.gable(1.86, 1.66, 0.72, -0.55, 1.12, -0.1, roof);
  b.box(0.5, 0.82, 0.06, -0.8, 0.12, 0.66, C.door);
  window(b, -0.15, 0.55, 0.66);
  window(b, -1.41, 0.55, -0.1, 'left');
  // open forge lean-to
  for (const x of [0.5, 1.4]) for (const z of [-0.8, 0.5]) b.box(0.1, 1.28, 0.1, x, 0, z, C.wood);
  b.wedge(1.3, 1.6, 0.18, 0.05, 0.95, 1.28, -0.15, roof);
  b.box(0.8, 0.55, 0.7, 0.95, 0, -0.35, C.stone);
  b.box(0.56, 0.05, 0.46, 0.95, 0.55, -0.35, C.ember, { layer: 'flame', flat: true });
  b.cone(0.13, 0.32, 0.95, 0.58, -0.35, '#ffb347', 6, { layer: 'flame', flat: true });
  b.box(0.4, 1.95, 0.4, 0.95, 0.55, -0.35, C.stone);
  b.box(0.48, 0.07, 0.48, 0.95, 2.5, -0.35, C.stoneDark);
  b.cyl(0.12, 0.14, 0.3, 1.0, 0, 0.3, C.wood, 7);
  b.box(0.34, 0.12, 0.16, 1.0, 0.3, 0.3, C.iron);
  b.box(0.16, 0.08, 0.1, 1.2, 0.3, 0.3, C.iron);
  b.cyl(0.17, 0.17, 0.4, 1.3, 0, 0.0, C.barrel);
  for (let i = 0; i < 3; i++) b.box(0.4, 0.05, 0.05, 0.6, 0.05 + i * 0.06, 0.4, C.iron);
  if (v === 1) {
    for (let i = 0; i < 4; i++) b.cyl(0.06, 0.06, 0.55, -0.9 + (i % 2) * 0.2, 0.06 + Math.floor(i / 2) * 0.12, 0.9, C.wood, 6, { rz: Math.PI / 2 });
    b.cyl(0.3, 0.3, 0.05, -0.2, 0.3, 0.98, C.wood, 10, { rx: Math.PI / 2 });
  }
};

const windmill: Build = (b, v, wall, roof) => {
  b.cyl(0.95, 1.0, 0.3, 0, 0, 0, C.stoneDark, 8);
  b.cyl(0.5, 0.8, 2.1, 0, 0.3, 0, wall, 8);
  b.cyl(0.56, 0.56, 0.12, 0, 2.38, 0, C.darkWood, 8);
  b.cone(0.68, 0.8, 0, 2.5, 0, roof, 8);
  b.box(0.36, 0.66, 0.1, 0, 0.3, 0.74, C.door);
  b.box(0.2, 0.2, 0.3, 0, 2.38, 0.6, C.darkWood);
  b.box(0.22, 0.26, 0.05, 0, 1.3, 0.62, C.glass, { layer: 'glow', flat: true });
  b.box(0.22, 0.26, 0.05, 0.0, 1.9, 0.56, C.glass, { layer: 'glow', flat: true });
  b.cyl(0.06, 0.06, 0.2, 0, 2.38, 0.78, C.iron, 6, { rx: Math.PI / 2 });
  if (v === 1) {
    b.box(0.5, 0.5, 0.45, 0.95, 0, 0.55, C.plank);
    b.wedge(0.6, 0.55, 0.14, 0.02, 0.95, 0.5, 0.55, roof, { ry: Math.PI / 2 });
    for (const [x, z] of [[-0.75, 0.75], [-0.55, 0.95]]) b.cyl(0.12, 0.14, 0.26, x, 0, z, C.cloth);
  }
  // Four lattice sails around a hub; rotates as a unit in the renderer.
  const s = new GeoBuilder();
  for (let k = 0; k < 4; k++) {
    const rz = (k * Math.PI) / 2;
    const arm = new THREE.BoxGeometry(0.08, 1.6, 0.06);
    s.put(arm, C.wood, { x: -Math.sin(rz) * 0.8, y: Math.cos(rz) * 0.8, z: 0, rz, layer: 'sails' });
    const ox = Math.cos(rz) * 0.2;
    const oy = Math.sin(rz) * 0.2;
    const cloth = new THREE.BoxGeometry(0.4, 1.0, 0.03);
    s.put(cloth, C.cloth, { x: -Math.sin(rz) * 1.05 + ox, y: Math.cos(rz) * 1.05 + oy, z: 0.02, rz, layer: 'sails' });
    const bar = new THREE.BoxGeometry(0.44, 0.04, 0.05);
    for (const t of [0.7, 1.05, 1.4]) s.put(bar, C.darkWood, { x: -Math.sin(rz) * t + ox, y: Math.cos(rz) * t + oy, z: 0.04, rz, layer: 'sails' });
  }
  return { pivot: [0, 2.48, 0.82], sailsGeometry: s.finish().sails! };
};

const watchtower: Build = (b, v, wall, roof) => {
  b.box(1.56, 0.5, 1.56, 0, 0, 0, C.stoneDark);
  b.box(1.28, 2.2, 1.28, 0, 0.5, 0, wall);
  b.box(1.64, 0.22, 1.64, 0, 2.7, 0, C.stoneDark);
  for (const [x, z] of [[-0.74, -0.74], [0.74, -0.74], [0.74, 0.74], [-0.74, 0.74], [0, -0.78], [0, 0.78], [-0.78, 0], [0.78, 0]]) {
    b.box(0.28, 0.28, 0.28, x, 2.92, z, wall);
  }
  b.box(0.42, 0.78, 0.1, 0, 0.5, 0.65, C.door);
  b.box(0.54, 0.12, 0.14, 0, 1.28, 0.65, C.stoneDark);
  for (const y of [1.55, 2.15]) b.box(0.1, 0.34, 0.06, 0, y, 0.65, C.iron);
  b.box(0.06, 0.34, 0.1, 0.65, 1.8, 0, C.iron);
  b.box(0.06, 0.34, 0.1, -0.65, 1.8, 0, C.iron);
  if (v === 0) {
    b.box(0.9, 0.62, 0.9, 0, 2.92, 0, C.wood);
    b.box(0.3, 0.26, 0.05, 0, 3.1, 0.46, C.glass, { layer: 'glow', flat: true });
    b.hip(0.92, 0.92, 0.7, 0, 3.54, 0, roof);
    b.cyl(0.025, 0.025, 0.75, 0, 4.2, 0, C.darkWood, 5);
    b.box(0.46, 0.3, 0.025, 0.25, 4.62, 0, C.banner, { flat: true });
  } else {
    b.cyl(0.26, 0.2, 0.18, 0, 3.06, 0, C.iron, 7);
    b.cone(0.2, 0.42, 0, 3.24, 0, C.ember, 6, { layer: 'flame', flat: true });
    b.cyl(0.025, 0.025, 1.0, 0.62, 3.06, 0.62, C.darkWood, 5);
    b.box(0.46, 0.3, 0.025, 0.85, 3.8, 0.62, C.banner, { flat: true });
  }
};

const BUILDERS: Record<BuildingTypeId, Build> = { cottage, tavern, blacksmith, windmill, watchtower };

const cache = new Map<string, BuiltBuilding>();
const CACHE_LIMIT = 80;

/** Geometry for a building, cached by type + variant + colours. */
export function getBuildingGeometry(type: BuildingTypeId, variant: number, wall: string, roof: string): BuiltBuilding {
  const key = `${type}|${variant}|${wall}|${roof}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const b = new GeoBuilder();
  const extra = BUILDERS[type](b, variant % BUILDING_DEFS[type].variants, wall, roof);
  const layers = b.finish();
  const built: BuiltBuilding = {
    solid: layers.solid!,
    ...(layers.glow ? { glow: layers.glow } : {}),
    ...(layers.flame ? { flame: layers.flame } : {}),
    ...(extra ? { sails: extra.sailsGeometry, pivot: extra.pivot } : {}),
  };
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string;
    const old = cache.get(oldest)!;
    old.solid.dispose();
    old.glow?.dispose();
    old.flame?.dispose();
    old.sails?.dispose();
    cache.delete(oldest);
  }
  cache.set(key, built);
  return built;
}

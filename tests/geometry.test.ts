import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getBuildingGeometry } from '../src/assets/buildingGeometry';
import { BUILDING_DEFS, BUILDING_ORDER } from '../src/core/buildingDefs';

const box = (g: THREE.BufferGeometry): THREE.Box3 => {
  g.computeBoundingBox();
  return g.boundingBox!.clone();
};

describe('building geometry (real volume, not sprites)', () => {
  for (const type of BUILDING_ORDER) {
    const def = BUILDING_DEFS[type];
    for (let v = 0; v < def.variants; v++) {
      it(`${type} variant ${v}: solid mesh fits its footprint and height`, () => {
        const built = getBuildingGeometry(type, v, def.defaultColors.wall, def.defaultColors.roof);
        const b = box(built.solid);
        expect(built.solid.attributes.position.count).toBeGreaterThan(150);
        expect(built.solid.attributes.color).toBeDefined();
        expect(b.min.y).toBeGreaterThanOrEqual(-0.001);
        expect(b.max.y).toBeGreaterThan(def.height * 0.75);
        expect(b.max.y).toBeLessThan(def.height * 1.35);
        // Within the footprint, allowing roof overhang and props that spill a little.
        const halfW = def.footprint.w / 2 + 0.25;
        const halfD = def.footprint.d / 2 + 0.25;
        expect(b.min.x).toBeGreaterThanOrEqual(-halfW);
        expect(b.max.x).toBeLessThanOrEqual(halfW);
        expect(b.min.z).toBeGreaterThanOrEqual(-halfD);
        expect(b.max.z).toBeLessThanOrEqual(halfD);
        // Volume, not a flat card.
        expect(b.max.x - b.min.x).toBeGreaterThan(1);
        expect(b.max.z - b.min.z).toBeGreaterThan(1);
      });
    }
  }

  it('every building is visually distinct (different silhouette)', () => {
    const sizes = BUILDING_ORDER.map((t) => {
      const d = BUILDING_DEFS[t];
      const b = box(getBuildingGeometry(t, 0, d.defaultColors.wall, d.defaultColors.roof).solid);
      return [b.max.x - b.min.x, b.max.y, b.max.z - b.min.z].map((n) => n.toFixed(1)).join('x');
    });
    expect(new Set(sizes).size).toBe(BUILDING_ORDER.length);
  });

  it('wall and roof colours reach the mesh, and recoloring changes it', () => {
    const colours = (wall: string, roof: string): Set<string> => {
      const g = getBuildingGeometry('cottage', 0, wall, roof).solid;
      const col = g.attributes.color as THREE.BufferAttribute;
      const seen = new Set<string>();
      for (let i = 0; i < col.count; i += 3) seen.add(`${col.getX(i).toFixed(2)},${col.getY(i).toFixed(2)},${col.getZ(i).toFixed(2)}`);
      return seen;
    };
    const a = colours('#e9dcc0', '#b24c32');
    const b = colours('#e9dcc0', '#46597f');
    expect(a).not.toEqual(b);
    expect(getBuildingGeometry('cottage', 0, '#e9dcc0', '#b24c32')).toBe(getBuildingGeometry('cottage', 0, '#e9dcc0', '#b24c32')); // cached
  });

  it('windmill has separable sails and a pivot; forge buildings have flames; chimneyed buildings declare smoke', () => {
    const wm = getBuildingGeometry('windmill', 0, '#fff', '#555');
    expect(wm.sails).toBeDefined();
    expect(wm.pivot).toBeDefined();
    expect(getBuildingGeometry('blacksmith', 0, '#fff', '#555').flame).toBeDefined();
    expect(getBuildingGeometry('cottage', 0, '#fff', '#555').glow).toBeDefined();
    for (const t of ['cottage', 'tavern', 'blacksmith'] as const) expect(BUILDING_DEFS[t].smoke).toBeDefined();
  });
});

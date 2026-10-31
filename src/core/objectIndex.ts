import { BLOCKING_PROPS } from './props';
import { footprintRect } from './buildingDefs';
import type { BuildingObject, CharacterObject, ObjectId, PropObject, World } from './types';

/**
 * Derived, read-only lookups over `world.objects`. Cached per objects-record identity, so
 * commands that produce a new record automatically invalidate it.
 */
export interface ObjectIndex {
  buildings: BuildingObject[];
  props: PropObject[];
  characters: CharacterObject[];
  /** Per tile: index into `buildings` + 1, or 0 when no building covers it. */
  buildingAt: Int32Array;
  /** Per tile: 1 when a building or blocking prop occupies it. */
  blocked: Uint8Array;
  /** Props bucketed by tile index. */
  propsByTile: Map<number, PropObject[]>;
}

const cache = new WeakMap<Record<ObjectId, unknown>, ObjectIndex>();

export function getObjectIndex(world: Pick<World, 'objects' | 'size'>): ObjectIndex {
  const hit = cache.get(world.objects);
  if (hit && hit.blocked.length === world.size * world.size) return hit;
  const n = world.size;
  const buildings: BuildingObject[] = [];
  const props: PropObject[] = [];
  const characters: CharacterObject[] = [];
  for (const id in world.objects) {
    const o = world.objects[id];
    if (o.kind === 'building') buildings.push(o);
    else if (o.kind === 'prop') props.push(o);
    else characters.push(o);
  }
  const buildingAt = new Int32Array(n * n);
  const blocked = new Uint8Array(n * n);
  const propsByTile = new Map<number, PropObject[]>();
  buildings.forEach((b, bi) => {
    const r = footprintRect(b.type, b.rotation, b.x, b.z);
    for (let tz = r.z0; tz < r.z0 + r.d; tz++) {
      for (let tx = r.x0; tx < r.x0 + r.w; tx++) {
        if (tx < 0 || tz < 0 || tx >= n || tz >= n) continue;
        buildingAt[tz * n + tx] = bi + 1;
        blocked[tz * n + tx] = 1;
      }
    }
  });
  for (const p of props) {
    const tx = Math.floor(p.x);
    const tz = Math.floor(p.z);
    if (tx < 0 || tz < 0 || tx >= n || tz >= n) continue;
    const ti = tz * n + tx;
    const bucket = propsByTile.get(ti);
    if (bucket) bucket.push(p);
    else propsByTile.set(ti, [p]);
    if (BLOCKING_PROPS.has(p.type)) blocked[ti] = 1;
  }
  const index = { buildings, props, characters, buildingAt, blocked, propsByTile };
  cache.set(world.objects, index);
  return index;
}

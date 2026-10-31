import * as THREE from 'three';
import { SEA_LEVEL } from '../core/constants';
import { heightAt } from '../core/heightfield';
import type { ObjectId, TileGrid } from '../core/types';

export interface GroundHit {
  x: number;
  y: number;
  z: number;
  /** Distance along the ray. */
  t: number;
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

/** Visible ground height: the water surface counts as ground, so hovering a lake reports the lake. */
const surface = (tiles: TileGrid, x: number, z: number): number => Math.max(heightAt(tiles, x, z), SEA_LEVEL);

/**
 * Where does the pointer ray meet the terrain? Marches the ray through the height field (cheap
 * even on a 96x96 map) and bisects the crossing. Avoids raycasting a 20k-triangle mesh per move.
 */
export function pickGround(camera: THREE.Camera, ndcX: number, ndcY: number, tiles: TileGrid): GroundHit | null {
  ndc.set(ndcX, ndcY);
  raycaster.setFromCamera(ndc, camera);
  const o = raycaster.ray.origin;
  const d = raycaster.ray.direction;
  const n = tiles.size;

  // Slab test against the world's bounding box.
  let tMin = 0;
  let tMax = 1e9;
  const slab = (origin: number, dir: number, lo: number, hi: number): boolean => {
    if (Math.abs(dir) < 1e-9) return origin >= lo && origin <= hi;
    let t1 = (lo - origin) / dir;
    let t2 = (hi - origin) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    return tMin <= tMax;
  };
  if (!slab(o.x, d.x, 0, n) || !slab(o.y, d.y, -1.5, 16) || !slab(o.z, d.z, 0, n)) return null;

  const step = 0.12;
  let prevT = tMin;
  for (let t = tMin; t <= tMax + step; t += step) {
    const x = o.x + d.x * t;
    const y = o.y + d.y * t;
    const z = o.z + d.z * t;
    const cx = Math.min(Math.max(x, 0), n);
    const cz = Math.min(Math.max(z, 0), n);
    if (y <= surface(tiles, cx, cz)) {
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        const mx = Math.min(Math.max(o.x + d.x * mid, 0), n);
        const mz = Math.min(Math.max(o.z + d.z * mid, 0), n);
        if (o.y + d.y * mid <= surface(tiles, mx, mz)) hi = mid;
        else lo = mid;
      }
      const hx = o.x + d.x * hi;
      const hz = o.z + d.z * hi;
      if (hx < 0 || hz < 0 || hx > n || hz > n) return null;
      return { x: hx, y: o.y + d.y * hi, z: hz, t: hi };
    }
    prevT = t;
  }
  return null;
}

export interface ObjectHit {
  id: ObjectId;
  t: number;
}

/** Nearest tagged object (anything under `root` whose userData.objectId is set) along the pointer ray. */
export function pickObject(camera: THREE.Camera, ndcX: number, ndcY: number, root: THREE.Object3D): ObjectHit | null {
  ndc.set(ndcX, ndcY);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(root.children, true);
  for (const hit of hits) {
    let node: THREE.Object3D | null = hit.object;
    while (node) {
      const id = node.userData.objectId as string | undefined;
      if (id) return { id, t: hit.distance };
      node = node.parent;
    }
  }
  return null;
}

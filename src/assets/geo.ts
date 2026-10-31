import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Tiny procedural-modelling kit. Parts are primitives baked into one vertex-coloured mesh per
 * layer, so a whole building is 1-3 draw calls. This is the seam where hand-made or
 * AI-generated parts will plug in later: anything that yields a coloured BufferGeometry fits.
 */
export type Layer = 'solid' | 'glow' | 'sails' | 'flame';

export interface PutOptions {
  /** Centre of the part (use the box()/cyl() helpers to place by base height instead). */
  x?: number;
  y?: number;
  z?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  layer?: Layer;
  /** Vertex displacement for irregular shapes such as rocks. */
  jitter?: number;
  /** Disable the tiny per-part colour variation. */
  flat?: boolean;
}

const hash3 = (x: number, y: number, z: number): number => {
  const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

type V3 = [number, number, number];

export class GeoBuilder {
  private layers: Partial<Record<Layer, THREE.BufferGeometry[]>> = {};

  put(geo: THREE.BufferGeometry, color: string, o: PutOptions = {}): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ'));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(o.x ?? 0, o.y ?? 0, o.z ?? 0), q, new THREE.Vector3(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1)));
    if (g.hasAttribute('uv')) g.deleteAttribute('uv');
    if (o.jitter) {
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        pos.setXYZ(i, x + (hash3(x, y, z) - 0.5) * o.jitter, y + (hash3(y, z, x) - 0.5) * o.jitter, z + (hash3(z, x, y) - 0.5) * o.jitter);
      }
    }
    const c = new THREE.Color(color);
    if (!o.flat) c.multiplyScalar(1 + (hash3(o.x ?? 0, o.y ?? 0, o.z ?? 0) - 0.5) * 0.08);
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const layer = o.layer ?? 'solid';
    (this.layers[layer] ??= []).push(g);
    return this;
  }

  /** Box centred on (x, z) standing on y0. */
  box(w: number, h: number, d: number, x: number, y0: number, z: number, color: string, o: PutOptions = {}): this {
    return this.put(new THREE.BoxGeometry(w, h, d), color, { ...o, x, y: y0 + h / 2, z });
  }

  cyl(rTop: number, rBottom: number, h: number, x: number, y0: number, z: number, color: string, seg = 8, o: PutOptions = {}): this {
    return this.put(new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1), color, { ...o, x, y: y0 + h / 2, z });
  }

  cone(r: number, h: number, x: number, y0: number, z: number, color: string, seg = 8, o: PutOptions = {}): this {
    return this.put(new THREE.ConeGeometry(r, h, seg, 1), color, { ...o, x, y: y0 + h / 2, z });
  }

  blob(r: number, detail: number, x: number, yCentre: number, z: number, color: string, o: PutOptions = {}): this {
    return this.put(new THREE.IcosahedronGeometry(r, detail), color, { ...o, x, y: yCentre, z });
  }

  /** Closed convex solid from points + faces (3 or 4 indices each); winding is fixed to face outward. */
  convex(points: V3[], faces: number[][], color: string, o: PutOptions = {}): this {
    const centre = points.reduce<V3>((a, p) => [a[0] + p[0] / points.length, a[1] + p[1] / points.length, a[2] + p[2] / points.length], [0, 0, 0]);
    const pos: number[] = [];
    const emit = (a: V3, b: V3, c: V3): void => {
      const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      const n = ab.cross(ac);
      const mid = new THREE.Vector3((a[0] + b[0] + c[0]) / 3 - centre[0], (a[1] + b[1] + c[1]) / 3 - centre[1], (a[2] + b[2] + c[2]) / 3 - centre[2]);
      if (n.dot(mid) >= 0) pos.push(...a, ...b, ...c);
      else pos.push(...a, ...c, ...b);
    };
    for (const f of faces) {
      emit(points[f[0]], points[f[1]], points[f[2]]);
      if (f.length === 4) emit(points[f[0]], points[f[2]], points[f[3]]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    return this.put(g, color, o);
  }

  /** Gable roof: ridge runs along X, centred on (x, z), eaves at y0. Slight overhang included. */
  gable(length: number, span: number, rise: number, x: number, y0: number, z: number, color: string, o: PutOptions = {}): this {
    const L = length / 2 + 0.08;
    const S = span / 2 + 0.1;
    const pts: V3[] = [[-L, 0, -S], [-L, 0, S], [-L, rise, 0], [L, 0, -S], [L, 0, S], [L, rise, 0]];
    return this.convex(pts, [[0, 1, 2], [3, 4, 5], [0, 2, 5, 3], [1, 4, 5, 2], [0, 1, 4, 3]], color, { ...o, x, y: y0, z });
  }

  /** Four-sided pyramid roof. */
  hip(w: number, d: number, rise: number, x: number, y0: number, z: number, color: string, o: PutOptions = {}): this {
    const a = w / 2 + 0.06;
    const b = d / 2 + 0.06;
    const pts: V3[] = [[-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b], [0, rise, 0]];
    return this.convex(pts, [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]], color, { ...o, x, y: y0, z });
  }

  /** Mono-pitch slab: thickness `high` at -x, `low` at +x. */
  wedge(w: number, d: number, high: number, low: number, x: number, y0: number, z: number, color: string, o: PutOptions = {}): this {
    const a = w / 2;
    const b = d / 2;
    const pts: V3[] = [[-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b], [-a, high, -b], [a, low, -b], [a, low, b], [-a, high, b]];
    return this.convex(pts, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], color, { ...o, x, y: y0, z });
  }

  /** Merge each layer into a single geometry. Solid gets a cheap ambient-occlusion ramp toward the ground. */
  finish(): Partial<Record<Layer, THREE.BufferGeometry>> {
    const out: Partial<Record<Layer, THREE.BufferGeometry>> = {};
    for (const key of Object.keys(this.layers) as Layer[]) {
      const parts = this.layers[key]!;
      const merged = mergeGeometries(parts, false);
      for (const p of parts) p.dispose();
      if (!merged) continue;
      if (key === 'solid') {
        const pos = merged.attributes.position as THREE.BufferAttribute;
        const col = merged.attributes.color as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const t = Math.min(1, Math.max(0, pos.getY(i) / 1.4));
          const f = 0.8 + 0.2 * (t * t * (3 - 2 * t));
          col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
        }
      }
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      out[key] = merged;
    }
    return out;
  }
}

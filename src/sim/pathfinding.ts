import { MinHeap } from '../core/heap';
import { stepAllowed, type WalkGrid } from './walkGrid';

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * A* over the walk grid, 8-directional with no corner cutting.
 * Returns tile indices from the first step to the goal (start excluded), or null if unreachable
 * within `maxExpansions` (a hard cap so a bad query can never stall a frame).
 */
export function findPath(grid: WalkGrid, start: number, goal: number, maxExpansions = 2500): number[] | null {
  if (start === goal) return [];
  const n = grid.size;
  if (!grid.walkable[goal]) return null;
  const gx = goal % n;
  const gz = (goal - gx) / n;

  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  const heuristic = (i: number): number => {
    const dx = Math.abs((i % n) - gx);
    const dz = Math.abs(Math.floor(i / n) - gz);
    return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
  };
  open.push(start, heuristic(start));

  let expansions = 0;
  while (open.size > 0 && expansions < maxExpansions) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    if (cur === goal) {
      const path: number[] = [];
      let t = goal;
      while (t !== start) {
        path.push(t);
        t = came.get(t)!;
      }
      return path.reverse();
    }
    closed.add(cur);
    expansions++;
    const cx = cur % n;
    const cz = (cur - cx) / n;
    for (const [dx, dz, cost] of DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const ni = nz * n + nx;
      if (!grid.walkable[ni] || closed.has(ni) || !stepAllowed(grid, cur, ni)) continue;
      if (dx !== 0 && dz !== 0) {
        // No squeezing diagonally between two blocked tiles.
        if (!grid.walkable[cz * n + nx] || !grid.walkable[nz * n + cx]) continue;
      }
      const ng = g.get(cur)! + cost + Math.abs(grid.height[cur] - grid.height[ni]) * 0.6;
      if (ng < (g.get(ni) ?? Infinity)) {
        g.set(ni, ng);
        came.set(ni, cur);
        open.push(ni, ng + heuristic(ni));
      }
    }
  }
  return null;
}

/** Nearest walkable tile to (tx, tz) by breadth-first search, or null if the map has none nearby. */
export function nearestWalkable(grid: WalkGrid, tx: number, tz: number, maxRadius = 12): number | null {
  const n = grid.size;
  const cx = Math.min(Math.max(tx, 0), n - 1);
  const cz = Math.min(Math.max(tz, 0), n - 1);
  for (let r = 0; r <= maxRadius; r++) {
    let best: number | null = null;
    let bestD = Infinity;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= n || z >= n || !grid.walkable[z * n + x]) continue;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = z * n + x;
        }
      }
    }
    if (best !== null) return best;
  }
  return null;
}

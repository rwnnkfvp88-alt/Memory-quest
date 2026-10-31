import { describe, expect, it } from 'vitest';
import { getObjectIndex } from '../src/core/objectIndex';
import { placeBuilding } from '../src/editing/commands';
import { findPath, nearestWalkable } from '../src/sim/pathfinding';
import { CreatureSim } from '../src/sim/creatures';
import { buildWalkGrid } from '../src/sim/walkGrid';
import { makeWorld } from './helpers';

function runFor(sim: CreatureSim, seconds: number, onFrame?: () => void): void {
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) {
    sim.update(dt);
    onFrame?.();
  }
}

describe('pathfinding', () => {
  const world = makeWorld('paths');
  const grid = buildWalkGrid(world);
  const walkable: number[] = [];
  for (let i = 0; i < grid.walkable.length; i++) if (grid.walkable[i]) walkable.push(i);

  it('finds paths that only use walkable tiles with legal steps', () => {
    let found = 0;
    for (let k = 0; k < 40; k++) {
      const a = walkable[(k * 97) % walkable.length];
      const b = walkable[(k * 211 + 13) % walkable.length];
      const path = findPath(grid, a, b, 6000);
      if (!path) continue;
      found++;
      let prev = a;
      for (const t of path) {
        expect(grid.walkable[t]).toBe(1);
        const dx = Math.abs((t % grid.size) - (prev % grid.size));
        const dz = Math.abs(Math.floor(t / grid.size) - Math.floor(prev / grid.size));
        expect(Math.max(dx, dz)).toBe(1);
        prev = t;
      }
      expect(path[path.length - 1]).toBe(b);
    }
    expect(found).toBeGreaterThan(5);
  });

  it('reports unreachable goals without hanging', () => {
    const water = grid.walkable.indexOf(0);
    expect(findPath(grid, walkable[0], water)).toBeNull();
  });

  it('nearestWalkable returns a walkable tile', () => {
    const t = nearestWalkable(grid, 0, 0, 40);
    expect(t).not.toBeNull();
    expect(grid.walkable[t!]).toBe(1);
  });
});

describe('A1 creature behaviour', () => {
  it('creatures move, and only ever stand on walkable tiles', () => {
    const world = makeWorld('walkers');
    const sim = new CreatureSim(world);
    const start = new Map([...sim.actors].map(([id, a]) => [id, [a.x, a.z]]));
    expect(sim.actors.size).toBeGreaterThan(0);
    const moved = new Set<string>();
    runFor(sim, 90, () => {
      for (const a of sim.actors.values()) {
        const tile = Math.floor(a.z) * world.size + Math.floor(a.x);
        expect(sim.walkGrid.walkable[tile], `${a.species} left walkable ground at ${a.x.toFixed(2)},${a.z.toFixed(2)}`).toBe(1);
        const s = start.get(a.id)!;
        if (Math.hypot(a.x - s[0], a.z - s[1]) > 0.5) moved.add(a.id);
      }
    });
    expect(moved.size).toBeGreaterThan(sim.actors.size / 2);
  });

  it('is deterministic for the same world and timestep', () => {
    const a = new CreatureSim(makeWorld('det'));
    const b = new CreatureSim(makeWorld('det'));
    runFor(a, 20);
    runFor(b, 20);
    for (const [id, actor] of a.actors) {
      expect(b.actors.get(id)!.x).toBeCloseTo(actor.x, 9);
      expect(b.actors.get(id)!.z).toBeCloseTo(actor.z, 9);
    }
  });

  it('walk phase advances while walking (animation is driven by distance)', () => {
    const sim = new CreatureSim(makeWorld('phase'));
    const before = new Map([...sim.actors].map(([id, a]) => [id, a.phase]));
    runFor(sim, 60);
    const advanced = [...sim.actors.values()].filter((a) => a.phase !== before.get(a.id)).length;
    expect(advanced).toBeGreaterThan(0);
  });

  it('never ends up inside a building, and re-routes when one is built in its way', () => {
    let world = makeWorld('crowded');
    let sim = new CreatureSim(world);
    runFor(sim, 5);
    // Build directly on top of a creature.
    const victim = [...sim.actors.values()].find((a) => a.species === 'villager')!;
    let placed = false;
    for (let dz = -2; dz <= 0 && !placed; dz++) {
      for (let dx = -2; dx <= 0 && !placed; dx++) {
        const r = placeBuilding(world, { type: 'cottage', x: Math.floor(victim.x) + dx, z: Math.floor(victim.z) + dz });
        if (r.ok) {
          world = r.world;
          placed = true;
        }
      }
    }
    expect(placed, 'could not build on the creature').toBe(true);
    sim.sync(world);
    const index = getObjectIndex(world);
    const n = world.size;
    for (const a of sim.actors.values()) {
      expect(index.buildingAt[Math.floor(a.z) * n + Math.floor(a.x)]).toBe(0);
    }
    runFor(sim, 60, () => {
      for (const a of sim.actors.values()) {
        const t = Math.floor(a.z) * n + Math.floor(a.x);
        expect(index.buildingAt[t], 'walked into a building').toBe(0);
        expect(sim.walkGrid.walkable[t]).toBe(1);
      }
    });
  });

  it('adds and removes actors as creatures are added and removed', () => {
    const world = makeWorld('census');
    const sim = new CreatureSim(world);
    const count = sim.actors.size;
    const victimId = [...sim.actors.keys()][0];
    const objects = { ...world.objects };
    delete objects[victimId];
    sim.sync({ ...world, objects });
    expect(sim.actors.size).toBe(count - 1);
    expect(sim.actors.has(victimId)).toBe(false);
  });
});

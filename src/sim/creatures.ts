import { heightAt } from '../core/heightfield';
import { getObjectIndex } from '../core/objectIndex';
import { Rng } from '../core/rng';
import type { CreatureSpecies, ObjectId, World } from '../core/types';
import { findPath, nearestWalkable } from './pathfinding';
import { buildWalkGrid, isWalkable, type WalkGrid } from './walkGrid';

export type ActorMode = 'idle' | 'walk' | 'graze';

export interface Actor {
  id: ObjectId;
  species: CreatureSpecies;
  x: number;
  z: number;
  /** Ground height under the actor. */
  y: number;
  /** Facing in radians, 0 = +z, measured toward +x (atan2(dx, dz)). */
  heading: number;
  mode: ActorMode;
  /** Walk-cycle phase in radians; advances with distance travelled so feet never slide. */
  phase: number;
  speed: number;
  homeX: number;
  homeZ: number;
  path: number[];
  pathPos: number;
  timer: number;
  rng: Rng;
}

interface Behaviour {
  speed: number;
  wander: number;
  leash: number;
  rest: [number, number];
  cycle: number;
  restMode: 'idle' | 'graze';
}

const BEHAVIOUR: Record<CreatureSpecies, Behaviour> = {
  villager: { speed: 0.9, wander: 11, leash: 24, rest: [1.5, 6], cycle: 7.5, restMode: 'idle' },
  sheep: { speed: 0.34, wander: 4, leash: 7, rest: [2, 8], cycle: 10, restMode: 'graze' },
};

const TURN_RATE = 9; // rad/s
const MAX_DT = 0.1;

const angleDelta = (from: number, to: number): number => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/**
 * Creature behaviour, independent of rendering: wander, rest, route around obstacles.
 * Deterministic for a given world + sequence of dt values (each actor owns a seeded RNG).
 */
export class CreatureSim {
  readonly actors = new Map<ObjectId, Actor>();
  private world: World;
  private grid: WalkGrid;

  constructor(world: World) {
    this.world = world;
    this.grid = buildWalkGrid(world);
    this.reconcile();
  }

  get walkGrid(): WalkGrid {
    return this.grid;
  }

  /** Call whenever the world changes. Cheap no-op when nothing relevant changed. */
  sync(world: World): void {
    if (world === this.world) return;
    const sameWorld = world.id === this.world.id;
    const unchanged = sameWorld && world.objects === this.world.objects && world.tiles === this.world.tiles;
    this.world = world;
    if (unchanged) return;
    if (!sameWorld) this.actors.clear();
    this.grid = buildWalkGrid(world);
    this.reconcile();
  }

  private reconcile(): void {
    const characters = getObjectIndex(this.world).characters;
    const alive = new Set<ObjectId>();
    for (const c of characters) {
      alive.add(c.id);
      if (!this.actors.has(c.id)) this.actors.set(c.id, this.spawn(c.id, c.species, c.x, c.z));
    }
    for (const id of [...this.actors.keys()]) if (!alive.has(id)) this.actors.delete(id);

    // Anything now standing on a blocked tile (a building went up) is moved clear; stale paths are dropped.
    for (const a of this.actors.values()) {
      const tx = Math.floor(a.x);
      const tz = Math.floor(a.z);
      if (!isWalkable(this.grid, tx, tz)) {
        const t = nearestWalkable(this.grid, tx, tz);
        if (t !== null) {
          a.x = (t % this.grid.size) + 0.5;
          a.z = Math.floor(t / this.grid.size) + 0.5;
          a.homeX = a.x;
          a.homeZ = a.z;
          a.y = heightAt(this.world.tiles, a.x, a.z);
        }
        this.resetToIdle(a, 0.2);
      } else if (a.path.length > 0 && a.path.slice(a.pathPos).some((t) => !this.grid.walkable[t])) {
        this.resetToIdle(a, 0.2);
      }
    }
  }

  private spawn(id: ObjectId, species: CreatureSpecies, x: number, z: number): Actor {
    const rng = new Rng(`${this.world.id}|${id}|sim`);
    const b = BEHAVIOUR[species];
    return {
      id,
      species,
      x,
      z,
      y: heightAt(this.world.tiles, x, z),
      heading: rng.range(-Math.PI, Math.PI),
      mode: b.restMode,
      phase: rng.range(0, Math.PI * 2),
      speed: b.speed * rng.range(0.85, 1.15),
      homeX: x,
      homeZ: z,
      path: [],
      pathPos: 0,
      timer: rng.range(0.2, b.rest[1]),
      rng,
    };
  }

  private resetToIdle(a: Actor, timer: number): void {
    a.path = [];
    a.pathPos = 0;
    a.mode = BEHAVIOUR[a.species].restMode;
    a.timer = timer;
  }

  update(dtRaw: number): void {
    const dt = Math.min(Math.max(dtRaw, 0), MAX_DT);
    if (dt === 0) return;
    for (const a of this.actors.values()) {
      if (a.mode === 'walk') this.walk(a, dt);
      else {
        a.timer -= dt;
        if (a.timer <= 0 && !this.pickDestination(a)) a.timer = a.rng.range(0.6, 2);
      }
    }
  }

  private pickDestination(a: Actor): boolean {
    const n = this.grid.size;
    const b = BEHAVIOUR[a.species];
    const start = Math.floor(a.z) * n + Math.floor(a.x);
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = a.rng.range(0, Math.PI * 2);
      const dist = a.rng.range(2, b.wander);
      const tx = Math.round(a.x + Math.cos(angle) * dist - 0.5);
      const tz = Math.round(a.z + Math.sin(angle) * dist - 0.5);
      if (!isWalkable(this.grid, tx, tz)) continue;
      if (Math.hypot(tx + 0.5 - a.homeX, tz + 0.5 - a.homeZ) > b.leash) continue;
      const path = findPath(this.grid, start, tz * n + tx, 1200);
      if (path && path.length > 0) {
        a.path = path;
        a.pathPos = 0;
        a.mode = 'walk';
        return true;
      }
    }
    return false;
  }

  private walk(a: Actor, dt: number): void {
    const n = this.grid.size;
    const target = a.path[a.pathPos];
    if (target === undefined) {
      this.resetToIdle(a, a.rng.range(...BEHAVIOUR[a.species].rest));
      return;
    }
    const wx = (target % n) + 0.5;
    const wz = Math.floor(target / n) + 0.5;
    const dx = wx - a.x;
    const dz = wz - a.z;
    const dist = Math.hypot(dx, dz);
    const step = a.speed * dt;
    if (dist > 1e-6) {
      const desired = Math.atan2(dx, dz);
      const maxTurn = TURN_RATE * dt;
      a.heading += Math.max(-maxTurn, Math.min(maxTurn, angleDelta(a.heading, desired)));
    }
    if (dist <= step) {
      a.x = wx;
      a.z = wz;
      a.pathPos++;
      a.phase += dist * BEHAVIOUR[a.species].cycle;
      if (a.pathPos >= a.path.length) this.resetToIdle(a, a.rng.range(...BEHAVIOUR[a.species].rest));
    } else {
      a.x += (dx / dist) * step;
      a.z += (dz / dist) * step;
      a.phase += step * BEHAVIOUR[a.species].cycle;
    }
    a.y = heightAt(this.world.tiles, a.x, a.z);
  }
}

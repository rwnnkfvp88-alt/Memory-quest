import { footprintRect, BUILDING_DEFS } from '../core/buildingDefs';
import { randomAppearance, randomVillagerName } from '../core/creatures';
import { newId } from '../core/ids';
import { getObjectIndex } from '../core/objectIndex';
import { Rng } from '../core/rng';
import { Biome, type BuildingColors, type BuildingObject, type BuildingTypeId, type CharacterObject, type CreatureSpecies, type ObjectId, type World, type WorldObject } from '../core/types';
import { validateBuildingPlacement } from './placement';

/**
 * Pure world edits. Each takes a world and returns a NEW world (or a refusal); nothing is
 * mutated, so undo is just "keep the old reference". IDs are never touched by an edit.
 */
export type EditResult = { ok: true; world: World; id?: ObjectId } | { ok: false; reason: string; message: string };

const refuse = (reason: string, message: string): EditResult => ({ ok: false, reason, message });

function withObjects(world: World, objects: World['objects']): World {
  return { ...world, objects, customized: true };
}

export interface PlaceBuildingSpec {
  type: BuildingTypeId;
  x: number;
  z: number;
  rotation?: 0 | 1 | 2 | 3;
  variant?: number;
  colors?: BuildingColors;
  name?: string;
  /** Supply to make the new ID deterministic (tests, imports). */
  id?: ObjectId;
}

export function placeBuilding(world: World, spec: PlaceBuildingSpec): EditResult {
  const rotation = spec.rotation ?? 0;
  const check = validateBuildingPlacement(world, spec.type, rotation, spec.x, spec.z);
  if (!check.ok) return refuse(check.reason, check.message);

  const def = BUILDING_DEFS[spec.type];
  const r = footprintRect(spec.type, rotation, spec.x, spec.z);
  const objects = { ...world.objects };
  // Wild props in the footprint are cleared to make room. Creatures are never deleted; they re-route.
  const index = getObjectIndex(world);
  for (const p of index.props) {
    const tx = Math.floor(p.x);
    const tz = Math.floor(p.z);
    if (tx >= r.x0 && tx < r.x0 + r.w && tz >= r.z0 && tz < r.z0 + r.d) delete objects[p.id];
  }
  const id = spec.id ?? newId('building');
  const building: BuildingObject = {
    id,
    kind: 'building',
    type: spec.type,
    x: r.x0,
    z: r.z0,
    rotation,
    variant: spec.variant ?? 0,
    colors: spec.colors ?? def.defaultColors,
    name: spec.name ?? def.name,
  };
  objects[id] = building;
  return { ok: true, world: withObjects(world, objects), id };
}

function getBuilding(world: World, id: ObjectId): BuildingObject | undefined {
  const o = world.objects[id];
  return o && o.kind === 'building' ? o : undefined;
}

export function moveBuilding(world: World, id: ObjectId, x: number, z: number): EditResult {
  const b = getBuilding(world, id);
  if (!b) return refuse('not-found', 'That building no longer exists.');
  const check = validateBuildingPlacement(world, b.type, b.rotation, x, z, id);
  if (!check.ok) return refuse(check.reason, check.message);
  const r = footprintRect(b.type, b.rotation, x, z);
  if (r.x0 === b.x && r.z0 === b.z) return { ok: true, world, id };
  const objects = { ...world.objects };
  // Clear any wild props at the destination, as placement does.
  for (const p of getObjectIndex(world).props) {
    const tx = Math.floor(p.x);
    const tz = Math.floor(p.z);
    if (tx >= r.x0 && tx < r.x0 + r.w && tz >= r.z0 && tz < r.z0 + r.d) delete objects[p.id];
  }
  objects[id] = { ...b, x: r.x0, z: r.z0 };
  return { ok: true, world: withObjects(world, objects), id };
}

/**
 * Rotate by quarter turns about the footprint centre. If the exact pivot doesn't fit (a neighbour
 * or a slope in the way), the nearest anchor within one tile that does fit is used, so the building
 * turns in place whenever it reasonably can.
 */
export function rotateBuilding(world: World, id: ObjectId, quarterTurns: number): EditResult {
  const b = getBuilding(world, id);
  if (!b) return refuse('not-found', 'That building no longer exists.');
  const next = (((b.rotation + quarterTurns) % 4) + 4) % 4 as 0 | 1 | 2 | 3;
  const before = footprintRect(b.type, b.rotation, b.x, b.z);
  const after = footprintRect(b.type, next, b.x, b.z);
  const idealX = before.x0 + before.w / 2 - after.w / 2;
  const idealZ = before.z0 + before.d / 2 - after.d / 2;
  const baseX = Math.floor(idealX + 0.5);
  const baseZ = Math.floor(idealZ + 0.5);
  const candidates: Array<{ x: number; z: number; d: number }> = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = baseX + dx;
      const z = baseZ + dz;
      candidates.push({ x, z, d: Math.hypot(x - idealX, z - idealZ) });
    }
  }
  candidates.sort((a, c) => a.d - c.d || a.z - c.z || a.x - c.x);

  let firstFailure: string | null = null;
  for (const c of candidates) {
    const check = validateBuildingPlacement(world, b.type, next, c.x, c.z, id);
    if (check.ok) {
      const objects = { ...world.objects, [id]: { ...b, rotation: next, x: c.x, z: c.z } };
      return { ok: true, world: withObjects(world, objects), id };
    }
    firstFailure ??= check.message;
  }
  return refuse('blocked', `Can't rotate here. ${firstFailure}`);
}

export function recolorBuilding(world: World, id: ObjectId, colors: Partial<BuildingColors>): EditResult {
  const b = getBuilding(world, id);
  if (!b) return refuse('not-found', 'That building no longer exists.');
  const objects = { ...world.objects, [id]: { ...b, colors: { ...b.colors, ...colors } } };
  return { ok: true, world: withObjects(world, objects), id };
}

export function setBuildingVariant(world: World, id: ObjectId, variant: number): EditResult {
  const b = getBuilding(world, id);
  if (!b) return refuse('not-found', 'That building no longer exists.');
  const count = BUILDING_DEFS[b.type].variants;
  const objects = { ...world.objects, [id]: { ...b, variant: ((variant % count) + count) % count } };
  return { ok: true, world: withObjects(world, objects), id };
}

export function renameObject(world: World, id: ObjectId, name: string): EditResult {
  const o = world.objects[id];
  if (!o || (o.kind !== 'building' && o.kind !== 'character')) return refuse('not-found', 'Nothing to rename.');
  const clean = name.trim().slice(0, 40);
  if (!clean) return refuse('empty-name', 'A name needs at least one character.');
  const objects = { ...world.objects, [id]: { ...o, name: clean } as WorldObject };
  return { ok: true, world: withObjects(world, objects), id };
}

export function removeObject(world: World, id: ObjectId): EditResult {
  if (!world.objects[id]) return refuse('not-found', 'That is already gone.');
  const objects = { ...world.objects };
  delete objects[id];
  return { ok: true, world: withObjects(world, objects), id };
}

const CREATURE_BIOMES = new Set<number>([Biome.Sand, Biome.Grass, Biome.Forest, Biome.Hills]);

export function placeCreature(world: World, species: CreatureSpecies, x: number, z: number, id?: ObjectId): EditResult {
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  if (tx < 0 || tz < 0 || tx >= world.size || tz >= world.size) return refuse('out-of-bounds', 'That sits past the edge of the world.');
  const i = tz * world.size + tx;
  if (!CREATURE_BIOMES.has(world.tiles.biome[i])) return refuse('terrain', 'Solid, dry ground only.');
  if (getObjectIndex(world).blocked[i]) return refuse('occupied', 'Something is in the way.');
  const newCreatureId = id ?? newId('character');
  const rng = new Rng(`${newCreatureId}|look`);
  const creature: CharacterObject = {
    id: newCreatureId,
    kind: 'character',
    species,
    name: species === 'villager' ? randomVillagerName(rng) : 'Sheep',
    x: tx + 0.5,
    z: tz + 0.5,
    appearance: randomAppearance(rng),
  };
  return { ok: true, world: withObjects(world, { ...world.objects, [creature.id]: creature }), id: creature.id };
}

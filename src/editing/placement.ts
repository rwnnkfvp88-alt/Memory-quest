import { MAX_BUILD_SLOPE } from '../core/constants';
import { BUILDING_DEFS, footprintRect } from '../core/buildingDefs';
import { isWaterBiome, rectHeightRange } from '../core/heightfield';
import { getObjectIndex } from '../core/objectIndex';
import { Biome, type BuildingTypeId, type World } from '../core/types';

export type PlacementFailure = 'out-of-bounds' | 'water' | 'terrain' | 'slope' | 'occupied';

export type PlacementCheck = { ok: true } | { ok: false; reason: PlacementFailure; message: string };

export const PLACEMENT_MESSAGES: Record<PlacementFailure, string> = {
  'out-of-bounds': 'That sits past the edge of the world.',
  water: "Can't build on water.",
  terrain: 'Too rugged here. Mountains and snow stay wild.',
  slope: 'The ground is too steep for this building.',
  occupied: 'Another building is already standing here.',
};

const BUILDABLE = new Set<number>([Biome.Sand, Biome.Grass, Biome.Forest, Biome.Hills]);

const fail = (reason: PlacementFailure): PlacementCheck => ({ ok: false, reason, message: PLACEMENT_MESSAGES[reason] });

/** Can this building stand here? `ignoreId` lets a building be re-validated against its own current spot. */
export function validateBuildingPlacement(
  world: World,
  type: BuildingTypeId,
  rotation: number,
  x: number,
  z: number,
  ignoreId?: string,
): PlacementCheck {
  const n = world.size;
  const r = footprintRect(type, rotation, x, z);
  if (r.x0 < 0 || r.z0 < 0 || r.x0 + r.w > n || r.z0 + r.d > n) return fail('out-of-bounds');

  const index = getObjectIndex(world);
  for (let tz = r.z0; tz < r.z0 + r.d; tz++) {
    for (let tx = r.x0; tx < r.x0 + r.w; tx++) {
      const i = tz * n + tx;
      const biome = world.tiles.biome[i];
      if (isWaterBiome(biome) || biome === Biome.River) return fail('water');
      if (!BUILDABLE.has(biome)) return fail('terrain');
      const occupant = index.buildingAt[i];
      if (occupant !== 0 && index.buildings[occupant - 1].id !== ignoreId) return fail('occupied');
    }
  }
  const range = rectHeightRange(world.tiles, r.x0, r.z0, r.w, r.d);
  if (range.max - range.min > MAX_BUILD_SLOPE) return fail('slope');
  return { ok: true };
}

/** Footprint info for UI ghosts: where the building will stand and how tall to draw its foundation. */
export function placementFootprint(type: BuildingTypeId, rotation: number, x: number, z: number) {
  return footprintRect(type, rotation, x, z);
}

export function buildingDefFor(type: BuildingTypeId) {
  return BUILDING_DEFS[type];
}

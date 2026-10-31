import type { WorldSizeName } from './constants';

export type WorldId = string;
export type ObjectId = string;

export type TerrainType = 'temperate' | 'highlands' | 'islands' | 'plains';
export const TERRAIN_TYPES: readonly TerrainType[] = ['temperate', 'highlands', 'islands', 'plains'];

export interface GenerationParams {
  seed: string;
  size: WorldSizeName;
  terrain: TerrainType;
  generatorVersion: number;
}

export const Biome = {
  DeepWater: 0,
  ShallowWater: 1,
  River: 2,
  Sand: 3,
  Grass: 4,
  Forest: 5,
  Hills: 6,
  Mountain: 7,
  Snow: 8,
} as const;
export type BiomeId = (typeof Biome)[keyof typeof Biome];
export const BIOME_COUNT = 9;
export const BIOME_NAMES = ['Deep water', 'Shallow water', 'River', 'Sand', 'Grass', 'Forest', 'Hills', 'Mountain', 'Snow'];

/** Tile grid, row-major: index = z * size + x. */
export interface TileGrid {
  size: number;
  /** Quantised 0..255, mapped to world units by qToHeight(). */
  height: Uint8Array;
  biome: Uint8Array;
}

export type PropType = 'oak' | 'pine' | 'bush' | 'rock' | 'flowers';
export type BuildingTypeId = 'cottage' | 'tavern' | 'blacksmith' | 'windmill' | 'watchtower';
export type CreatureSpecies = 'villager' | 'sheep';

export interface BuildingColors {
  wall: string;
  roof: string;
}

interface ObjectBase {
  id: ObjectId;
  /** World position in tile units. Buildings use integer tile coordinates of their footprint's min corner. */
  x: number;
  z: number;
}

export interface BuildingObject extends ObjectBase {
  kind: 'building';
  type: BuildingTypeId;
  /** Quarter turns clockwise (viewed from above): 0..3. */
  rotation: 0 | 1 | 2 | 3;
  variant: number;
  colors: BuildingColors;
  name: string;
}

export interface PropObject extends ObjectBase {
  kind: 'prop';
  type: PropType;
  scale: number;
  rotationY: number;
  /** Per-instance brightness multiplier for natural variation. */
  shade: number;
}

export interface CreatureAppearance {
  tunic: string;
  hair: string;
  skin: string;
  hat: boolean;
}

export interface CharacterObject extends ObjectBase {
  kind: 'character';
  species: CreatureSpecies;
  name: string;
  appearance: CreatureAppearance;
}

export type WorldObject = BuildingObject | PropObject | CharacterObject;
export type ObjectKind = WorldObject['kind'];

export interface ViewState {
  x: number;
  z: number;
  zoom: number;
  azimuth: number;
}

export interface World {
  id: WorldId;
  name: string;
  schemaVersion: number;
  /** Increments on every persisted save; the hook for conflict detection and cloud sync. */
  revision: number;
  createdAt: number;
  updatedAt: number;
  generation: GenerationParams;
  size: number;
  tiles: TileGrid;
  objects: Record<ObjectId, WorldObject>;
  /** True once the user has edited anything by hand. Gates destructive regeneration. */
  customized: boolean;
  view?: ViewState;
  /** Unrecognised top-level fields from newer app versions are carried through untouched. */
  extensions: Record<string, unknown>;
}

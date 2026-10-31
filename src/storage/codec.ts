import { SCHEMA_VERSION, WORLD_SIZE_NAMES } from '../core/constants';
import { BUILDING_DEFS, isBuildingType } from '../core/buildingDefs';
import { isValidId } from '../core/ids';
import { PROP_TYPES } from '../core/props';
import { BIOME_COUNT, TERRAIN_TYPES, type BuildingObject, type CharacterObject, type GenerationParams, type ObjectId, type PropObject, type TileGrid, type ViewState, type World, type WorldObject } from '../core/types';
import { migrate } from './migrations';

export const FORMAT_ID = 'mnemosyne.world';

export interface SerializedWorld {
  format: typeof FORMAT_ID;
  schemaVersion: number;
  world: Record<string, unknown>;
}

export interface WorldSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
  size: number;
  terrain: string;
  seed: string;
  buildings: number;
  customized: boolean;
}

export class WorldFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorldFormatError';
  }
}

const KNOWN_KEYS = new Set([
  'id', 'name', 'revision', 'createdAt', 'updatedAt', 'generation', 'size', 'tiles', 'objects', 'customized', 'view',
]);

// ---------- base64 for tile arrays ----------

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export function base64ToBytes(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- encode ----------

export function encodeWorld(world: World): SerializedWorld {
  const objects = Object.values(world.objects).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    format: FORMAT_ID,
    schemaVersion: SCHEMA_VERSION,
    world: {
      ...world.extensions,
      id: world.id,
      name: world.name,
      revision: world.revision,
      createdAt: world.createdAt,
      updatedAt: world.updatedAt,
      generation: world.generation,
      size: world.size,
      tiles: { height: bytesToBase64(world.tiles.height), biome: bytesToBase64(world.tiles.biome) },
      objects,
      customized: world.customized,
      ...(world.view ? { view: world.view } : {}),
    },
  };
}

export function summarize(world: World): WorldSummary {
  let buildings = 0;
  for (const id in world.objects) if (world.objects[id].kind === 'building') buildings++;
  return {
    id: world.id,
    name: world.name,
    createdAt: world.createdAt,
    updatedAt: world.updatedAt,
    revision: world.revision,
    size: world.size,
    terrain: world.generation.terrain,
    seed: world.generation.seed,
    buildings,
    customized: world.customized,
  };
}

// ---------- decode + validate ----------

const fail = (message: string): never => {
  throw new WorldFormatError(message);
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

function decodeObject(raw: unknown, size: number): WorldObject {
  if (!isRecord(raw)) return fail('An object entry is not a record.');
  const { id, kind, x, z } = raw;
  if (!isValidId(id)) return fail(`Object has an invalid id: ${String(id)}`);
  if (!isNum(x) || !isNum(z) || x < 0 || z < 0 || x > size || z > size) return fail(`Object ${id} has an invalid position.`);

  if (kind === 'building') {
    if (!isBuildingType(raw.type)) return fail(`Object ${id} is an unknown building type "${String(raw.type)}". It may come from a newer version.`);
    const def = BUILDING_DEFS[raw.type];
    const rotation = raw.rotation;
    if (rotation !== 0 && rotation !== 1 && rotation !== 2 && rotation !== 3) return fail(`Building ${id} has an invalid rotation.`);
    const variant = raw.variant;
    if (!Number.isInteger(variant) || (variant as number) < 0 || (variant as number) >= def.variants) return fail(`Building ${id} has an invalid variant.`);
    const colors = raw.colors;
    if (!isRecord(colors) || !isHex(colors.wall) || !isHex(colors.roof)) return fail(`Building ${id} has invalid colors.`);
    if (typeof raw.name !== 'string') return fail(`Building ${id} has no name.`);
    const building: BuildingObject = {
      id, kind, type: raw.type, x, z, rotation, variant: variant as number, colors: { wall: colors.wall, roof: colors.roof }, name: raw.name,
    };
    return building;
  }
  if (kind === 'prop') {
    if (!PROP_TYPES.includes(raw.type as never)) return fail(`Prop ${id} has an unknown type.`);
    if (!isNum(raw.scale) || !isNum(raw.rotationY) || !isNum(raw.shade)) return fail(`Prop ${id} has invalid numbers.`);
    const prop: PropObject = { id, kind, type: raw.type as PropObject['type'], x, z, scale: raw.scale, rotationY: raw.rotationY, shade: raw.shade };
    return prop;
  }
  if (kind === 'character') {
    if (raw.species !== 'villager' && raw.species !== 'sheep') return fail(`Creature ${id} has an unknown species.`);
    const a = raw.appearance;
    if (!isRecord(a) || !isHex(a.tunic) || !isHex(a.hair) || !isHex(a.skin) || typeof a.hat !== 'boolean') return fail(`Creature ${id} has an invalid appearance.`);
    if (typeof raw.name !== 'string') return fail(`Creature ${id} has no name.`);
    const c: CharacterObject = {
      id, kind, species: raw.species, x, z, name: raw.name, appearance: { tunic: a.tunic, hair: a.hair, skin: a.skin, hat: a.hat },
    };
    return c;
  }
  return fail(`Object ${id} has an unknown kind "${String(kind)}". It may come from a newer version.`);
}

/** Validate and rebuild a World from untrusted data (a file, or a database record). Throws WorldFormatError. */
export function decodeWorld(input: unknown): World {
  if (!isRecord(input) || input.format !== FORMAT_ID) return fail("This isn't a Mnemosyne world file.");
  if (!isNum(input.schemaVersion) || !Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) return fail('The file has no valid version.');
  if (input.schemaVersion > SCHEMA_VERSION) return fail('This world was saved by a newer version of Mnemosyne. Update the app to open it.');
  const migrated = migrate(input as unknown as SerializedWorld);
  const w = migrated.world;

  if (!isValidId(w.id)) return fail('The world has an invalid id.');
  if (typeof w.name !== 'string' || w.name.length === 0) return fail('The world has no name.');
  if (!isNum(w.revision) || !isNum(w.createdAt) || !isNum(w.updatedAt)) return fail('The world has invalid timestamps.');

  const g = w.generation;
  if (!isRecord(g) || typeof g.seed !== 'string' || !WORLD_SIZE_NAMES.includes(g.size as never) || !TERRAIN_TYPES.includes(g.terrain as never) || !isNum(g.generatorVersion)) {
    return fail('The world has invalid generation settings.');
  }
  const generation: GenerationParams = { seed: g.seed, size: g.size as GenerationParams['size'], terrain: g.terrain as GenerationParams['terrain'], generatorVersion: g.generatorVersion };

  const size = w.size;
  if (!Number.isInteger(size) || (size as number) < 8 || (size as number) > 512) return fail('The world has an invalid size.');
  const n = size as number;

  const t = w.tiles;
  if (!isRecord(t) || typeof t.height !== 'string' || typeof t.biome !== 'string') return fail('The terrain data is missing.');
  let height: Uint8Array;
  let biome: Uint8Array;
  try {
    height = base64ToBytes(t.height);
    biome = base64ToBytes(t.biome);
  } catch {
    return fail('The terrain data is corrupted.');
  }
  if (height.length !== n * n || biome.length !== n * n) return fail('The terrain data does not match the world size.');
  for (let i = 0; i < biome.length; i++) if (biome[i] >= BIOME_COUNT) return fail('The terrain data contains an unknown biome.');
  const tiles: TileGrid = { size: n, height, biome };

  if (!Array.isArray(w.objects)) return fail('The object list is missing.');
  const objects: Record<ObjectId, WorldObject> = {};
  for (const raw of w.objects) {
    const o = decodeObject(raw, n);
    if (objects[o.id]) return fail(`Two objects share the id ${o.id}.`);
    objects[o.id] = o;
  }

  let view: ViewState | undefined;
  if (w.view !== undefined) {
    const v = w.view;
    if (!isRecord(v) || !isNum(v.x) || !isNum(v.z) || !isNum(v.zoom) || !isNum(v.azimuth)) return fail('The saved camera view is invalid.');
    view = { x: v.x, z: v.z, zoom: v.zoom, azimuth: v.azimuth };
  }

  const extensions: Record<string, unknown> = {};
  for (const key of Object.keys(w)) if (!KNOWN_KEYS.has(key)) extensions[key] = w[key];

  return {
    id: w.id,
    name: w.name,
    schemaVersion: SCHEMA_VERSION,
    revision: w.revision as number,
    createdAt: w.createdAt as number,
    updatedAt: w.updatedAt as number,
    generation,
    size: n,
    tiles,
    objects,
    customized: w.customized === true,
    ...(view ? { view } : {}),
    extensions,
  };
}

export function worldToJson(world: World): string {
  return JSON.stringify(encodeWorld(world));
}

export function worldFromJson(text: string): World {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("That file isn't valid JSON, so it can't be a Mnemosyne world.");
  }
  return decodeWorld(parsed);
}

import { GENERATOR_VERSION, SCHEMA_VERSION, WORLD_SIZES, type WorldSizeName } from '../core/constants';
import { newId } from '../core/ids';
import { Rng } from '../core/rng';
import type { GenerationParams, ObjectId, TerrainType, World, WorldObject } from '../core/types';
import { findMeadows, generateCreatures } from './fauna';
import { generateFlora } from './flora';
import { worldName } from './names';
import { generateTiles } from './terrain';

export { randomSeed } from './names';

export interface GenerateOptions {
  /** Supply to make object IDs reproducible (tests); otherwise a fresh world ID is minted. */
  id?: string;
  name?: string;
  now?: number;
}

export interface GenerateInput {
  seed: string;
  size: WorldSizeName;
  terrain: TerrainType;
}

/** Pure: (seed, size, terrain) -> a complete World. No rendering, no storage, no globals. */
export function generateWorld(input: GenerateInput, options: GenerateOptions = {}): World {
  const params: GenerationParams = { ...input, generatorVersion: GENERATOR_VERSION };
  const id = options.id ?? newId('world');
  const now = options.now ?? Date.now();
  const key = `${params.seed}|${params.terrain}|${params.size}`;
  const root = new Rng(key);
  const idRng = new Rng(`${id}|ids`);

  const tiles = generateTiles(params);
  const props = generateFlora(tiles, root.fork('flora'), idRng);
  const meadows = findMeadows(tiles, props);
  const creatures = generateCreatures(tiles, props, root.fork('fauna'), idRng, meadows);

  const objects: Record<ObjectId, WorldObject> = {};
  for (const o of props) objects[o.id] = o;
  for (const o of creatures) objects[o.id] = o;

  const focus = meadows[0] ?? { x: tiles.size / 2, z: tiles.size / 2 };
  return {
    id,
    name: options.name ?? worldName(root.fork('name')),
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    generation: params,
    size: WORLD_SIZES[params.size],
    tiles,
    objects,
    customized: false,
    view: { x: focus.x, z: focus.z, zoom: 1, azimuth: Math.PI / 4 },
    extensions: {},
  };
}

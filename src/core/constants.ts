/** Bump when generator output for a given seed changes. Stored worlds keep their own terrain regardless. */
export const GENERATOR_VERSION = 1;
/** Bump when the saved-world format changes; add a migration in storage/migrations.ts. */
export const SCHEMA_VERSION = 1;

/** Terrain heights are stored as 0..255 and mapped to world units by this span. */
export const MAX_HEIGHT = 11;
/** Quantised height of the sea surface. Tiles at or below this are water. */
export const SEA_Q = 80;
export const qToHeight = (q: number): number => (q / 255) * MAX_HEIGHT;
export const SEA_LEVEL = qToHeight(SEA_Q);
/** River water sits this far above the carved river bed (world units). */
export const RIVER_WATER_OFFSET = 0.2;

export const WORLD_SIZES = { small: 48, medium: 72, large: 96 } as const;
export type WorldSizeName = keyof typeof WORLD_SIZES;
export const WORLD_SIZE_NAMES = Object.keys(WORLD_SIZES) as WorldSizeName[];

/** Largest ground height difference (world units) a building footprint may span. */
export const MAX_BUILD_SLOPE = 1.1;
/** Largest height step (world units) a creature will walk between adjacent tiles. */
export const MAX_WALK_STEP = 0.75;

export const MAX_UNDO_DEPTH = 100;

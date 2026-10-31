import { SCHEMA_VERSION } from '../core/constants';
import type { SerializedWorld } from './codec';

/**
 * Each entry upgrades a serialized world from version `index + 1` to `index + 2`.
 * Schema v1 is the first format, so the list is empty. To change the format:
 *   1. bump SCHEMA_VERSION,
 *   2. append a function here that rewrites the old shape,
 *   3. add a fixture test in tests/storage.test.ts.
 */
export type Migration = (data: SerializedWorld) => SerializedWorld;
export const MIGRATIONS: Migration[] = [];

export function migrate(data: SerializedWorld, migrations: Migration[] = MIGRATIONS, target = SCHEMA_VERSION): SerializedWorld {
  let current = data;
  while (current.schemaVersion < target) {
    const step = migrations[current.schemaVersion - 1];
    if (!step) throw new Error(`No migration from schema v${current.schemaVersion}.`);
    current = { ...step(current), schemaVersion: current.schemaVersion + 1 };
  }
  return current;
}

import type { SerializedWorld, WorldSummary } from './codec';

/**
 * Where worlds live. The app only ever talks to this interface, so IndexedDB (local),
 * an in-memory fake (tests, private-browsing fallback) and a future cloud-sync backend
 * are interchangeable.
 */
export interface StorageAdapter {
  listWorlds(): Promise<WorldSummary[]>;
  loadWorld(id: string): Promise<SerializedWorld | null>;
  saveWorld(data: SerializedWorld, summary: WorldSummary): Promise<void>;
  deleteWorld(id: string): Promise<void>;
  getMeta<T = unknown>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
}

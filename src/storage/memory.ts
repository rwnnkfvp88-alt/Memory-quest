import type { StorageAdapter } from './adapter';
import type { SerializedWorld, WorldSummary } from './codec';

/** Volatile adapter: used in tests and as a last-resort fallback when IndexedDB is unavailable. */
export class MemoryAdapter implements StorageAdapter {
  private worlds = new Map<string, SerializedWorld>();
  private index = new Map<string, WorldSummary>();
  private meta = new Map<string, unknown>();

  async listWorlds(): Promise<WorldSummary[]> {
    return [...this.index.values()].map((s) => ({ ...s })).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async loadWorld(id: string): Promise<SerializedWorld | null> {
    const hit = this.worlds.get(id);
    return hit ? structuredClone(hit) : null;
  }
  async saveWorld(data: SerializedWorld, summary: WorldSummary): Promise<void> {
    this.worlds.set(summary.id, structuredClone(data));
    this.index.set(summary.id, { ...summary });
  }
  async deleteWorld(id: string): Promise<void> {
    this.worlds.delete(id);
    this.index.delete(id);
  }
  async getMeta<T>(key: string): Promise<T | undefined> {
    return this.meta.get(key) as T | undefined;
  }
  async setMeta(key: string, value: unknown): Promise<void> {
    this.meta.set(key, value);
  }
}

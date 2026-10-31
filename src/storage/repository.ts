import { newId } from '../core/ids';
import type { World } from '../core/types';
import type { StorageAdapter } from './adapter';
import { decodeWorld, encodeWorld, summarize, worldFromJson, worldToJson, type WorldSummary } from './codec';

const LAST_WORLD_KEY = 'lastWorldId';

/** The one place the app saves, loads, lists, exports and imports worlds. */
export class WorldRepository {
  constructor(
    private readonly adapter: StorageAdapter,
    private readonly now: () => number = Date.now,
  ) {}

  /** Persist a world. Returns the revision/timestamp that were stamped on the stored copy. */
  async save(world: World): Promise<{ revision: number; updatedAt: number }> {
    const stamped: World = { ...world, revision: world.revision + 1, updatedAt: this.now() };
    await this.adapter.saveWorld(encodeWorld(stamped), summarize(stamped));
    await this.adapter.setMeta(LAST_WORLD_KEY, stamped.id);
    return { revision: stamped.revision, updatedAt: stamped.updatedAt };
  }

  async load(id: string): Promise<World | null> {
    const data = await this.adapter.loadWorld(id);
    return data ? decodeWorld(data) : null;
  }

  list(): Promise<WorldSummary[]> {
    return this.adapter.listWorlds();
  }

  delete(id: string): Promise<void> {
    return this.adapter.deleteWorld(id);
  }

  async lastWorldId(): Promise<string | undefined> {
    return this.adapter.getMeta<string>(LAST_WORLD_KEY);
  }

  setLastWorldId(id: string): Promise<void> {
    return this.adapter.setMeta(LAST_WORLD_KEY, id);
  }

  exportText(world: World): string {
    return worldToJson(world);
  }

  /**
   * Parse a world file. Throws WorldFormatError on bad data and touches nothing.
   * If a different world with the same ID already exists, the import becomes a copy under a fresh ID
   * so it can never overwrite existing work.
   */
  async importText(text: string): Promise<World> {
    const parsed = worldFromJson(text);
    const existing = await this.adapter.loadWorld(parsed.id);
    if (!existing) return parsed;
    return { ...parsed, id: newId('world'), name: `${parsed.name} (imported)`, revision: 0 };
  }
}

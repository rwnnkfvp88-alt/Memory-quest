import type { StorageAdapter } from './adapter';
import type { SerializedWorld, WorldSummary } from './codec';

const DB_VERSION = 1;
const WORLDS = 'worlds';
const INDEX = 'index';
const META = 'meta';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Durable on-device storage. World bodies and their lightweight summaries live in separate stores so listing is fast. */
export class IndexedDbAdapter implements StorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory: IDBFactory = indexedDB,
    private readonly name = 'mnemosyne',
  ) {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const open = this.factory.open(this.name, DB_VERSION);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(WORLDS)) db.createObjectStore(WORLDS);
          if (!db.objectStoreNames.contains(INDEX)) db.createObjectStore(INDEX);
          if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error ?? new Error('Could not open the database'));
        open.onblocked = () => reject(new Error('The database is blocked by another tab'));
      });
      this.dbPromise.catch(() => {
        this.dbPromise = null;
      });
    }
    return this.dbPromise;
  }

  async listWorlds(): Promise<WorldSummary[]> {
    const db = await this.db();
    const all = await request(db.transaction(INDEX, 'readonly').objectStore(INDEX).getAll() as IDBRequest<WorldSummary[]>);
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async loadWorld(id: string): Promise<SerializedWorld | null> {
    const db = await this.db();
    const hit = await request(db.transaction(WORLDS, 'readonly').objectStore(WORLDS).get(id) as IDBRequest<SerializedWorld | undefined>);
    return hit ?? null;
  }

  async saveWorld(data: SerializedWorld, summary: WorldSummary): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([WORLDS, INDEX], 'readwrite');
    tx.objectStore(WORLDS).put(data, summary.id);
    tx.objectStore(INDEX).put(summary, summary.id);
    await transactionDone(tx);
  }

  async deleteWorld(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([WORLDS, INDEX], 'readwrite');
    tx.objectStore(WORLDS).delete(id);
    tx.objectStore(INDEX).delete(id);
    await transactionDone(tx);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const db = await this.db();
    return (await request(db.transaction(META, 'readonly').objectStore(META).get(key))) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(META, 'readwrite');
    tx.objectStore(META).put(value, key);
    await transactionDone(tx);
  }
}

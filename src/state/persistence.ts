import type { StoreApi } from 'zustand';
import type { ViewState, World } from '../core/types';
import { generateWorld, randomSeed } from '../generation';
import { Autosaver } from '../storage/autosave';
import { IndexedDbAdapter } from '../storage/indexeddb';
import { MemoryAdapter } from '../storage/memory';
import { WorldRepository } from '../storage/repository';
import { DEFAULT_INPUT, type AppActions, type AppState } from './store';

type Store = StoreApi<AppState & AppActions>;

export function createRepository(): { repo: WorldRepository; durable: boolean } {
  try {
    if (typeof indexedDB !== 'undefined') return { repo: new WorldRepository(new IndexedDbAdapter()), durable: true };
  } catch {
    /* fall through to memory */
  }
  return { repo: new WorldRepository(new MemoryAdapter()), durable: false };
}

/**
 * Glue between the store and storage: boots the last-opened world, autosaves edits, and flushes
 * when the tab is hidden. The store knows nothing about databases; this class knows nothing about React.
 */
export class Persistence {
  private autosaver: Autosaver;
  private seenRevision: number;
  private unsubscribe: (() => void) | null = null;
  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') void this.autosaver.flush();
  };
  private onPageHide = (): void => {
    void this.autosaver.flush();
  };

  constructor(
    private readonly store: Store,
    readonly repo: WorldRepository,
    private readonly getView: () => ViewState | undefined,
    readonly durable: boolean,
  ) {
    this.seenRevision = store.getState().editRevision;
    this.autosaver = new Autosaver({
      save: () => this.saveCurrent(),
      onStatus: (status) => store.setState({ saveStatus: status, ...(status === 'saved' ? { lastSavedAt: Date.now() } : {}) }),
      delayMs: 700,
    });
  }

  start(): void {
    this.unsubscribe = this.store.subscribe((s) => {
      if (s.editRevision !== this.seenRevision) {
        this.seenRevision = s.editRevision;
        this.autosaver.markDirty();
      }
      if (s.discardQueue.length > 0) {
        const ids = s.discardQueue;
        this.store.setState({ discardQueue: [] });
        void Promise.all(ids.map((id) => this.repo.delete(id))).catch((e) => console.error('Could not discard a replaced world', e));
      }
    });
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
  }

  dispose(): void {
    this.unsubscribe?.();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    this.autosaver.dispose();
  }

  /** Open the last world, or create the first one. */
  async boot(): Promise<void> {
    const state = this.store.getState();
    try {
      const lastId = await this.repo.lastWorldId();
      const world = lastId ? await this.repo.load(lastId) : null;
      if (world) {
        state.loadWorld(world);
        state.notify(`Welcome back to ${world.name}.`, 'info');
        return;
      }
    } catch (error) {
      console.error('Could not restore the last world', error);
      state.notify('Your last world could not be opened. Starting a fresh one.', 'error');
    }
    const fresh = generateWorld(DEFAULT_INPUT);
    state.loadWorld(fresh, { dirty: true });
    if (!this.durable) state.notify("This browser blocks local storage, so your work won't survive a refresh. Use Export to keep it.", 'error');
  }

  private async saveCurrent(): Promise<void> {
    const world = this.store.getState().world;
    const toSave: World = { ...world, view: this.getView() ?? world.view };
    const stamp = await this.repo.save(toSave);
    // Stamp the live world with the new revision, unless the user already moved on to another world.
    const live = this.store.getState().world;
    if (live.id === world.id) this.store.setState({ world: { ...live, revision: stamp.revision, updatedAt: stamp.updatedAt } });
  }

  /** Save immediately (Save button). */
  async saveNow(): Promise<void> {
    this.autosaver.markDirty();
    await this.autosaver.flush();
  }

  async openWorld(id: string): Promise<void> {
    await this.autosaver.flush();
    const world = await this.repo.load(id);
    if (!world) {
      this.store.getState().notify('That world could not be found.', 'error');
      return;
    }
    await this.repo.setLastWorldId(world.id);
    this.store.getState().loadWorld(world, { message: `Opened ${world.name}.` });
  }

  async deleteWorld(id: string): Promise<void> {
    const state = this.store.getState();
    const isCurrent = id === state.world.id;
    // Settle any in-flight save first so it can't resurrect the world after deletion.
    if (isCurrent) await this.autosaver.flush().catch(() => undefined);
    await this.repo.delete(id);
    if (isCurrent) {
      await state.generate({ seed: randomSeed(), size: state.form.size, terrain: state.form.terrain });
      state.notify('World deleted. Here is a fresh one.', 'info');
    } else {
      state.notify('World deleted.', 'info');
    }
  }

  async importText(text: string): Promise<void> {
    const state = this.store.getState();
    try {
      await this.autosaver.flush();
      const world = await this.repo.importText(text);
      state.loadWorld(world, { dirty: true, message: `Imported ${world.name}.` });
    } catch (error) {
      state.notify(error instanceof Error ? error.message : 'That file could not be imported.', 'error');
    }
  }

  exportCurrent(): { filename: string; text: string } {
    const world = this.store.getState().world;
    const text = this.repo.exportText({ ...world, view: this.getView() ?? world.view });
    const slug = world.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'world';
    return { filename: `${slug}.mnemosyne.json`, text };
  }
}

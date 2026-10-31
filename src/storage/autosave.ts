export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

export interface AutosaverOptions {
  save: () => Promise<void>;
  onStatus: (status: SaveStatus, error?: unknown) => void;
  delayMs?: number;
}

/**
 * Debounced saving that never loses an edit made while a save is in flight:
 * if markDirty() lands mid-save, another save runs as soon as the first finishes.
 */
export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  private dirty = false;
  private disposed = false;
  private readonly delayMs: number;

  constructor(private readonly opts: AutosaverOptions) {
    this.delayMs = opts.delayMs ?? 800;
  }

  markDirty(): void {
    if (this.disposed) return;
    this.dirty = true;
    this.opts.onStatus('dirty');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  /** Save now (used by the Save button and when the page is hidden). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.saving) {
      await this.saving;
      if (!this.dirty) return;
    }
    if (!this.dirty) return;
    this.saving = this.run();
    await this.saving;
  }

  private async run(): Promise<void> {
    this.dirty = false;
    this.opts.onStatus('saving');
    try {
      await this.opts.save();
      this.saving = null;
      if (this.dirty) {
        // Edited again while saving.
        this.opts.onStatus('dirty');
        await this.flush();
      } else {
        this.opts.onStatus('saved');
      }
    } catch (error) {
      this.saving = null;
      this.dirty = true; // keep it dirty so the next attempt retries
      this.opts.onStatus('error', error);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

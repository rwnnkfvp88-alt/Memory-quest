import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { SCHEMA_VERSION } from '../src/core/constants';
import { placeBuilding } from '../src/editing/commands';
import { Autosaver } from '../src/storage/autosave';
import { decodeWorld, encodeWorld, worldFromJson, worldToJson, WorldFormatError } from '../src/storage/codec';
import { IndexedDbAdapter } from '../src/storage/indexeddb';
import { MemoryAdapter } from '../src/storage/memory';
import { migrate } from '../src/storage/migrations';
import { WorldRepository } from '../src/storage/repository';
import type { World } from '../src/core/types';
import { findSpot, makeWorld } from './helpers';

function customWorld(): World {
  const base = makeWorld('persist');
  const r = placeBuilding(base, { type: 'windmill', ...findSpot(base, 'windmill'), rotation: 1, variant: 1, colors: { wall: '#123456', roof: '#abcdef' }, name: 'Old Whirl', id: 'building_keepme000001' });
  if (!r.ok) throw new Error('setup');
  return { ...r.world, view: { x: 10, z: 12, zoom: 1.5, azimuth: 1 } };
}

describe('S1 codec', () => {
  it('round-trips a world exactly, through JSON text', () => {
    const w = customWorld();
    const back = worldFromJson(worldToJson(w));
    expect(back.tiles.height).toEqual(w.tiles.height);
    expect(back.tiles.biome).toEqual(w.tiles.biome);
    expect(back.objects).toEqual(w.objects);
    expect(back).toEqual(w);
  });

  it('keeps stable ids and customisation through a round trip', () => {
    const back = worldFromJson(worldToJson(customWorld()));
    expect(back.objects['building_keepme000001']).toMatchObject({ name: 'Old Whirl', rotation: 1, variant: 1, colors: { wall: '#123456', roof: '#abcdef' } });
    expect(back.customized).toBe(true);
  });

  it('encoding is deterministic', () => {
    const w = customWorld();
    expect(worldToJson(w)).toBe(worldToJson(w));
  });

  it('carries unknown top-level fields through untouched (forward compatibility)', () => {
    const enc = encodeWorld(customWorld());
    enc.world.memoryPalace = { journeys: [{ id: 'journey_x', stops: ['building_keepme000001'] }] };
    const decoded = decodeWorld(enc);
    expect(decoded.extensions.memoryPalace).toEqual(enc.world.memoryPalace);
    expect(encodeWorld(decoded).world.memoryPalace).toEqual(enc.world.memoryPalace);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutate = (fn: (e: any) => void) => {
    const e = JSON.parse(worldToJson(customWorld()));
    fn(e);
    return e;
  };

  it.each([
    ['not an object', () => 'hello'],
    ['wrong format tag', () => mutate((e) => (e.format = 'other'))],
    ['newer schema', () => mutate((e) => (e.schemaVersion = SCHEMA_VERSION + 1))],
    ['missing id', () => mutate((e) => delete e.world.id)],
    ['bad size', () => mutate((e) => (e.world.size = 3))],
    ['tile length mismatch', () => mutate((e) => (e.world.tiles.height = 'AAAA'))],
    ['invalid base64', () => mutate((e) => (e.world.tiles.biome = '***'))],
    ['unknown biome value', () => mutate((e) => (e.world.tiles.biome = btoa(String.fromCharCode(...new Array(e.world.size * e.world.size).fill(99)))))],
    ['unknown building type', () => mutate((e) => ((e.world.objects as Array<{ type?: string; kind: string }>).find((o) => o.kind === 'building')!.type = 'castle'))],
    ['bad color', () => mutate((e) => ((e.world.objects as Array<{ colors?: { wall: string }; kind: string }>).find((o) => o.kind === 'building')!.colors!.wall = 'red'))],
    ['duplicate ids', () => mutate((e) => { const o = e.world.objects as unknown[]; o.push(o[0]); })],
    ['object outside world', () => mutate((e) => ((e.world.objects as Array<{ x: number }>)[0].x = 9999))],
    ['unknown object kind', () => mutate((e) => ((e.world.objects as Array<{ kind: string }>)[0].kind = 'dragon'))],
  ])('rejects corrupt input: %s', (_name, make) => {
    expect(() => decodeWorld(make())).toThrow(WorldFormatError);
  });

  it('rejects text that is not JSON with a friendly error', () => {
    expect(() => worldFromJson('{{{')).toThrow(/valid JSON/);
  });
});

describe('migrations', () => {
  it('applies each step in order and stamps the version', () => {
    const calls: number[] = [];
    const data = { format: 'mnemosyne.world' as const, schemaVersion: 1, world: { a: 1 } };
    const out = migrate(
      data,
      [
        (d) => (calls.push(1), { ...d, world: { ...d.world, b: 2 } }),
        (d) => (calls.push(2), { ...d, world: { ...d.world, c: 3 } }),
      ],
      3,
    );
    expect(calls).toEqual([1, 2]);
    expect(out.schemaVersion).toBe(3);
    expect(out.world).toEqual({ a: 1, b: 2, c: 3 });
  });
  it('fails loudly when a step is missing', () => {
    expect(() => migrate({ format: 'mnemosyne.world', schemaVersion: 1, world: {} }, [], 2)).toThrow(/No migration/);
  });
});

const adapters: Array<[string, () => import('../src/storage/adapter').StorageAdapter]> = [
  ['MemoryAdapter', () => new MemoryAdapter()],
  ['IndexedDbAdapter', () => new IndexedDbAdapter(new IDBFactory(), `test-${Math.random()}`)],
];

describe.each(adapters)('S1 persistence via %s', (_label, make) => {
  let repo: WorldRepository;
  let clock = 1_000;
  beforeEach(() => {
    clock = 1_000;
    repo = new WorldRepository(make(), () => ++clock);
  });

  it('saves and loads an identical world, bumping revision and updatedAt', async () => {
    const w = customWorld();
    const stamp = await repo.save(w);
    expect(stamp.revision).toBe(w.revision + 1);
    const loaded = await repo.load(w.id);
    expect(loaded).toEqual({ ...w, revision: stamp.revision, updatedAt: stamp.updatedAt });
  });

  it('lists worlds newest first with useful summaries', async () => {
    const a = makeWorld('a');
    const b = { ...customWorld(), id: 'world_secondsecond', name: 'Second' };
    await repo.save(a);
    await repo.save(b);
    const list = await repo.list();
    expect(list.map((s) => s.name)).toEqual(['Second', a.name]);
    expect(list[0]).toMatchObject({ buildings: 1, customized: true, terrain: 'temperate' });
  });

  it('overwrites on re-save instead of duplicating, and deletes cleanly', async () => {
    const w = makeWorld('dup');
    await repo.save(w);
    await repo.save({ ...w, name: 'Renamed' });
    expect(await repo.list()).toHaveLength(1);
    expect((await repo.load(w.id))!.name).toBe('Renamed');
    await repo.delete(w.id);
    expect(await repo.list()).toHaveLength(0);
    expect(await repo.load(w.id)).toBeNull();
  });

  it('remembers the last opened world', async () => {
    expect(await repo.lastWorldId()).toBeUndefined();
    const w = makeWorld('last');
    await repo.save(w);
    expect(await repo.lastWorldId()).toBe(w.id);
  });

  it('export then import into a fresh library reproduces the world', async () => {
    const w = customWorld();
    const text = repo.exportText(w);
    const fresh = new WorldRepository(make());
    const imported = await fresh.importText(text);
    expect(imported).toEqual(w);
  });

  it('importing a world whose id already exists makes a copy and never overwrites', async () => {
    const w = customWorld();
    await repo.save(w);
    const copy = await repo.importText(repo.exportText(w));
    expect(copy.id).not.toBe(w.id);
    expect(copy.name).toMatch(/imported/);
    expect(copy.objects).toEqual(w.objects);
    expect((await repo.load(w.id))!.name).toBe(w.name);
  });

  it('a rejected import leaves the library untouched', async () => {
    const w = makeWorld('safe');
    await repo.save(w);
    await expect(repo.importText('{"format":"nope"}')).rejects.toThrow(WorldFormatError);
    expect(await repo.list()).toHaveLength(1);
  });
});

describe('S2 autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves once after a burst of edits, on its own', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const statuses: string[] = [];
    const a = new Autosaver({ save, onStatus: (s) => statuses.push(s), delayMs: 500 });
    a.markDirty();
    a.markDirty();
    a.markDirty();
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('does not lose an edit made while a save is in flight', async () => {
    let release!: () => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((r) => (release = r))).mockResolvedValue(undefined);
    const a = new Autosaver({ save, onStatus: () => {}, delayMs: 100 });
    a.markDirty();
    await vi.advanceTimersByTimeAsync(101);
    expect(save).toHaveBeenCalledTimes(1);
    a.markDirty(); // edit lands mid-save
    release();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('flush() saves immediately and does nothing when clean', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = new Autosaver({ save, onStatus: () => {}, delayMs: 10_000 });
    await a.flush();
    expect(save).not.toHaveBeenCalled();
    a.markDirty();
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports errors and retries on the next change', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
    const statuses: string[] = [];
    const a = new Autosaver({ save, onStatus: (s) => statuses.push(s), delayMs: 50 });
    a.markDirty();
    await vi.advanceTimersByTimeAsync(60);
    expect(statuses.at(-1)).toBe('error');
    a.markDirty();
    await vi.advanceTimersByTimeAsync(60);
    expect(statuses.at(-1)).toBe('saved');
    expect(save).toHaveBeenCalledTimes(2);
  });
});

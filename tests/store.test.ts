import { beforeEach, describe, expect, it } from 'vitest';
import { generateWorld } from '../src/generation';
import { useApp } from '../src/state/store';
import { findSpot } from './helpers';

const input = { seed: 'store-test', size: 'small', terrain: 'temperate' } as const;

describe('store: generate, discard and customise rules', () => {
  beforeEach(() => {
    useApp.getState().loadWorld(generateWorld(input, { id: 'world_storetest0001' }), { dirty: true });
    useApp.setState({ discardQueue: [], dialog: null });
  });

  it('generating over a pristine world queues it for discard (no library clutter)', async () => {
    const first = useApp.getState().world.id;
    await useApp.getState().generate({ ...input, seed: 'another' });
    expect(useApp.getState().world.id).not.toBe(first);
    expect(useApp.getState().discardQueue).toContain(first);
  });

  it('a customised world is never queued for discard, and Generate asks first', async () => {
    const s = useApp.getState();
    const spot = findSpot(s.world, 'cottage');
    s.chooseBuilding('cottage');
    useApp.getState().tapGround(spot.x + 1, spot.z + 1);
    expect(useApp.getState().world.customized).toBe(true);
    const id = useApp.getState().world.id;
    useApp.getState().requestGenerate();
    expect(useApp.getState().dialog?.kind).toBe('confirm-generate');
    expect(useApp.getState().world.id).toBe(id); // nothing happened yet
    await useApp.getState().generate({ ...input, seed: 'after-confirm' });
    expect(useApp.getState().discardQueue).not.toContain(id);
  });

  it('renaming a world counts as customising it', () => {
    useApp.getState().renameWorld('My Hearth');
    expect(useApp.getState().world.customized).toBe(true);
    expect(useApp.getState().world.name).toBe('My Hearth');
  });

  it('opening/loading a world does not mark it dirty, and edits do', () => {
    const rev = useApp.getState().editRevision;
    useApp.getState().loadWorld(generateWorld(input, { id: 'world_storetest0002' }));
    expect(useApp.getState().editRevision).toBe(rev);
    const w = useApp.getState().world;
    const spot = findSpot(w, 'cottage');
    useApp.getState().chooseBuilding('cottage');
    useApp.getState().tapGround(spot.x + 1, spot.z + 1);
    expect(useApp.getState().editRevision).toBe(rev + 1);
  });

  it('undo/redo round-trips through the store and survives a tool change', () => {
    const w = useApp.getState().world;
    const baseline = Object.keys(w.objects).length;
    const spot = findSpot(w, 'tavern');
    useApp.getState().chooseBuilding('tavern');
    useApp.getState().tapGround(spot.x + 1.5, spot.z + 1);
    const edited = useApp.getState().world.objects;
    expect(Object.values(edited).some((o) => o.kind === 'building')).toBe(true);
    useApp.getState().undo();
    // Placing cleared any trees in the footprint; undo must bring every one of them back.
    expect(Object.keys(useApp.getState().world.objects).length).toBe(baseline);
    expect(useApp.getState().world.customized).toBe(false);
    useApp.getState().redo();
    expect(useApp.getState().world.objects).toBe(edited);
  });

  it('refused placements explain themselves and do not edit', () => {
    const before = useApp.getState().editRevision;
    useApp.getState().chooseBuilding('cottage');
    useApp.getState().tapGround(-5, -5);
    expect(useApp.getState().notice?.tone).toBe('error');
    expect(useApp.getState().editRevision).toBe(before);
  });
});

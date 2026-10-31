import { describe, expect, it } from 'vitest';
import { BUILDING_ORDER, footprintRect } from '../src/core/buildingDefs';
import { getObjectIndex } from '../src/core/objectIndex';
import { Biome, type BuildingObject } from '../src/core/types';
import { moveBuilding, placeBuilding, placeCreature, recolorBuilding, removeObject, renameObject, rotateBuilding, setBuildingVariant } from '../src/editing/commands';
import { emptyHistory, record, redo, snapshotOf, undo } from '../src/editing/history';
import { validateBuildingPlacement } from '../src/editing/placement';
import { findSpot, findTile, makeWorld } from './helpers';

describe('B1 placement rules', () => {
  const world = makeWorld('build-rules');

  it('all five building types can be placed', () => {
    expect(BUILDING_ORDER).toHaveLength(5);
    for (const type of BUILDING_ORDER) {
      const spot = findSpot(world, type);
      const r = placeBuilding(world, { type, ...spot });
      expect(r.ok, type).toBe(true);
      if (r.ok) {
        const b = r.world.objects[r.id!] as BuildingObject;
        expect(b.kind).toBe('building');
        expect(b.type).toBe(type);
        expect(r.world.customized).toBe(true);
      }
    }
  });

  it('rejects water, rivers, mountains, out-of-bounds and overlaps', () => {
    const deep = findTile(world, Biome.DeepWater);
    const river = findTile(world, Biome.River);
    const peak = findTile(world, Biome.Mountain);
    expect(validateBuildingPlacement(world, 'cottage', 0, deep.x, deep.z)).toMatchObject({ ok: false, reason: 'water' });
    expect(validateBuildingPlacement(world, 'cottage', 0, river.x, river.z)).toMatchObject({ ok: false, reason: 'water' });
    expect(validateBuildingPlacement(world, 'cottage', 0, peak.x, peak.z).ok).toBe(false);
    expect(validateBuildingPlacement(world, 'cottage', 0, -1, 3)).toMatchObject({ ok: false, reason: 'out-of-bounds' });
    expect(validateBuildingPlacement(world, 'tavern', 0, world.size - 1, 0)).toMatchObject({ ok: false, reason: 'out-of-bounds' });

    const spot = findSpot(world, 'cottage');
    const placed = placeBuilding(world, { type: 'cottage', ...spot });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(validateBuildingPlacement(placed.world, 'cottage', 0, spot.x, spot.z)).toMatchObject({ ok: false, reason: 'occupied' });
    expect(validateBuildingPlacement(placed.world, 'cottage', 0, spot.x + 1, spot.z)).toMatchObject({ ok: false, reason: 'occupied' });
    const refused = placeBuilding(placed.world, { type: 'cottage', ...spot });
    expect(refused.ok).toBe(false);
  });

  it('clears wild props from the footprint and leaves everything else alone', () => {
    const spot = findSpot(world, 'tavern');
    const r = placeBuilding(world, { type: 'tavern', ...spot });
    if (!r.ok) throw new Error('unreachable');
    const fp = footprintRect('tavern', 0, spot.x, spot.z);
    for (const p of getObjectIndex(r.world).props) {
      const inside = Math.floor(p.x) >= fp.x0 && Math.floor(p.x) < fp.x0 + fp.w && Math.floor(p.z) >= fp.z0 && Math.floor(p.z) < fp.z0 + fp.d;
      expect(inside).toBe(false);
    }
    const before = getObjectIndex(world);
    const after = getObjectIndex(r.world);
    expect(after.characters.length).toBe(before.characters.length); // creatures are never deleted
    expect(after.props.length).toBeLessThanOrEqual(before.props.length);
  });

  it('never mutates the input world', () => {
    const spot = findSpot(world, 'cottage');
    const snapshot = JSON.stringify(Object.keys(world.objects));
    placeBuilding(world, { type: 'cottage', ...spot });
    expect(JSON.stringify(Object.keys(world.objects))).toBe(snapshot);
    expect(world.customized).toBe(false);
  });
});

describe('B2 rotate / move / recolor / remove keep ids stable', () => {
  const base = makeWorld('edit-ops');
  const spot = findSpot(base, 'tavern');
  const placed = placeBuilding(base, { type: 'tavern', ...spot, id: 'building_stable000001' });
  if (!placed.ok) throw new Error('setup failed');
  const world = placed.world;
  const id = 'building_stable000001';

  it('rotates through four orientations and back, swapping footprint dims', () => {
    let w = world;
    const dims: Array<[number, number]> = [];
    for (let i = 0; i < 4; i++) {
      const r = rotateBuilding(w, id, 1);
      expect(r.ok, `rotation ${i}`).toBe(true);
      if (!r.ok) return;
      w = r.world;
      const b = w.objects[id] as BuildingObject;
      const fp = footprintRect(b.type, b.rotation, b.x, b.z);
      dims.push([fp.w, fp.d]);
      expect(b.id).toBe(id);
    }
    expect((w.objects[id] as BuildingObject).rotation).toBe(0);
    expect(dims).toEqual([[2, 3], [3, 2], [2, 3], [3, 2]]);
    expect(rotateBuilding(world, id, -1).ok).toBe(true);
  });

  it('rotation nudges to the nearest anchor that fits instead of failing on a strict pivot', () => {
    const w = makeWorld('hearthmoor');
    let nudged = 0;
    let tested = 0;
    for (let k = 0; k < 60; k++) {
      const spot = findSpot(w, 'blacksmith', 0, k * 7);
      const placedB = placeBuilding(w, { type: 'blacksmith', ...spot, id: 'building_rotatetest01' });
      if (!placedB.ok) continue;
      let cur = placedB.world;
      for (let turn = 0; turn < 4; turn++) {
        const b = cur.objects['building_rotatetest01'] as BuildingObject;
        const next = (b.rotation + 1) % 4;
        const bf = footprintRect(b.type, b.rotation, b.x, b.z);
        const af = footprintRect(b.type, next, b.x, b.z);
        const ix = bf.x0 + bf.w / 2 - af.w / 2;
        const iz = bf.z0 + bf.d / 2 - af.d / 2;
        // Oracle: is ANY anchor within one tile of the ideal pivot valid?
        let anyValid = false;
        let exactValid = false;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = Math.floor(ix + 0.5) + dx;
            const z = Math.floor(iz + 0.5) + dz;
            if (validateBuildingPlacement(cur, b.type, next, x, z, b.id).ok) {
              anyValid = true;
              if (dx === 0 && dz === 0) exactValid = true;
            }
          }
        }
        const r = rotateBuilding(cur, b.id, 1);
        tested++;
        expect(r.ok, `spot ${spot.x},${spot.z} turn ${turn}`).toBe(anyValid);
        if (r.ok) {
          if (!exactValid) nudged++;
          cur = r.world;
          const after = cur.objects['building_rotatetest01'] as BuildingObject;
          expect(after.id).toBe('building_rotatetest01');
          expect(after.rotation).toBe(next);
          expect(validateBuildingPlacement(cur, after.type, after.rotation, after.x, after.z, after.id).ok).toBe(true);
        } else break;
      }
    }
    expect(tested).toBeGreaterThan(100);
    expect(nudged).toBeGreaterThan(0); // the nudge actually rescued some rotations
  });

  it('moves a building and refuses invalid destinations', () => {
    const other = findSpot(world, 'tavern', 0, 40);
    const r = moveBuilding(world, id, other.x, other.z);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = r.world.objects[id] as BuildingObject;
    expect([b.x, b.z]).toEqual([other.x, other.z]);
    expect(b.id).toBe(id);
    const deep = findTile(world, Biome.DeepWater);
    expect(moveBuilding(world, id, deep.x, deep.z).ok).toBe(false);
    // moving onto itself is fine (a no-op)
    expect(moveBuilding(world, id, spot.x, spot.z).ok).toBe(true);
  });

  it('recolors, renames and changes variant without touching identity or position', () => {
    const a = recolorBuilding(world, id, { roof: '#112233' });
    if (!a.ok) throw new Error('recolor failed');
    const b1 = a.world.objects[id] as BuildingObject;
    expect(b1.colors.roof).toBe('#112233');
    expect(b1.colors.wall).toBe((world.objects[id] as BuildingObject).colors.wall);
    const r = renameObject(a.world, id, '  The Gilded Stag  ');
    if (!r.ok) throw new Error('rename failed');
    expect((r.world.objects[id] as BuildingObject).name).toBe('The Gilded Stag');
    expect(renameObject(world, id, '   ').ok).toBe(false);
    const v = setBuildingVariant(world, id, 7);
    if (!v.ok) throw new Error('variant failed');
    expect((v.world.objects[id] as BuildingObject).variant).toBe(1); // 7 mod 3
  });

  it('removes buildings, and refuses to remove what is not there', () => {
    const r = removeObject(world, id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.world.objects[id]).toBeUndefined();
    expect(removeObject(world, 'building_doesnotexist').ok).toBe(false);
  });

  it('places creatures only on open dry ground', () => {
    const deep = findTile(base, Biome.DeepWater);
    expect(placeCreature(base, 'sheep', deep.x, deep.z).ok).toBe(false);
    const g = findTile(base, Biome.Grass);
    const free = Object.values(base.objects).every((o) => o.kind !== 'prop' || Math.floor(o.x) !== g.x || Math.floor(o.z) !== g.z);
    if (free) expect(placeCreature(base, 'villager', g.x, g.z).ok).toBe(true);
  });
});

describe('undo / redo', () => {
  it('restores exact earlier states', () => {
    const w0 = makeWorld('undo');
    const s1 = findSpot(w0, 'cottage');
    let h = record(emptyHistory, snapshotOf(w0));
    const r1 = placeBuilding(w0, { type: 'cottage', ...s1 });
    if (!r1.ok) throw new Error();
    const w1 = r1.world;
    h = record(h, snapshotOf(w1));
    const r2 = placeBuilding(w1, { type: 'windmill', ...findSpot(w1, 'windmill', 0, 30) });
    if (!r2.ok) throw new Error();
    const w2 = r2.world;

    const u1 = undo(h, snapshotOf(w2))!;
    expect(u1.snapshot.objects).toBe(w1.objects);
    const u2 = undo(u1.history, u1.snapshot)!;
    expect(u2.snapshot.objects).toBe(w0.objects);
    expect(u2.snapshot.customized).toBe(false);
    expect(undo(u2.history, u2.snapshot)).toBeNull();

    const rd = redo(u2.history, u2.snapshot)!;
    expect(rd.snapshot.objects).toBe(w1.objects);
    const rd2 = redo(rd.history, rd.snapshot)!;
    expect(rd2.snapshot.objects).toBe(w2.objects);
    expect(redo(rd2.history, rd2.snapshot)).toBeNull();
  });
  it('a new edit clears the redo stack', () => {
    const w0 = makeWorld('undo2');
    let h = record(emptyHistory, snapshotOf(w0));
    const u = undo(h, snapshotOf(w0))!;
    h = u.history;
    expect(h.future.length).toBe(1);
    h = record(h, snapshotOf(w0));
    expect(h.future.length).toBe(0);
  });
});

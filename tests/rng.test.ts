import { describe, expect, it } from 'vitest';
import { newId, idFromRng, isValidId } from '../src/core/ids';
import { Rng } from '../src/core/rng';

describe('Rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = Array.from({ length: 8 }, ((r) => () => r.next())(new Rng('x')));
    const b = Array.from({ length: 8 }, ((r) => () => r.next())(new Rng('x')));
    const c = Array.from({ length: 8 }, ((r) => () => r.next())(new Rng('y')));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it('stays in range', () => {
    const r = new Rng('range');
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const k = r.int(3, 6);
      expect(k).toBeGreaterThanOrEqual(3);
      expect(k).toBeLessThanOrEqual(6);
    }
  });
  it('fork streams are independent of the parent', () => {
    const p = new Rng('p');
    const first = p.fork('a').next();
    p.next();
    p.next();
    expect(new Rng('p').fork('a').next()).toBe(first);
  });
});

describe('ids', () => {
  it('mints valid, unique ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId('building')));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(isValidId(id)).toBe(true);
    expect([...ids][0]).toMatch(/^building_/);
  });
  it('seeded ids are reproducible', () => {
    expect(idFromRng('prop', new Rng('s'))).toBe(idFromRng('prop', new Rng('s')));
  });
  it('rejects junk', () => {
    expect(isValidId('nope')).toBe(false);
    expect(isValidId(42)).toBe(false);
  });
});

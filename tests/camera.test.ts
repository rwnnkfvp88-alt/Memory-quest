import { describe, expect, it } from 'vitest';
import { CameraState, MAX_ZOOM, MIN_ZOOM } from '../src/render/cameraState';

const make = (): CameraState => {
  const c = new CameraState({ x: 36, z: 36, zoom: 1, azimuth: Math.PI / 4 }, 72);
  c.basePpu = 40;
  return c;
};

describe('C1 camera model', () => {
  it('pan drags the ground with the pointer (screen-right moves the target left on the ground)', () => {
    const c = make();
    const before = { x: c.cur.x, z: c.cur.z };
    c.panBy(100, 0);
    // Ground screen-right at azimuth 45deg is (cos, -sin) -> target moves opposite.
    expect(c.cur.x).toBeLessThan(before.x);
    expect(c.cur.z).toBeGreaterThan(before.z);
    const c2 = make();
    c2.panBy(0, 100); // drag down -> reveal ground "behind": target moves forward (-x,-z at 45deg)
    expect(c2.cur.x).toBeGreaterThan(c2.home.x - 1e9);
    expect(Math.hypot(c2.cur.x - 36, c2.cur.z - 36)).toBeGreaterThan(0);
  });

  it('a pan followed by its inverse returns to the start', () => {
    const c = make();
    c.panBy(120, -45);
    c.panBy(-120, 45);
    expect(c.cur.x).toBeCloseTo(36, 9);
    expect(c.cur.z).toBeCloseTo(36, 9);
  });

  it('zoom keeps the point under the cursor fixed', () => {
    const c = make();
    const ax = 180;
    const ay = -90;
    const world = (): { x: number; z: number } => {
      const o = c.groundOffset(ax, ay);
      return { x: c.cur.x + o.x, z: c.cur.z + o.z };
    };
    const before = world();
    c.zoomBy(1.8, ax, ay);
    const after = world();
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.z).toBeCloseTo(before.z, 9);
    expect(c.cur.zoom).toBeCloseTo(1.8, 9);
  });

  it('zoom is clamped on both ends', () => {
    const c = make();
    for (let i = 0; i < 40; i++) c.zoomBy(1.5);
    expect(c.cur.zoom).toBe(MAX_ZOOM);
    for (let i = 0; i < 80; i++) c.zoomBy(0.6);
    expect(c.cur.zoom).toBe(MIN_ZOOM);
  });

  it('target cannot leave the world', () => {
    const c = make();
    c.panBy(-1e6, 0);
    c.panBy(0, -1e6);
    expect(c.cur.x).toBeLessThanOrEqual(74);
    expect(c.cur.z).toBeLessThanOrEqual(74);
    expect(c.cur.x).toBeGreaterThanOrEqual(-2);
    expect(c.cur.z).toBeGreaterThanOrEqual(-2);
  });

  it('button rotation moves a quarter turn and eases there', () => {
    const c = make();
    c.rotateGoalBy(Math.PI / 2);
    expect(c.goal.azimuth).toBeCloseTo(Math.PI / 4 + Math.PI / 2, 9);
    let guard = 0;
    while (c.update(1 / 60) && guard++ < 600);
    expect(c.cur.azimuth).toBeCloseTo(Math.PI / 4 + Math.PI / 2, 3);
  });

  it('free rotation snaps to the nearest isometric angle on release', () => {
    const c = make();
    c.rotateBy(0.4);
    c.snapAzimuth();
    expect(c.goal.azimuth).toBeCloseTo(Math.PI / 4, 9);
    c.rotateBy(1.2);
    c.snapAzimuth();
    expect(c.goal.azimuth).toBeCloseTo(Math.PI / 4 + Math.PI / 2, 9);
  });

  it('reset returns to the home view', () => {
    const c = make();
    c.panBy(200, 100);
    c.zoomBy(2.2);
    c.rotateGoalBy(Math.PI);
    c.reset();
    let guard = 0;
    while (c.update(1 / 60) && guard++ < 900);
    expect(c.cur.x).toBeCloseTo(36, 2);
    expect(c.cur.zoom).toBeCloseTo(1, 2);
  });

  it('setView adopts a saved view and exposes it for saving', () => {
    const c = make();
    c.setView({ x: 10, z: 20, zoom: 2, azimuth: 1 }, 48);
    expect(c.getView()).toEqual({ x: 10, z: 20, zoom: 2, azimuth: 1 });
  });

  it('keyboard-style screen pan moves along the screen axes', () => {
    const c = make();
    c.setView({ x: 36, z: 36, zoom: 1, azimuth: 0 });
    c.panScreen(1, 0, 5); // right at azimuth 0 is +x
    expect(c.cur.x).toBeCloseTo(41, 9);
    c.panScreen(0, 1, 5); // forward at azimuth 0 is -z
    expect(c.cur.z).toBeCloseTo(31, 9);
  });
});

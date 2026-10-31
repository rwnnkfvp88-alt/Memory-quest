import type { ViewState } from '../core/types';

/**
 * Isometric camera model, free of three.js so its maths is unit-tested.
 * Ground-plane conventions: azimuth theta places the camera at target + (sin t, ., cos t);
 * screen-right on the ground is r = (cos t, -sin t), ground-forward is f = (-sin t, -cos t).
 */
export const ELEVATION = (36 * Math.PI) / 180;
export const MIN_ZOOM = 0.16;
export const MAX_ZOOM = 4;
export const DEFAULT_AZIMUTH = Math.PI / 4;
const SIN_E = Math.sin(ELEVATION);

export interface CamView {
  x: number;
  z: number;
  zoom: number;
  azimuth: number;
}

export class CameraState {
  cur: CamView;
  goal: CamView;
  home: CamView;
  /** Pixels per world unit at zoom 1; derived from the viewport. */
  basePpu = 30;
  mapSize: number;

  constructor(view: CamView = { x: 0, z: 0, zoom: 1, azimuth: DEFAULT_AZIMUTH }, mapSize = 72) {
    this.cur = { ...view };
    this.goal = { ...view };
    this.home = { ...view };
    this.mapSize = mapSize;
  }

  setViewport(w: number, h: number): void {
    this.basePpu = Math.max(8, Math.min(w, h) / 22);
  }

  ppu(zoom = this.cur.zoom): number {
    return this.basePpu * zoom;
  }

  /** Replace the view outright (loading a world); also becomes the Reset target. */
  setView(v: Partial<ViewState> & { x: number; z: number }, mapSize = this.mapSize): void {
    this.mapSize = mapSize;
    const next = { x: v.x, z: v.z, zoom: clampZoom(v.zoom ?? 1), azimuth: v.azimuth ?? DEFAULT_AZIMUTH };
    this.cur = { ...next };
    this.goal = { ...next };
    this.home = { ...next };
    this.clamp(this.cur);
    this.clamp(this.goal);
  }

  getView(): ViewState {
    return { x: this.goal.x, z: this.goal.z, zoom: this.goal.zoom, azimuth: this.goal.azimuth };
  }

  private axes(azimuth = this.cur.azimuth): { rx: number; rz: number; fx: number; fz: number } {
    return { rx: Math.cos(azimuth), rz: -Math.sin(azimuth), fx: -Math.sin(azimuth), fz: -Math.cos(azimuth) };
  }

  /** Ground-plane offset (from the view target) of a screen offset in pixels (right, down). */
  groundOffset(ax: number, ay: number, ppu = this.ppu(), azimuth = this.cur.azimuth): { x: number; z: number } {
    const { rx, rz, fx, fz } = this.axes(azimuth);
    const right = ax / ppu;
    const forward = -ay / (ppu * SIN_E);
    return { x: rx * right + fx * forward, z: rz * right + fz * forward };
  }

  /** Grab-and-drag pan: the ground under the pointer follows the pointer. */
  panBy(dxPx: number, dyPx: number): void {
    const o = this.groundOffset(dxPx, dyPx);
    for (const v of [this.cur, this.goal]) {
      v.x -= o.x;
      v.z -= o.z;
      this.clamp(v);
    }
  }

  /** Pan in screen directions at a given world speed (keyboard). */
  panScreen(right: number, forward: number, units: number): void {
    const { rx, rz, fx, fz } = this.axes();
    for (const v of [this.cur, this.goal]) {
      v.x += (rx * right + fx * forward) * units;
      v.z += (rz * right + fz * forward) * units;
      this.clamp(v);
    }
  }

  /** Immediate rotation (drag/twist). */
  rotateBy(radians: number): void {
    this.cur.azimuth += radians;
    this.goal.azimuth += radians;
  }

  /** Animated rotation (buttons, keys). */
  rotateGoalBy(radians: number): void {
    this.goal.azimuth = this.snapTarget(this.goal.azimuth) + radians;
  }

  snapTarget(azimuth: number): number {
    const step = Math.PI / 2;
    return Math.round((azimuth - Math.PI / 4) / step) * step + Math.PI / 4;
  }

  /** Ease to the nearest classic isometric angle after a free rotation gesture. */
  snapAzimuth(): void {
    this.goal.azimuth = this.snapTarget(this.goal.azimuth);
  }

  /** Immediate zoom that keeps the ground point under screen offset (ax, ay) fixed. */
  zoomBy(factor: number, ax = 0, ay = 0): void {
    const before = this.ppu(this.cur.zoom);
    const zoom = clampZoom(this.cur.zoom * factor);
    const after = this.ppu(zoom);
    const o1 = this.groundOffset(ax, ay, before);
    const o2 = this.groundOffset(ax, ay, after);
    for (const v of [this.cur, this.goal]) {
      v.x += o1.x - o2.x;
      v.z += o1.z - o2.z;
      v.zoom = zoom;
      this.clamp(v);
    }
  }

  /** Animated zoom about the screen centre (buttons, keys). */
  zoomGoalBy(factor: number): void {
    this.goal.zoom = clampZoom(this.goal.zoom * factor);
  }

  focusOn(x: number, z: number): void {
    this.goal.x = x;
    this.goal.z = z;
    this.clamp(this.goal);
  }

  reset(): void {
    this.goal = { ...this.home };
  }

  private clamp(v: CamView): void {
    const m = 2;
    v.x = Math.min(this.mapSize + m, Math.max(-m, v.x));
    v.z = Math.min(this.mapSize + m, Math.max(-m, v.z));
  }

  /** Advance the eased channels. Returns true while anything is still moving. */
  update(dt: number): boolean {
    const k = 1 - Math.exp(-dt * 12);
    let moving = false;
    for (const key of ['x', 'z', 'zoom', 'azimuth'] as const) {
      const diff = this.goal[key] - this.cur[key];
      if (Math.abs(diff) < (key === 'zoom' ? 1e-4 : 1e-3)) {
        this.cur[key] = this.goal[key];
      } else {
        this.cur[key] += diff * k;
        moving = true;
      }
    }
    return moving;
  }
}

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Shared by the scene, the UI buttons and the saver. */
export const cameraState = new CameraState();

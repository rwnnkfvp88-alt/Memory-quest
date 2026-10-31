import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useApp } from '../state/store';
import { cameraState } from './cameraState';
import { pickGround, pickObject } from './picking';

type Mode = 'none' | 'pending' | 'pan' | 'rotate' | 'pinch' | 'ignore';
interface Pointer {
  x: number;
  y: number;
  sx: number;
  sy: number;
  button: number;
  type: string;
}

const PAN_KEYS: Record<string, [number, number]> = {
  arrowleft: [-1, 0], a: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
  arrowup: [0, 1], w: [0, 1],
  arrowdown: [0, -1], s: [0, -1],
};

export const isTyping = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
};

/**
 * One input pipeline for mouse, touch and keyboard.
 *  - 1 pointer: drag pans, a short press is a tap (tool action). Touch shows the preview while pressed.
 *  - right/middle/shift-drag rotates; two fingers pinch-zoom, twist-rotate and pan together.
 *  - wheel / trackpad pinch zooms toward the cursor. Arrows/WASD pan, Q/E rotate, +/- zoom.
 */
export function InputController() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const keys = useRef(new Set<string>());
  const hoverRequest = useRef<{ cx: number; cy: number } | null>(null);
  const lastHover = useRef<{ qx: number; qz: number } | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = 'none';
    const pointers = new Map<number, Pointer>();
    let mode: Mode = 'none';
    let pinch = { dist: 1, angle: 0, mx: 0, my: 0 };

    const rect = (): DOMRect => el.getBoundingClientRect();
    const ndc = (cx: number, cy: number): [number, number] => {
      const r = rect();
      return [((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1];
    };
    const fromCentre = (cx: number, cy: number): [number, number] => {
      const r = rect();
      return [cx - (r.left + r.width / 2), cy - (r.top + r.height / 2)];
    };
    const pinchState = (): { dist: number; angle: number; mx: number; my: number } => {
      const [a, b] = [...pointers.values()];
      return { dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), angle: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };

    const requestHover = (cx: number, cy: number): void => {
      hoverRequest.current = { cx, cy };
    };
    const clearHover = (): void => {
      hoverRequest.current = null;
      lastHover.current = null;
      useApp.getState().setHover(null);
    };

    const tap = (cx: number, cy: number): void => {
      const [nx, ny] = ndc(cx, cy);
      const st = useApp.getState();
      const ground = pickGround(camera, nx, ny, st.world.tiles);
      const root = scene.getObjectByName('pickables');
      const wantsObjects = st.tool === 'select' || st.tool === 'remove';
      const obj = wantsObjects && root ? pickObject(camera, nx, ny, root) : null;
      if (obj && (!ground || obj.t <= ground.t + 0.6)) {
        st.tapObject(obj.id);
        return;
      }
      if (ground) st.tapGround(ground.x, ground.z);
      else if (st.tool === 'select') st.select(null);
    };

    const onDown = (e: PointerEvent): void => {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already-ended pointers can't be captured; the gesture still works */
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, type: e.pointerType });
      if (pointers.size >= 2) {
        mode = 'pinch';
        pinch = pinchState();
        clearHover();
      } else {
        const rotateGesture = e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey && e.pointerType === 'mouse');
        mode = rotateGesture ? 'rotate' : 'pending';
        if (mode === 'pending' && e.pointerType !== 'mouse') requestHover(e.clientX, e.clientY);
      }
    };

    const onMove = (e: PointerEvent): void => {
      const p = pointers.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse') requestHover(e.clientX, e.clientY);
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (mode === 'pinch' && pointers.size >= 2) {
        const now = pinchState();
        const [ax, ay] = fromCentre(now.mx, now.my);
        cameraState.panBy(now.mx - pinch.mx, now.my - pinch.my);
        cameraState.zoomBy(now.dist / pinch.dist, ax, ay);
        let dAngle = now.angle - pinch.angle;
        if (dAngle > Math.PI) dAngle -= Math.PI * 2;
        if (dAngle < -Math.PI) dAngle += Math.PI * 2;
        cameraState.rotateBy(-dAngle);
        pinch = now;
      } else if (mode === 'rotate') {
        cameraState.rotateBy(dx * 0.006);
      } else if (mode === 'pending' || mode === 'pan') {
        if (mode === 'pending' && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > (p.type === 'mouse' ? 4 : 9)) {
          mode = 'pan';
          clearHover();
        }
        if (mode === 'pan') cameraState.panBy(dx, dy);
        else requestHover(e.clientX, e.clientY);
      }
    };

    const onUp = (e: PointerEvent): void => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      try {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      } catch {
        /* nothing to release */
      }
      if (!p) return;
      if (mode === 'pending' && pointers.size === 0 && p.button === 0 && e.type === 'pointerup') {
        tap(e.clientX, e.clientY);
        if (p.type !== 'mouse') clearHover();
      }
      if ((mode === 'rotate' || mode === 'pinch') && pointers.size === 0) cameraState.snapAzimuth();
      if (pointers.size === 0) mode = 'none';
      else if (mode === 'pinch') {
        mode = 'ignore';
        cameraState.snapAzimuth();
      }
    };

    const onLeave = (): void => {
      if (pointers.size === 0) clearHover();
    };

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 16 : 1;
      const k = e.ctrlKey ? 0.012 : 0.0016;
      const [ax, ay] = fromCentre(e.clientX, e.clientY);
      cameraState.zoomBy(Math.exp(-e.deltaY * scale * k), ax, ay);
      requestHover(e.clientX, e.clientY);
    };

    const onContext = (e: Event): void => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (PAN_KEYS[key]) {
        keys.current.add(key);
        e.preventDefault();
      } else if (key === 'q') cameraState.rotateGoalBy(-Math.PI / 2);
      else if (key === 'e') cameraState.rotateGoalBy(Math.PI / 2);
      else if (key === '=' || key === '+') cameraState.zoomGoalBy(1.3);
      else if (key === '-' || key === '_') cameraState.zoomGoalBy(1 / 1.3);
      else if (key === '0' || key === 'home') cameraState.reset();
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      keys.current.delete(e.key.toLowerCase());
    };
    const onBlur = (): void => keys.current.clear();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [gl, camera, scene]);

  useFrame((_, dt) => {
    // Held keys pan at a speed that scales with how far in you are.
    if (keys.current.size > 0) {
      let right = 0;
      let forward = 0;
      for (const k of keys.current) {
        const v = PAN_KEYS[k];
        if (v) {
          right += v[0];
          forward += v[1];
        }
      }
      if (right || forward) cameraState.panScreen(right, forward, (16 / cameraState.cur.zoom) * Math.min(dt, 0.1) * 0.9);
    }

    // At most one ground pick per frame, and only publish when the snapped cell changes.
    const req = hoverRequest.current;
    if (req) {
      hoverRequest.current = null;
      const r = gl.domElement.getBoundingClientRect();
      const hit = pickGround(camera, ((req.cx - r.left) / r.width) * 2 - 1, -((req.cy - r.top) / r.height) * 2 + 1, useApp.getState().world.tiles);
      if (!hit) {
        if (lastHover.current) {
          lastHover.current = null;
          useApp.getState().setHover(null);
        }
        return;
      }
      const qx = Math.round(hit.x * 2);
      const qz = Math.round(hit.z * 2);
      if (!lastHover.current || lastHover.current.qx !== qx || lastHover.current.qz !== qz) {
        lastHover.current = { qx, qz };
        useApp.getState().setHover({ gx: qx / 2, gz: qz / 2 });
      }
    }
  });

  return null;
}

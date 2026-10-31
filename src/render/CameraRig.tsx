import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { SEA_LEVEL } from '../core/constants';
import { heightAt } from '../core/heightfield';
import { useApp } from '../state/store';
import { DEFAULT_AZIMUTH, ELEVATION, cameraState } from './cameraState';

/** Direction toward the sun (world space). Low-ish and from the screen-left of the default view. */
export const SUN_DIRECTION = new THREE.Vector3(-0.5, 0.92, 0.52).normalize();
const CAMERA_DISTANCE = 140;

/** Applies the pure CameraState to the three.js orthographic camera and keeps the sun's shadow window on screen. */
export function CameraRig({ sunRef }: { sunRef: RefObject<THREE.DirectionalLight | null> }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const size = useThree((s) => s.size);
  const worldId = useApp((s) => s.world.id);
  const groundY = useRef(SEA_LEVEL);

  useEffect(() => {
    cameraState.setViewport(size.width, size.height);
  }, [size.width, size.height]);

  useLayoutEffect(() => {
    const w = useApp.getState().world;
    cameraState.setViewport(size.width, size.height);
    cameraState.setView(w.view ?? { x: w.size / 2, z: w.size / 2, zoom: 1, azimuth: DEFAULT_AZIMUTH }, w.size);
    groundY.current = Math.max(heightAt(w.tiles, cameraState.cur.x, cameraState.cur.z), SEA_LEVEL);
  }, [worldId]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    cameraState.update(dt);
    const v = cameraState.cur;
    const tiles = useApp.getState().world.tiles;
    const targetY = Math.max(heightAt(tiles, v.x, v.z), SEA_LEVEL);
    groundY.current += (targetY - groundY.current) * (1 - Math.exp(-dt * 5));
    const ce = Math.cos(ELEVATION);
    const se = Math.sin(ELEVATION);
    camera.position.set(v.x + Math.sin(v.azimuth) * ce * CAMERA_DISTANCE, groundY.current + se * CAMERA_DISTANCE, v.z + Math.cos(v.azimuth) * ce * CAMERA_DISTANCE);
    camera.zoom = cameraState.ppu();
    camera.lookAt(v.x, groundY.current, v.z);
    camera.updateProjectionMatrix();

    const sun = sunRef.current;
    if (sun) {
      const ppu = cameraState.ppu();
      const ext = Math.min(95, Math.hypot(size.width / (2 * ppu), size.height / (2 * ppu * Math.sin(ELEVATION))) + 6);
      const sc = sun.shadow.camera;
      if (Math.abs(sc.right - ext) > 0.4) {
        sc.left = -ext;
        sc.right = ext;
        sc.top = ext;
        sc.bottom = -ext;
        sc.updateProjectionMatrix();
      }
      sun.target.position.set(v.x, groundY.current, v.z);
      sun.target.updateMatrixWorld();
      sun.position.set(v.x + SUN_DIRECTION.x * 110, groundY.current + SUN_DIRECTION.y * 110, v.z + SUN_DIRECTION.z * 110);
    }
  });

  return null;
}

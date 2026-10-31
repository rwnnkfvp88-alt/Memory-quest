import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useApp } from '../state/store';
import { Birds, CloudShadows, Smoke } from './Ambient';
import { Buildings, useForgeFlicker } from './Buildings';
import { CameraRig } from './CameraRig';
import { Creatures } from './Creatures';
import { Flora } from './Flora';
import { InputController } from './InputController';
import { timeUniform } from './materials';
import { simRegistry } from './simRegistry';
import * as THREE from 'three';
import { heightAt } from '../core/heightfield';
import { HoverPreview, SelectionMarker } from './Overlays';
import { Terrain, Water } from './Terrain';
import { cameraState } from './cameraState';

/** Advances the shared shader clock and the forge flicker; also exposes a debug/test handle. */
function Systems() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useForgeFlicker();
  useFrame((state) => {
    timeUniform.value = state.clock.elapsedTime;
  });
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__mnemosyne = {
      store: useApp,
      camera: cameraState,
      threeCamera: camera,
      scene,
      renderInfo: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures }),
      pickables: () => scene.getObjectByName('pickables')?.children.length ?? 0,
      /** Client-pixel position of a ground point (tile units); for automated tests. */
      project: (x: number, z: number, lift = 0) => {
        const w = useApp.getState().world;
        const v = new THREE.Vector3(x, heightAt(w.tiles, x, z) + lift, z).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      actors: () => [...(simRegistry.current?.actors.values() ?? [])].map((a) => ({ id: a.id, species: a.species, x: a.x, z: a.z, mode: a.mode })),
    };
  }, [gl, scene, camera]);
  return null;
}

function World() {
  const world = useApp((s) => s.world);
  // Re-derive layers only when the data they draw actually changes.
  const terrainKey = world.tiles;
  const sun = useRef<THREE.DirectionalLight>(null);
  const shadows = useApp((s) => s.shadows);
  return (
    <>
      <hemisphereLight args={['#e6f1ff', '#8c7a58', 1.15]} />
      <ambientLight intensity={0.28} />
      <directionalLight
        ref={sun}
        intensity={2.2}
        color="#fff0d2"
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={260}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
        shadow-radius={2.5}
      />
      <Terrain key={world.id} tiles={terrainKey} />
      <Water tiles={terrainKey} />
      <Flora world={world} />
      <group name="pickables">
        <Buildings world={world} />
        <Creatures world={world} />
      </group>
      <Smoke world={world} />
      <Birds size={world.size} />
      {shadows && <CloudShadows size={world.size} />}
      <HoverPreview />
      <SelectionMarker />
      <CameraRig sunRef={sun} />
      <InputController />
      <Systems />
    </>
  );
}

export function Scene() {
  const shadows = useApp((s) => s.shadows);
  return (
    <Canvas
      orthographic
      flat
      dpr={[1, 2]}
      shadows={shadows ? 'percentage' : false}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      camera={{ zoom: 30, near: 0.1, far: 700, position: [60, 60, 60] }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <World />
    </Canvas>
  );
}

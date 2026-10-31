import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getBuildingGeometry } from '../assets/buildingGeometry';
import { footprintRect } from '../core/buildingDefs';
import { rectHeightRange } from '../core/heightfield';
import { getObjectIndex } from '../core/objectIndex';
import type { BuildingObject, TileGrid, World } from '../core/types';
import { flameMaterial, foundationMaterial, glowMaterial, solidMaterial } from './materials';

const unitBox = new THREE.BoxGeometry(1, 1, 1);

function Sails({ geometry, pivot, phase }: { geometry: THREE.BufferGeometry; pivot: [number, number, number]; phase: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z -= Math.min(dt, 0.1) * 0.75;
  });
  return (
    <group position={pivot} rotation={[0, 0, phase]} ref={ref}>
      <mesh geometry={geometry} material={solidMaterial} castShadow />
    </group>
  );
}

export const BuildingView = memo(function BuildingView({ b, tiles }: { b: BuildingObject; tiles: TileGrid }) {
  const built = useMemo(() => getBuildingGeometry(b.type, b.variant, b.colors.wall, b.colors.roof), [b.type, b.variant, b.colors.wall, b.colors.roof]);
  const fp = footprintRect(b.type, b.rotation, b.x, b.z);
  const range = rectHeightRange(tiles, fp.x0, fp.z0, fp.w, fp.d);
  const baseY = range.max + 0.02;
  const foundationBottom = range.min - 0.3;
  const phase = (b.x * 0.37 + b.z * 0.61) % (Math.PI * 2);
  return (
    <group userData={{ objectId: b.id }}>
      <mesh
        geometry={unitBox}
        material={foundationMaterial}
        position={[fp.x0 + fp.w / 2, (baseY + foundationBottom) / 2, fp.z0 + fp.d / 2]}
        scale={[fp.w - 0.04, baseY - foundationBottom, fp.d - 0.04]}
        castShadow
        receiveShadow
      />
      <group position={[fp.x0 + fp.w / 2, baseY, fp.z0 + fp.d / 2]} rotation={[0, (-b.rotation * Math.PI) / 2, 0]}>
        <mesh geometry={built.solid} material={solidMaterial} castShadow receiveShadow />
        {built.glow && <mesh geometry={built.glow} material={glowMaterial} />}
        {built.flame && <mesh geometry={built.flame} material={flameMaterial} />}
        {built.sails && built.pivot && <Sails geometry={built.sails} pivot={built.pivot} phase={phase} />}
      </group>
    </group>
  );
});

export function Buildings({ world }: { world: Pick<World, 'objects' | 'size' | 'tiles'> }) {
  const buildings = useMemo(() => getObjectIndex(world).buildings, [world]);
  return (
    <>
      {buildings.map((b) => (
        <BuildingView key={b.id} b={b} tiles={world.tiles} />
      ))}
    </>
  );
}

/** Forge fire flicker, shared by every blacksmith. */
export function useForgeFlicker(): void {
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    flameMaterial.color.setScalar(0.82 + 0.13 * Math.sin(t * 11) + 0.08 * Math.sin(t * 23.7 + 1.3));
  });
}

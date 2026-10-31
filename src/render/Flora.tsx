import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getPropGeometry } from '../assets/propGeometry';
import { heightAt } from '../core/heightfield';
import { getObjectIndex } from '../core/objectIndex';
import { PROP_TYPES } from '../core/props';
import type { PropObject, PropType, TileGrid, World } from '../core/types';
import { bushSway, solidMaterial, treeSway } from './materials';

const MATERIALS: Record<PropType, THREE.Material> = { oak: treeSway, pine: treeSway, bush: bushSway, rock: solidMaterial, flowers: solidMaterial };

const dummy = new THREE.Object3D();
const color = new THREE.Color();

const PropInstances = memo(function PropInstances({ type, items, tiles }: { type: PropType; items: PropObject[]; tiles: TileGrid }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = getPropGeometry(type);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((p, i) => {
      dummy.position.set(p.x, heightAt(tiles, p.x, p.z), p.z);
      dummy.rotation.set(0, p.rotationY, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setScalar(p.shade));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items, tiles]);
  return <instancedMesh ref={ref} args={[geometry, MATERIALS[type], items.length]} castShadow={type !== 'flowers'} receiveShadow frustumCulled={false} />;
});

/** All trees, rocks, bushes and flowers: five instanced meshes in total, however big the forest. */
export function Flora({ world }: { world: Pick<World, 'objects' | 'size' | 'tiles'> }) {
  const byType = useMemo(() => {
    const out = {} as Record<PropType, PropObject[]>;
    for (const t of PROP_TYPES) out[t] = [];
    for (const p of getObjectIndex(world).props) out[p.type].push(p);
    return out;
  }, [world]);
  return (
    <>
      {PROP_TYPES.map((t) =>
        byType[t].length > 0 ? <PropInstances key={`${t}-${byType[t].length}`} type={t} items={byType[t]} tiles={world.tiles} /> : null,
      )}
    </>
  );
}

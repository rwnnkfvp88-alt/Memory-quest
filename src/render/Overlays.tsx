import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getBuildingGeometry } from '../assets/buildingGeometry';
import { BUILDING_DEFS, footprintRect } from '../core/buildingDefs';
import { rectHeightRange } from '../core/heightfield';
import { getObjectIndex } from '../core/objectIndex';
import type { BuildingTypeId } from '../core/types';
import { placeCreature } from '../editing/commands';
import { validateBuildingPlacement } from '../editing/placement';
import { anchorFor, useApp } from '../state/store';

const ghostOk = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.66, depthWrite: false, flatShading: true });
const ghostBad = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, flatShading: true, color: '#ff8c8c', emissive: '#4a0000' });
const planeGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const planeOk = new THREE.MeshBasicMaterial({ color: '#7ee07a', transparent: true, opacity: 0.38, depthWrite: false });
const planeBad = new THREE.MeshBasicMaterial({ color: '#ff5d5d', transparent: true, opacity: 0.42, depthWrite: false });
const planeSelect = new THREE.MeshBasicMaterial({ color: '#f5c04a', transparent: true, opacity: 0.45, depthWrite: false });
const planeRemove = new THREE.MeshBasicMaterial({ color: '#ff5d5d', transparent: true, opacity: 0.3, depthWrite: false });
const edgeMaterial = new THREE.LineBasicMaterial({ color: '#f5c04a' });

interface GhostProps {
  type: BuildingTypeId;
  rotation: number;
  variant: number;
  wall: string;
  roof: string;
  ax: number;
  az: number;
  ok: boolean;
}

function BuildingGhost({ type, rotation, variant, wall, roof, ax, az, ok }: GhostProps) {
  const tiles = useApp((s) => s.world.tiles);
  const built = useMemo(() => getBuildingGeometry(type, variant, wall, roof), [type, variant, wall, roof]);
  const fp = footprintRect(type, rotation, ax, az);
  const inside = fp.x0 >= 0 && fp.z0 >= 0 && fp.x0 + fp.w <= tiles.size && fp.z0 + fp.d <= tiles.size;
  if (!inside) return null;
  const baseY = rectHeightRange(tiles, fp.x0, fp.z0, fp.w, fp.d).max + 0.02;
  return (
    <group>
      <mesh geometry={planeGeometry} material={ok ? planeOk : planeBad} position={[fp.x0 + fp.w / 2, baseY + 0.04, fp.z0 + fp.d / 2]} scale={[fp.w, 1, fp.d]} renderOrder={5} />
      <group position={[fp.x0 + fp.w / 2, baseY, fp.z0 + fp.d / 2]} rotation={[0, (-rotation * Math.PI) / 2, 0]}>
        <mesh geometry={built.solid} material={ok ? ghostOk : ghostBad} renderOrder={6} />
      </group>
    </group>
  );
}

/** What the active tool would do at the cursor: a ghost building, a coloured footprint, or a removal highlight. */
export function HoverPreview() {
  const hover = useApp((s) => s.hover);
  const tool = useApp((s) => s.tool);
  const build = useApp((s) => s.build);
  const rotation = useApp((s) => s.buildRotation);
  const variant = useApp((s) => s.buildVariant);
  const colors = useApp((s) => s.buildColors);
  const world = useApp((s) => s.world);
  const selectedId = useApp((s) => s.selectedId);
  if (!hover) return null;

  if (tool === 'build' && build.kind === 'building') {
    const def = BUILDING_DEFS[build.type];
    const a = anchorFor(build.type, rotation, hover.gx, hover.gz);
    const ok = validateBuildingPlacement(world, build.type, rotation, a.x, a.z).ok;
    const c = colors ?? def.defaultColors;
    return <BuildingGhost type={build.type} rotation={rotation} variant={variant} wall={c.wall} roof={c.roof} ax={a.x} az={a.z} ok={ok} />;
  }
  if (tool === 'move' && selectedId) {
    const b = world.objects[selectedId];
    if (b?.kind !== 'building') return null;
    const a = anchorFor(b.type, b.rotation, hover.gx, hover.gz);
    const ok = validateBuildingPlacement(world, b.type, b.rotation, a.x, a.z, b.id).ok;
    return <BuildingGhost type={b.type} rotation={b.rotation} variant={b.variant} wall={b.colors.wall} roof={b.colors.roof} ax={a.x} az={a.z} ok={ok} />;
  }
  const tx = Math.floor(hover.gx);
  const tz = Math.floor(hover.gz);
  if (tx < 0 || tz < 0 || tx >= world.size || tz >= world.size) return null;
  if (tool === 'build' && build.kind === 'creature') {
    const ok = placeCreature(world, build.species, hover.gx, hover.gz, 'character_preview000').ok;
    const y = rectHeightRange(world.tiles, tx, tz, 1, 1).max + 0.05;
    return <mesh geometry={planeGeometry} material={ok ? planeOk : planeBad} position={[tx + 0.5, y, tz + 0.5]} renderOrder={5} />;
  }
  if (tool === 'remove') {
    const index = getObjectIndex(world);
    const bi = index.buildingAt[tz * world.size + tx];
    const b = bi ? index.buildings[bi - 1] : null;
    const fp = b ? footprintRect(b.type, b.rotation, b.x, b.z) : { x0: tx, z0: tz, w: 1, d: 1 };
    const y = rectHeightRange(world.tiles, fp.x0, fp.z0, fp.w, fp.d).max + 0.05;
    return <mesh geometry={planeGeometry} material={planeRemove} position={[fp.x0 + fp.w / 2, y, fp.z0 + fp.d / 2]} scale={[fp.w, 1, fp.d]} renderOrder={5} />;
  }
  return null;
}

/** Gold pulsing footprint + wire box around the selected building. */
export function SelectionMarker() {
  const selectedId = useApp((s) => s.selectedId);
  const world = useApp((s) => s.world);
  const ref = useRef<THREE.Mesh>(null);
  const b = selectedId ? world.objects[selectedId] : undefined;
  const fp = b?.kind === 'building' ? footprintRect(b.type, b.rotation, b.x, b.z) : null;
  const height = b?.kind === 'building' ? BUILDING_DEFS[b.type].height : 0;
  const edges = useMemo(() => {
    if (!fp) return null;
    return new THREE.EdgesGeometry(new THREE.BoxGeometry(fp.w + 0.1, height + 0.2, fp.d + 0.1));
  }, [fp?.w, fp?.d, height]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((state) => {
    if (ref.current) (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.32 + 0.18 * Math.sin(state.clock.elapsedTime * 4);
  });
  if (!fp || !edges) return null;
  const range = rectHeightRange(world.tiles, fp.x0, fp.z0, fp.w, fp.d);
  const cx = fp.x0 + fp.w / 2;
  const cz = fp.z0 + fp.d / 2;
  return (
    <group>
      <mesh ref={ref} geometry={planeGeometry} material={planeSelect.clone()} position={[cx, range.max + 0.06, cz]} scale={[fp.w + 0.3, 1, fp.d + 0.3]} renderOrder={5} />
      <lineSegments geometry={edges} material={edgeMaterial} position={[cx, range.max + (height + 0.2) / 2, cz]} />
    </group>
  );
}

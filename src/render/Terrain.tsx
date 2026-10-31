import { useEffect, useMemo } from 'react';
import { SEA_LEVEL } from '../core/constants';
import { EDGE_FLOOR } from '../core/heightfield';
import type { TileGrid } from '../core/types';
import { seaMaterial, riverMaterial, terrainMaterial } from './materials';
import { buildRiverGeometry, buildTerrainGeometry } from './terrainGeometry';
import * as THREE from 'three';

export function Terrain({ tiles }: { tiles: TileGrid }) {
  const geometry = useMemo(() => buildTerrainGeometry(tiles), [tiles]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={terrainMaterial} castShadow receiveShadow name="terrain" />;
}

export function Water({ tiles }: { tiles: TileGrid }) {
  const n = tiles.size;
  const river = useMemo(() => buildRiverGeometry(tiles), [tiles]);
  const sea = useMemo(() => new THREE.BoxGeometry(n, SEA_LEVEL - EDGE_FLOOR, n), [n]);
  useEffect(() => () => river?.dispose(), [river]);
  useEffect(() => () => sea.dispose(), [sea]);
  return (
    <>
      <mesh geometry={sea} material={seaMaterial} position={[n / 2, (SEA_LEVEL + EDGE_FLOOR) / 2, n / 2]} renderOrder={2} name="sea" />
      {river && <mesh geometry={river} material={riverMaterial} renderOrder={3} name="rivers" />}
    </>
  );
}

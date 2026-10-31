import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BUILDING_DEFS } from '../core/buildingDefs';
import { footprintRect } from '../core/buildingDefs';
import { rectHeightRange } from '../core/heightfield';
import { getObjectIndex } from '../core/objectIndex';
import type { World } from '../core/types';
import { timeUniform } from './materials';

const PARTICLES_PER_CHIMNEY = 7;
const smokeGeometry = new THREE.IcosahedronGeometry(1, 0);
const smokeMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.78, depthWrite: false, flatShading: true });
const tmp = new THREE.Object3D();
const smokeColor = new THREE.Color();
const SMOKE_NEW = new THREE.Color('#e9e6df');
const SMOKE_OLD = new THREE.Color('#9d9ca3');

/** Chimney smoke: a ring of puffs per chimney that rise, swell, darken and shrink away on the wind. */
export function Smoke({ world }: { world: Pick<World, 'objects' | 'size' | 'tiles'> }) {
  const emitters = useMemo(() => {
    const out: Array<{ x: number; y: number; z: number; phase: number }> = [];
    for (const b of getObjectIndex(world).buildings) {
      const def = BUILDING_DEFS[b.type];
      if (!def.smoke) continue;
      const fp = footprintRect(b.type, b.rotation, b.x, b.z);
      const baseY = rectHeightRange(world.tiles, fp.x0, fp.z0, fp.w, fp.d).max + 0.02;
      const a = (-b.rotation * Math.PI) / 2;
      const lx = def.smoke.x * Math.cos(a) + def.smoke.z * Math.sin(a);
      const lz = -def.smoke.x * Math.sin(a) + def.smoke.z * Math.cos(a);
      out.push({ x: fp.x0 + fp.w / 2 + lx, y: baseY + def.smoke.y, z: fp.z0 + fp.d / 2 + lz, phase: (b.x * 0.173 + b.z * 0.291) % 1 });
    }
    return out;
  }, [world]);

  const ref = useRef<THREE.InstancedMesh>(null);
  const count = emitters.length * PARTICLES_PER_CHIMNEY;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < count; i++) mesh.setColorAt(i, SMOKE_NEW);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count]);

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    let i = 0;
    for (const e of emitters) {
      for (let k = 0; k < PARTICLES_PER_CHIMNEY; k++, i++) {
        const age = (t * 0.3 + k / PARTICLES_PER_CHIMNEY + e.phase) % 1;
        const fade = 1 - Math.min(1, Math.max(0, (age - 0.7) / 0.3));
        tmp.position.set(e.x + age * 0.9 + Math.sin(t * 1.3 + k * 2.1) * 0.05, e.y + age * 1.7, e.z + age * 0.3 + Math.cos(t * 1.1 + k) * 0.05);
        tmp.scale.setScalar((0.07 + age * 0.26) * fade);
        tmp.rotation.set(age * 3, k, 0);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
        mesh.setColorAt(i, smokeColor.copy(SMOKE_NEW).lerp(SMOKE_OLD, age));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  if (count === 0) return null;
  return <instancedMesh key={count} ref={ref} args={[smokeGeometry, smokeMaterial, count]} frustumCulled={false} />;
}

// ---------------------------------------------------------------- birds

const BIRDS = 9;
const birdMaterial = (() => {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.y += sin(uTime * 9.0 + instanceMatrix[3].x * 2.7) * abs(position.x) * 1.5;`,
      );
  };
  m.customProgramCacheKey = () => 'bird-flap';
  return m;
})();

function birdGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    0, 0, 0.14, -0.34, 0, -0.04, 0, 0, -0.1,
    0, 0, 0.14, 0, 0, -0.1, 0.34, 0, -0.04,
    0, 0, 0.14, 0.05, 0.02, -0.02, -0.05, 0.02, -0.02,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  const c = new Float32Array(27);
  for (let i = 0; i < 9; i++) {
    const body = i >= 6;
    c[i * 3] = body ? 0.12 : 0.2;
    c[i * 3 + 1] = body ? 0.12 : 0.21;
    c[i * 3 + 2] = body ? 0.14 : 0.24;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** A couple of small flocks wheeling high above the land. Wings flap in the vertex shader. */
export function Birds({ size }: { size: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(birdGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const flock = useMemo(
    () =>
      Array.from({ length: BIRDS }, (_, i) => {
        const f = i % 3;
        return {
          cx: size * (0.3 + 0.2 * f),
          cz: size * (0.35 + 0.15 * ((f * 2) % 3)),
          r: 6 + f * 4 + (i % 3) * 0.9,
          speed: 0.16 + f * 0.04,
          off: i * 0.55,
          alt: 8 + f * 1.4 + (i % 3) * 0.35,
        };
      }),
    [size],
  );
  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    flock.forEach((b, i) => {
      const a = t * b.speed + b.off;
      tmp.position.set(b.cx + Math.cos(a) * b.r, b.alt + Math.sin(a * 2.3) * 0.35, b.cz + Math.sin(a) * b.r);
      tmp.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), Math.sin(a * 3) * 0.25);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geometry, birdMaterial, BIRDS]} frustumCulled={false} />;
}

// ---------------------------------------------------------------- clouds

const cloudMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/**
 * Clouds cast soft drifting shadows over the land. The clouds themselves draw nothing, so they
 * never hide the map; only their shadows are seen.
 */
export function CloudShadows({ size }: { size: number }) {
  const group = useRef<THREE.Group>(null);
  const clouds = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    const list = Array.from({ length: 4 }, (_, i) => {
      const g = new THREE.SphereGeometry(1, 8, 5);
      geos.push(g);
      return { geo: g, x: (i * 0.31 + 0.05) * size * 1.5 - size * 0.25, z: ((i * 0.43 + 0.1) % 1) * size, s: 2.2 + (i % 3) * 0.9, speed: 0.45 + (i % 3) * 0.15 };
    });
    return { list, geos };
  }, [size]);
  useEffect(() => () => clouds.geos.forEach((g) => g.dispose()), [clouds]);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    g.children.forEach((child, i) => {
      const c = clouds.list[i];
      child.position.x += c.speed * Math.min(dt, 0.1);
      if (child.position.x > size * 1.35) child.position.x = -size * 0.35;
    });
  });
  return (
    <group ref={group}>
      {clouds.list.map((c, i) => (
        <group key={i} position={[c.x, 30, c.z]}>
          <mesh geometry={c.geo} material={cloudMaterial} scale={[c.s * 1.5, 0.9, c.s]} castShadow />
          <mesh geometry={c.geo} material={cloudMaterial} position={[c.s * 0.9, 0, c.s * 0.3]} scale={[c.s, 0.8, c.s * 0.75]} castShadow />
          <mesh geometry={c.geo} material={cloudMaterial} position={[-c.s * 0.9, 0, -c.s * 0.2]} scale={[c.s * 0.9, 0.7, c.s * 0.7]} castShadow />
        </group>
      ))}
    </group>
  );
}

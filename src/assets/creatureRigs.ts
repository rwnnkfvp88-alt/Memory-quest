import * as THREE from 'three';
import type { Actor } from '../sim/creatures';
import type { CharacterObject } from '../core/types';
import { GeoBuilder } from './geo';

/**
 * Jointed creature models. Torso+head are one merged mesh; limbs are separate meshes pivoting at
 * hip/shoulder so the walk cycle is real rotation, not a sprite flip. Poses are driven by the
 * simulation's `phase`, which advances with distance travelled, so feet never skate.
 */
export interface Rig {
  root: THREE.Group;
  pose(actor: Actor, time: number): void;
  setSelected(on: boolean): void;
  dispose(): void;
}

const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
const ringMaterial = new THREE.MeshBasicMaterial({ color: '#f5c04a', transparent: true, opacity: 0.9, depthTest: false });
const ringGeometry = new THREE.RingGeometry(0.3, 0.38, 24).rotateX(-Math.PI / 2);

function mesh(geo: THREE.BufferGeometry, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, lambert);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}

function selectionRing(): THREE.Mesh {
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.y = 0.04;
  ring.renderOrder = 10;
  ring.visible = false;
  return ring;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export function createVillagerRig(c: CharacterObject): Rig {
  const { tunic, hair, skin, hat } = c.appearance;
  const body = cached(`v-body|${tunic}|${hair}|${skin}|${hat}`, () => {
    const b = new GeoBuilder();
    b.box(0.2, 0.3, 0.14, 0, 0.26, 0, tunic);
    b.box(0.21, 0.05, 0.15, 0, 0.26, 0, '#3a2a1c', { flat: true }); // belt
    b.blob(0.095, 1, 0, 0.7, 0, skin, { flat: true });
    if (hat) {
      b.cone(0.13, 0.14, 0, 0.74, 0, '#7a5a34', 7);
      b.cyl(0.14, 0.14, 0.02, 0, 0.73, 0, '#6a4c2a', 8);
    } else {
      b.blob(0.1, 1, 0, 0.73, -0.015, hair, { sy: 0.8, flat: true });
    }
    return b.finish().solid!;
  });
  const leg = cached(`v-leg|${tunic}`, () => {
    const b = new GeoBuilder();
    b.box(0.085, 0.27, 0.09, 0, -0.27, 0, '#4a3a2c');
    b.box(0.09, 0.05, 0.12, 0, -0.29, 0.015, '#2e231a', { flat: true });
    return b.finish().solid!;
  });
  const arm = cached(`v-arm|${tunic}|${skin}`, () => {
    const b = new GeoBuilder();
    b.box(0.065, 0.24, 0.07, 0, -0.24, 0, tunic);
    b.blob(0.04, 0, 0, -0.26, 0, skin, { flat: true });
    return b.finish().solid!;
  });

  const root = new THREE.Group();
  root.userData.objectId = c.id;
  const inner = new THREE.Group();
  inner.scale.setScalar(0.85);
  root.add(inner);
  const torso = mesh(body);
  const legL = mesh(leg, -0.055, 0.28, 0);
  const legR = mesh(leg, 0.055, 0.28, 0);
  const armL = mesh(arm, -0.135, 0.53, 0);
  const armR = mesh(arm, 0.135, 0.53, 0);
  const ring = selectionRing();
  inner.add(torso, legL, legR, armL, armR);
  root.add(ring);
  const phaseOffset = (c.id.charCodeAt(c.id.length - 1) % 7) * 0.9;

  return {
    root,
    pose(a, time) {
      root.position.set(a.x, a.y, a.z);
      root.rotation.y = a.heading;
      if (a.mode === 'walk') {
        const s = Math.sin(a.phase);
        legL.rotation.x = s * 0.75;
        legR.rotation.x = -s * 0.75;
        armL.rotation.x = -s * 0.6;
        armR.rotation.x = s * 0.6;
        inner.position.y = Math.abs(Math.cos(a.phase)) * 0.025;
        torso.rotation.z = Math.sin(a.phase) * 0.04;
      } else {
        legL.rotation.x = legR.rotation.x = 0;
        const breathe = Math.sin(time * 1.7 + phaseOffset);
        armL.rotation.x = breathe * 0.04;
        armR.rotation.x = -breathe * 0.04;
        inner.position.y = 0;
        torso.rotation.z = 0;
        torso.position.y = breathe * 0.004;
      }
    },
    setSelected(on) {
      ring.visible = on;
    },
    dispose() {},
  };
}

export function createSheepRig(c: CharacterObject): Rig {
  const tint = c.appearance.hair;
  const wool = cached('s-wool', () => {
    const b = new GeoBuilder();
    b.blob(0.2, 1, 0, 0.3, 0, '#f1ede2', { sx: 0.95, sy: 0.85, sz: 1.35, flat: true });
    b.blob(0.13, 1, 0.1, 0.4, -0.12, '#f7f4ea', { flat: true });
    b.blob(0.13, 1, -0.1, 0.38, 0.1, '#ebe6da', { flat: true });
    return b.finish().solid!;
  });
  const head = cached(`s-head|${tint}`, () => {
    const b = new GeoBuilder();
    b.box(0.13, 0.13, 0.17, 0, -0.065, 0.08, '#3d342d', { flat: true });
    b.box(0.2, 0.05, 0.05, 0, 0.02, 0.0, '#3d342d', { flat: true }); // ears
    b.box(0.15, 0.1, 0.1, 0, 0.0, -0.02, '#f1ede2', { flat: true });
    return b.finish().solid!;
  });
  const leg = cached('s-leg', () => {
    const b = new GeoBuilder();
    b.box(0.05, 0.2, 0.05, 0, -0.2, 0, '#3d342d', { flat: true });
    return b.finish().solid!;
  });

  const root = new THREE.Group();
  root.userData.objectId = c.id;
  const inner = new THREE.Group();
  root.add(inner);
  const bodyMesh = mesh(wool);
  const headMesh = mesh(head, 0, 0.4, 0.28);
  // Diagonal leg pairs share a rotation so the gait reads as a trot.
  const legs = [mesh(leg, -0.09, 0.2, 0.17), mesh(leg, 0.09, 0.2, -0.17), mesh(leg, 0.09, 0.2, 0.17), mesh(leg, -0.09, 0.2, -0.17)];
  const ring = selectionRing();
  inner.add(bodyMesh, headMesh, ...legs);
  root.add(ring);
  inner.scale.setScalar(1.1);
  const seed = (c.id.charCodeAt(c.id.length - 2) % 9) * 0.7;

  return {
    root,
    pose(a, time) {
      root.position.set(a.x, a.y, a.z);
      root.rotation.y = a.heading;
      if (a.mode === 'walk') {
        const s = Math.sin(a.phase);
        legs[0].rotation.x = legs[1].rotation.x = s * 0.55;
        legs[2].rotation.x = legs[3].rotation.x = -s * 0.55;
        inner.position.y = Math.abs(Math.cos(a.phase)) * 0.02;
        headMesh.rotation.x = 0.1;
      } else {
        for (const l of legs) l.rotation.x = 0;
        inner.position.y = 0;
        // Grazing: the head dips and lifts in slow bites.
        const bite = a.mode === 'graze' ? Math.max(0, Math.sin(time * 1.4 + seed)) : 0;
        headMesh.rotation.x = 0.1 + bite * 0.9;
      }
    },
    setSelected(on) {
      ring.visible = on;
    },
    dispose() {},
  };
}

export function createRig(c: CharacterObject): Rig {
  return c.species === 'villager' ? createVillagerRig(c) : createSheepRig(c);
}

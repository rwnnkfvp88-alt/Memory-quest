import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { createRig, type Rig } from '../assets/creatureRigs';
import { getObjectIndex } from '../core/objectIndex';
import type { World } from '../core/types';
import { CreatureSim } from '../sim/creatures';
import { useApp } from '../state/store';
import { simRegistry } from './simRegistry';

/**
 * Owns the creature simulation and one jointed rig per creature object. A single frame loop steps
 * the sim then poses every rig, so there is no ordering hazard between sim and render.
 */
export function Creatures({ world }: { world: World }) {
  const simRef = useRef<CreatureSim | null>(null);
  const rigs = useRef(new Map<string, Rig>());
  const groupRef = useRef<THREE.Group>(null);

  const characters = useMemo(() => getObjectIndex(world).characters, [world]);

  useEffect(() => {
    if (!simRef.current) {
      simRef.current = new CreatureSim(world);
      simRegistry.current = simRef.current;
    } else simRef.current.sync(world);
    const group = groupRef.current;
    if (!group) return;
    const wanted = new Map(characters.map((c) => [c.id, c]));
    for (const [id, rig] of rigs.current) {
      if (!wanted.has(id)) {
        group.remove(rig.root);
        rig.dispose();
        rigs.current.delete(id);
      }
    }
    for (const [id, c] of wanted) {
      if (!rigs.current.has(id)) {
        const rig = createRig(c);
        rigs.current.set(id, rig);
        group.add(rig.root);
      }
    }
  }, [world, characters]);

  useFrame((state, dt) => {
    const sim = simRef.current;
    if (!sim) return;
    sim.update(dt);
    const selected = useApp.getState().selectedId;
    for (const [id, rig] of rigs.current) {
      const actor = sim.actors.get(id);
      if (!actor) continue;
      rig.pose(actor, state.clock.elapsedTime);
      rig.setSelected(id === selected);
    }
  });

  return <group ref={groupRef} />;
}

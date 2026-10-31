import type { BuildingColors, BuildingTypeId } from './types';

/**
 * Pure data about each building type (no rendering code), so placement rules, the
 * simulation and the save codec can all reason about buildings without loading three.js.
 * Geometry lives in assets/buildingGeometry.ts. Local building space has its origin at
 * the footprint centre on the ground.
 */
export interface BuildingDef {
  id: BuildingTypeId;
  name: string;
  blurb: string;
  /** Footprint in tiles at rotation 0. */
  footprint: { w: number; d: number };
  /** Approximate height in world units. */
  height: number;
  variants: number;
  defaultColors: BuildingColors;
  /** Chimney outlet in local space (rotation 0); a smoke plume rises from here. */
  smoke?: { x: number; y: number; z: number };
}

export const WALL_COLORS = [
  { name: 'Cream plaster', value: '#e9dcc0' },
  { name: 'Warm clay', value: '#d9b48f' },
  { name: 'Whitewash', value: '#f1ece0' },
  { name: 'River stone', value: '#aeb3b0' },
  { name: 'Honey timber', value: '#c79a63' },
  { name: 'Rose lime', value: '#dfb7a5' },
];

export const ROOF_COLORS = [
  { name: 'Terracotta', value: '#b24c32' },
  { name: 'Dark oak', value: '#5e4430' },
  { name: 'Moss shingle', value: '#4f7048' },
  { name: 'Slate blue', value: '#46597f' },
  { name: 'Golden thatch', value: '#c9a24c' },
  { name: 'Plum tile', value: '#7a4361' },
];

export const BUILDING_DEFS: Record<BuildingTypeId, BuildingDef> = {
  cottage: {
    id: 'cottage',
    name: 'Cottage',
    blurb: 'A snug timber-framed home with a hearth.',
    footprint: { w: 2, d: 2 },
    height: 2.3,
    variants: 3,
    defaultColors: { wall: '#e9dcc0', roof: '#b24c32' },
    smoke: { x: 0.45, y: 2.25, z: -0.3 },
  },
  tavern: {
    id: 'tavern',
    name: 'Tavern',
    blurb: 'Two storeys of ale, song and gossip.',
    footprint: { w: 3, d: 2 },
    height: 2.9,
    variants: 3,
    defaultColors: { wall: '#d9b48f', roof: '#5e4430' },
    smoke: { x: -0.9, y: 2.85, z: 0.2 },
  },
  blacksmith: {
    id: 'blacksmith',
    name: 'Blacksmith',
    blurb: 'Open forge, anvil and a stack of iron.',
    footprint: { w: 3, d: 2 },
    height: 2.2,
    variants: 2,
    defaultColors: { wall: '#aeb3b0', roof: '#46597f' },
    smoke: { x: 0.95, y: 2.55, z: -0.35 },
  },
  windmill: {
    id: 'windmill',
    name: 'Windmill',
    blurb: 'Turning sails grind the valley harvest.',
    footprint: { w: 2, d: 2 },
    height: 4.2,
    variants: 2,
    defaultColors: { wall: '#f1ece0', roof: '#5e4430' },
  },
  watchtower: {
    id: 'watchtower',
    name: 'Watchtower',
    blurb: 'Stone lookout with a banner on the wind.',
    footprint: { w: 2, d: 2 },
    height: 5,
    variants: 2,
    defaultColors: { wall: '#aeb3b0', roof: '#b24c32' },
  },
};

export const BUILDING_ORDER: BuildingTypeId[] = ['cottage', 'tavern', 'blacksmith', 'windmill', 'watchtower'];

export function isBuildingType(value: unknown): value is BuildingTypeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BUILDING_DEFS, value);
}

/** Footprint rectangle (tile units) of a building at rotation `rot` anchored at its min corner. */
export function footprintRect(type: BuildingTypeId, rot: number, x: number, z: number): { x0: number; z0: number; w: number; d: number } {
  const { w, d } = BUILDING_DEFS[type].footprint;
  const swap = rot % 2 === 1;
  return { x0: Math.floor(x), z0: Math.floor(z), w: swap ? d : w, d: swap ? w : d };
}

import type { Rng } from './rng';
import type { CreatureAppearance } from './types';

const VILLAGER_NAMES = [
  'Aldric', 'Maren', 'Bram', 'Isolde', 'Corwin', 'Edda', 'Garrick', 'Hilde', 'Joren', 'Lysa',
  'Osric', 'Petra', 'Quill', 'Rowan', 'Sybil', 'Tobin', 'Una', 'Wystan', 'Yara', 'Fenn',
];
const TUNICS = ['#8c3b2f', '#2f5d8c', '#4d7a3a', '#8a6a2b', '#6a3f7a', '#3a7a78', '#a65a2a', '#5f6b78'];
const HAIR = ['#2b1d12', '#5a3a1e', '#8b5a2b', '#c8a24a', '#9a9a9a', '#6b2b1e'];
const SKIN = ['#f0c9a4', '#d9a577', '#b57a4f', '#8a5a3a', '#f5d6b8'];

export function randomAppearance(rng: Rng): CreatureAppearance {
  return { tunic: rng.pick(TUNICS), hair: rng.pick(HAIR), skin: rng.pick(SKIN), hat: rng.chance(0.4) };
}

export function randomVillagerName(rng: Rng): string {
  return rng.pick(VILLAGER_NAMES);
}


import type { CreatureSim } from '../sim/creatures';

/** Lets debug/test tooling observe the running creature simulation without touching React state. */
export const simRegistry: { current: CreatureSim | null } = { current: null };

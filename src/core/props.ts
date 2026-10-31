import type { PropType } from './types';

export const PROP_TYPES: readonly PropType[] = ['oak', 'pine', 'bush', 'rock', 'flowers'];
/** Props that stop creatures walking through their tile. */
export const BLOCKING_PROPS: ReadonlySet<PropType> = new Set<PropType>(['oak', 'pine', 'rock']);

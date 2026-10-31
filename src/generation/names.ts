import type { Rng } from '../core/rng';

const START = ['Ald', 'Bran', 'Cinder', 'Dun', 'Elder', 'Fen', 'Grey', 'High', 'Iron', 'Lark', 'Mist', 'Oak', 'Raven', 'Storm', 'Thorn', 'West', 'Amber', 'Wolf'];
const END = ['mere', 'wick', 'fall', 'moor', 'glen', 'watch', 'vale', 'haven', 'hollow', 'shire', 'reach', 'ford'];

export function worldName(rng: Rng): string {
  return `${rng.pick(START)}${rng.pick(END)}`;
}

const SEED_A = ['amber', 'ashen', 'brisk', 'cobalt', 'dusky', 'ember', 'frost', 'gilded', 'hollow', 'ivory', 'jade', 'lunar', 'mossy', 'north', 'onyx', 'pale', 'quiet', 'rune', 'silver', 'tidal'];
const SEED_B = ['fox', 'owl', 'wren', 'stag', 'hare', 'crow', 'pike', 'moth', 'elk', 'newt', 'lynx', 'swan', 'toad', 'wolf', 'finch', 'heron'];

/** Friendly random seed for the dice button. Uses Math.random on purpose: it's user entropy, not generation. */
export function randomSeed(random: () => number = Math.random): string {
  const a = SEED_A[Math.floor(random() * SEED_A.length)];
  const b = SEED_B[Math.floor(random() * SEED_B.length)];
  return `${a}-${b}-${100 + Math.floor(random() * 900)}`;
}

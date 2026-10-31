import type { Rng } from './rng';

/**
 * Stable identifiers. An ID is minted once and never changes, no matter how the
 * thing it names is moved, rotated, recolored, renamed or re-saved. Memory
 * locations, journeys and (later) cloud sync all key off these.
 */
export type IdPrefix = 'world' | 'building' | 'prop' | 'character' | 'memory' | 'journey' | 'asset';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford base32, no ambiguous glyphs
const ID_BODY_LENGTH = 12;
export const ID_PATTERN = /^[a-z]+_[0-9a-z]{8,}$/;

export function newId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(ID_BODY_LENGTH);
  crypto.getRandomValues(bytes);
  let body = '';
  for (const b of bytes) body += ALPHABET[b & 31];
  return `${prefix}_${body}`;
}

/** Deterministic ID from a seeded stream; used for generated content so a world re-created from the same inputs matches. */
export function idFromRng(prefix: IdPrefix, rng: Rng): string {
  let body = '';
  for (let i = 0; i < ID_BODY_LENGTH; i++) body += ALPHABET[Math.floor(rng.next() * 32)];
  return `${prefix}_${body}`;
}

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

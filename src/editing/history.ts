import { MAX_UNDO_DEPTH } from '../core/constants';
import type { World } from '../core/types';

/**
 * Undo/redo by snapshot. Edits never mutate a world, so a snapshot is just the previous
 * `objects` reference (structural sharing keeps this cheap).
 */
export interface Snapshot {
  objects: World['objects'];
  customized: boolean;
}

export interface History {
  past: Snapshot[];
  future: Snapshot[];
}

export const emptyHistory: History = { past: [], future: [] };

export const snapshotOf = (world: World): Snapshot => ({ objects: world.objects, customized: world.customized });

/** Record the state BEFORE an edit. Clears redo, as editors do. */
export function record(history: History, before: Snapshot): History {
  const past = [...history.past, before];
  if (past.length > MAX_UNDO_DEPTH) past.shift();
  return { past, future: [] };
}

export function undo(history: History, current: Snapshot): { history: History; snapshot: Snapshot } | null {
  const snapshot = history.past[history.past.length - 1];
  if (!snapshot) return null;
  return { snapshot, history: { past: history.past.slice(0, -1), future: [current, ...history.future] } };
}

export function redo(history: History, current: Snapshot): { history: History; snapshot: Snapshot } | null {
  const snapshot = history.future[0];
  if (!snapshot) return null;
  return { snapshot, history: { past: [...history.past, current], future: history.future.slice(1) } };
}

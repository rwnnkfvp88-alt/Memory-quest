import { cameraState } from '../render/cameraState';
import { Persistence, createRepository } from '../state/persistence';
import { useApp } from '../state/store';

const { repo, durable } = createRepository();

/** The one persistence service for the running app. */
export const persistence = new Persistence(useApp, repo, () => cameraState.getView(), durable);

let bootPromise: Promise<void> | null = null;
/** Idempotent: safe under React StrictMode's double effects. */
export function bootApp(): Promise<void> {
  if (!bootPromise) {
    persistence.start();
    bootPromise = persistence.boot();
  }
  return bootPromise;
}

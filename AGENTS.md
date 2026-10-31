# AGENTS.md: working on Mnemosyne

Read this before changing anything. It is short on purpose.

## What this project is

A browser-based fantasy world editor that will become a memory-palace tool. Product vision and the
milestone plan live in [ROADMAP.md](ROADMAP.md); the architecture in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Non-negotiable rules

1. **The world is data, never a scene.** Everything the user made lives in the `World` value
   (`src/core/types.ts`). Rendering reads it; it never stores truth. If a feature needs state that must
   survive a reload, it belongs in `World`, in the codec, with a migration.
2. **Stable IDs.** Every world, building, prop, creature (and later memory location, journey, asset)
   has an ID minted once (`src/core/ids.ts`) that never changes through move, rotate, recolor, rename,
   save, export or import. Never key anything user-facing by array index, position or name.
3. **No decorative controls.** Do not add a button, tab or menu item for something that does not
   work. Unbuilt features have no UI. Every control must have an e2e or unit test that exercises it.
4. **Never silently destroy user work.** Anything that could discard edits (regenerate, import, delete)
   either keeps the old data (library copy) or asks first. Imports never overwrite an existing world.
5. **Preserve what works.** Run `npm test` and `npm run test:e2e` before declaring done. A regression
   in an earlier milestone is a failure of the current one.
6. **One complete feature at a time.** Finish, test and document it before starting the next.

## Layering (imports flow downward only)

```
ui, render  →  state  →  editing, sim, generation, storage  →  assets(defs)  →  core
```

- `core/`, `generation/`, `editing/`, `sim/`, `storage/` must not import React, three.js or the DOM.
  (`assets/geo*` and `render/` may import three.)
- `generation` is pure: `(seed, size, terrain) → World`. No `Math.random`, no `Date.now` except via options.
- `editing/commands.ts` functions take a `World` and return a **new** `World` or a refusal. Never mutate.
- `render/` components read the store with selectors and never write world data directly.

## Common tasks

**Add a building type**
1. Add its id to `BuildingTypeId` (`core/types.ts`) and a definition to `BUILDING_DEFS` (`core/buildingDefs.ts`):
   footprint, height, variants, default colours, optional `smoke` outlet.
2. Add a builder in `assets/buildingGeometry.ts` (local space: origin at footprint centre, +z is the front).
   Keep every part inside the footprint ±0.25. `tests/geometry.test.ts` enforces it for every variant.
3. Add its pictogram in `ui/icons.tsx`. The palette is data-driven from `BUILDING_ORDER`.
4. Extend the e2e loop in `e2e/smoke.mjs` and the dims table in its "no creature inside a building" check.

**Change the saved format**
1. Bump `SCHEMA_VERSION` (`core/constants.ts`).
2. Append a migration to `MIGRATIONS` (`storage/migrations.ts`) that upgrades the previous shape.
3. Add a fixture test in `tests/storage.test.ts`. Old files must keep loading.
4. Unknown top-level fields round-trip through `World.extensions`; do not drop them.

**Change generation output**
Bump `GENERATOR_VERSION`. Saved worlds store their terrain and are unaffected; only new worlds change.
Update tests that pin counts only if the change is intended.

**Add an edit command**
Write the pure function in `editing/commands.ts` (+ placement rules in `placement.ts`), test it in
`tests/editing.test.ts`, then expose it through a store action that goes through `commit()` so undo,
autosave and error toasts come for free.

## Commands

```bash
npm test               # unit tests (fast, no browser)
npm run typecheck
npm run build
npm run test:e2e       # needs a build and Playwright; drives the real UI with mouse, touch and files
```

## Conventions

- TypeScript strict; no `any` outside deliberate test mutation helpers.
- Small modules, one responsibility. Prefer a pure function over a class unless it owns state (`CreatureSim`, `Autosaver`).
- Comments explain *why* (a trade-off, an invariant), not what.
- Colours are `#rrggbb` strings in data; geometry bakes them into vertex colours.
- Performance budget: < 400 draw calls, pixel ratio ≤ 2, no React state updates per frame (use refs / `useFrame`).
- Commits: imperative, explain the why. Keep `main` green.

## Gotchas learned the hard way

- `getObjectIndex(world)` is cached by `world.objects` identity. Always create a new `objects` record on edit.
- `CameraState.setView()` also redefines the "home" that Reset returns to.
- Placing a building clears trees in its footprint, so undo restores *more than one* object.
- Rotation pivots about the footprint centre but nudges up to one tile to fit; don't "simplify" that away.
- Pickable things (buildings, creatures) live under the scene group named `pickables`; flora is deliberately not pickable.

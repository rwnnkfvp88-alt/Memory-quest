# Mnemosyne

A fantasy world-building editor and memory-palace workshop. Generate a medieval landscape, raise
buildings on it, walk its villagers through the streets, and (in later milestones) turn every
door, hearth and road into a place to anchor something you want to remember.

> **Status: Milestone 1 complete.** A generated, explorable isometric medieval landscape with five
> placeable building types, camera controls, animated characters, and working save/load.
> See [ROADMAP.md](ROADMAP.md) for what comes next, and [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) for the
> evidence that everything listed here actually works.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173, also reachable from an iPad on the same network
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | 113 unit tests (generation, editing, simulation, storage, camera, geometry, store) |
| `npm run test:e2e` | 71 real-browser checks in headless Chromium + WebGL (needs `npm run build` first and Playwright) |

## What you can do today

- **Generate World**: seed, size (48² / 72² / 96²) and terrain (temperate, highlands, islands, plains).
  Rivers, forests, hills, mountains, beaches, wildlife, a bounded sea-moat. Same seed → same world.
- **Build**: cottage, tavern, blacksmith, windmill, watchtower. Place, rotate, move, recolor, restyle,
  rename and remove. Trees are cleared for you; undo brings them back.
- **Creatures**: villagers and sheep wander with real pathfinding, route around what you build, and
  can be added from the palette.
- **Explore**: pan, zoom, rotate with mouse, trackpad, touch, keyboard or on-screen buttons.
- **Keep your work**: autosave to IndexedDB, a multi-world library, export/import as `.mnemosyne.json`,
  undo/redo. Generating over a world you've edited asks first, and never deletes it.

### Controls

| | Mouse / trackpad | Touch | Keyboard |
|---|---|---|---|
| Pan | drag | one finger | WASD / arrows |
| Zoom | wheel / pinch | two-finger pinch | `+` `-` |
| Rotate view | right-drag, Shift-drag | two-finger twist | `Q` `E` |
| Place | click | press to preview, lift to place | |
| Rotate building | | | `R` |
| Move / Remove | | | `M` / `Delete` |
| Undo / Redo / Save | | | `Ctrl/Cmd+Z` / `+Shift+Z` / `+S` |

## How it is organised

```
src/
  core/        types, stable IDs, seeded RNG, heightfield maths, building definitions
  generation/  seed → World. Pure functions: noise, terrain, rivers, flora, creatures
  editing/     pure commands (place/move/rotate/recolor/remove), placement rules, undo history
  sim/         creature pathfinding (A*) and behaviour. No rendering
  assets/      procedural geometry kit, building/prop models, creature rigs
  storage/     world codec + schema migrations, IndexedDB/memory adapters, autosaver
  state/       the zustand store and the persistence orchestrator
  render/      React Three Fiber scene: terrain, water, flora, buildings, camera, input
  ui/          panels, dialogs, shortcuts
tests/         unit tests          e2e/  real-browser acceptance script
docs/          ARCHITECTURE.md, ACCEPTANCE.md
```

The one rule that shapes everything: **the world is data, never a scene.** Generation produces it,
editing rewrites it, storage freezes it, rendering reads it. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

For contributors and AI agents: read [AGENTS.md](AGENTS.md) first.

## Tech

React 19 · TypeScript (strict) · React Three Fiber / three.js · Zustand · Vite · Vitest · IndexedDB.
Tuned for touch iPads: pixel ratio capped at 2, instanced flora (5 draw calls for ~2,000 trees),
merged building meshes (1–3 draw calls each), optional shadows, no per-frame React re-renders.

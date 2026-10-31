# Acceptance tests: Milestone 1

Every claim in the README is backed by an automated check. **Unit** tests run in Node (`npm test`);
**E2E** checks drive the built app in headless Chromium with real WebGL, mouse, keyboard, CDP touch
events, file downloads/uploads and page reloads (`npm run build && npm run test:e2e`).

Last full run: **113/113 unit, 71/71 e2e.**

| ID | Claim | Verified by |
|---|---|---|
| **G1** | Same seed + params → byte-identical terrain, objects and names; different seeds and terrain types differ; world IDs are unique | `tests/generation.test.ts` *G1 determinism*; e2e "seeded terrain is byte-stable" |
| **G2** | Every terrain preset contains deep + shallow water, sand, grass, forest, hills, mountains and rivers; three sizes produce the right grids; the map edge is sea; **every river tile drains downhill to water or the edge**; flora never grows on water; creatures start on open dry ground | `tests/generation.test.ts` *G2 landscape content*, *world edge* |
| **G3** | The Generate World button works with seed / size / terrain controls; generating over edited work asks first, Cancel keeps the world, Confirm keeps the old one in the library; pristine regenerations don't clutter it | e2e *G1 Generate World and the library*; `tests/store.test.ts` |
| **B1** | All five buildings place; refused on deep water, rivers, mountains, out of bounds, overlaps; a refusal explains itself in the HUD and a toast; trees are cleared from the footprint; inputs are never mutated | `tests/editing.test.ts` *B1*; e2e *B1 build* |
| **B2** | Select, rotate (4 orientations, footprint swaps), move, recolor, restyle, rename, remove: IDs stay stable; undo/redo restore exact state; rotation nudges to fit (oracle test); Ctrl+Z works; the Remove tool clears trees | `tests/editing.test.ts` *B2*, *undo/redo*; e2e *B2* |
| **A1** | Creatures only ever stand on walkable tiles for 90 simulated seconds; never inside a building; re-route and are relocated when a building is raised on them; deterministic; walk phase advances; added/removed live; in the browser they actually move and a palette-added villager joins the sim | `tests/sim.test.ts`; e2e *A1 animated creatures* |
| **S1** | Save → load round-trips identically (memory **and** IndexedDB); list/overwrite/delete; export → import reproduces the world; importing an existing ID makes a copy; corrupt, non-JSON, wrong-format, newer-schema and 13 kinds of malformed files are rejected with clear errors and leave the library untouched; unknown fields survive; migrations chain | `tests/storage.test.ts`; e2e *S1/S2* |
| **S2** | Edit → autosave fires by itself (debounced, never loses an edit mid-save, retries after errors) → **page reload restores every building exactly**; manual Save works; export downloads a versioned file with all IDs | `tests/storage.test.ts` *S2*; e2e *S1/S2* |
| **C1** | Camera: wheel zoom (clamped), left-drag pan (without editing), right-drag rotate (eases to a clean isometric angle), Q/E, arrows, +/−, on-screen buttons, reset; **real touch**: one-finger pan, two-finger pinch zoom and twist rotate; zoom keeps the point under the cursor fixed | `tests/camera.test.ts`; e2e *C1* |
| **R1** | The WebGL scene renders; draw calls < 400 (typically ~150–200) with five buildings; geometry is real volume sized to its footprint and distinct per type, recolour reaches the mesh; no console errors across the whole run | `tests/geometry.test.ts`; e2e *R1*, *Console health* |

## Not covered (by design)

- Real-device iPad performance (frame rate under real GPU load). The budget numbers are enforced; the
  device pass is a manual step before each release.
- Visual regression. Screenshots are written to `e2e/shots/` for human review, not pixel-diffed.

## Reproducing

```bash
npm install
npm test
npm run build && npm run test:e2e     # prints ✓/✗ per check, screenshots in e2e/shots/
```

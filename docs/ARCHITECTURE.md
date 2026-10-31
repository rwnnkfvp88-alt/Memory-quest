# Architecture

## The one idea

**The world is data, never a scene.** A `World` is a plain, serialisable value. Generation produces
it, editing rewrites it, storage freezes it, rendering and simulation read it. Nothing about the
scene graph, the DOM or React is allowed to hold information the user would miss after a reload.

```
             ┌────────────────────────── ui/ + render/ (React, three.js) ───────────────────────────┐
             │ panels, dialogs, shortcuts │ terrain, water, flora, buildings, creatures, camera, input │
             └───────────────────────────────────────────┬──────────────────────────────────────────┘
                                                         │ selectors / actions
                                              ┌──────────▼──────────┐
                                              │ state/ (zustand)    │  one store; commit() = history + autosave + errors
                                              │ persistence         │  store ⇄ repository glue, visibility flush
                                              └──┬───────┬───────┬──┘
                       ┌─────────────────────────┘       │       └──────────────────────────┐
              ┌────────▼────────┐             ┌──────────▼─────────┐             ┌──────────▼─────────┐
              │ generation/     │             │ editing/           │             │ storage/           │
              │ seed → World    │             │ World → World      │             │ codec · adapters   │
              │ noise, rivers,  │             │ place/move/rotate/ │             │ migrations ·       │
              │ flora, fauna    │             │ recolor/remove,    │             │ autosaver          │
              └────────┬────────┘             │ placement, history │             └──────────┬─────────┘
                       │                      └──────────┬─────────┘                        │
                       │          ┌──────────────────────┴─────────────┐                    │
                       │          │ sim/  A* + wander behaviour        │                    │
                       │          └──────────────────────┬─────────────┘                    │
                       └──────────────┬──────────────────┴───────────────────────────────────┘
                                      ▼
                               core/  types · ids · rng · heightfield · building defs · object index
```

Imports only flow down. `core`, `generation`, `editing`, `sim` and `storage` import neither React nor
three.js, so every rule they enforce is unit-tested in plain Node.

## Data model

```ts
World {
  id, name, schemaVersion, revision, createdAt, updatedAt,
  generation: { seed, size, terrain, generatorVersion },
  size, tiles: { size, height: Uint8Array, biome: Uint8Array },   // row-major, index = z*size + x
  objects: Record<ObjectId, Building | Prop | Character>,
  customized: boolean,                                            // gates destructive regeneration
  view?: { x, z, zoom, azimuth },                                 // saved camera
  extensions: Record<string, unknown>,                            // unknown fields from newer versions, preserved
}
```

- **Terrain is stored, not re-derived.** Improving the generator next year does not change anyone's
  existing world. `generatorVersion` records what made it.
- **Heights** are quantised to 0..255 (`MAX_HEIGHT` = 11 world units, `SEA_Q` = 80). Tiles are 1×1 unit.
  The render/sampling surface is a smooth `(size+1)²` vertex grid derived from the tiles
  (`core/heightfield.ts`); vertices touching a river tile take the river-bed height, which carves a valley.
- **Stable IDs** (`building_k3x9…`, 12 Crockford-base32 chars): minted once, never reused, never derived from
  position. Generated content gets *deterministic* IDs from a seeded stream so the same world ID + seed
  reproduces the same IDs (tested).
- **`getObjectIndex(world)`** derives buildings/props/characters lists, a per-tile building map and a
  per-tile "blocked" map, cached by `world.objects` identity. Edits always allocate a new record, so the
  cache can never go stale.

## Procedural generation (`generation/`)

Pure: `(seed, size, terrain) → World`. Every random draw comes from a seeded `Rng`; subsystems use
`fork(label)` streams so changing one never disturbs another.

1. **Height field**: Perlin fBm + masked ridged multifractal for mountain ranges + edge fall-off, plus a
   guaranteed 2-tile moat so the world is always a bounded diorama.
2. **Rank-based remap**: land/sea and elevation bands are assigned by *rank*, so each terrain preset dictates
   exactly how much of the land is sand/meadow/hills/peaks/snow while the noise decides *where*.
3. **Rivers**: priority-flood drainage gives every land tile a receiver; each river follows receivers
   from a hill/mountain source to the sea, so it provably reaches water (tested). Beds are carved so they never
   rise downstream; a tributary continues through its parent to keep flow monotone at junctions.
4. **Forest** = wettest grassland. **Flora** by biome. **Creatures** spawn in the most open meadows.

## Editing (`editing/`)

Commands are pure: `(world, args) → { ok, world, id } | { ok: false, reason, message }`.
`placement.ts` owns the rules (bounds, water, rugged terrain, slope ≤ `MAX_BUILD_SLOPE`, overlap).
Placing a building clears wild props in its footprint; creatures are never deleted, they re-route.
Rotation pivots about the footprint centre and nudges up to one tile to fit.

**Undo/redo** stores previous `objects` references (structural sharing, 100 deep). The store's `commit()`
is the single path for edits: history, autosave revision and error toasts all hang off it.

**Regeneration safety**: `Generate World` creates a *new* world. If the current one is `customized` the UI
asks first, and the old world stays in the library. A pristine (never edited, never renamed) world is
discarded when replaced, since its seed reproduces it. Milestone 2 extends this to *protected regions*.

## Simulation (`sim/`)

`CreatureSim` owns one `Actor` per character object: wander → A* path (8-way, no corner cutting, slope-aware,
expansion-capped) → walk → rest. Each actor has its own seeded RNG; the sim is deterministic for a given dt
sequence (tested). Walk-cycle `phase` advances with distance travelled, so feet never skate. When the world
changes, `sync()` rebuilds the walk grid, moves anyone now standing in a building to the nearest open tile, and
drops stale paths. Rendering only *reads* actors.

## Rendering (`render/`)

- **Orthographic isometric camera** (elevation 36°, azimuth 45° + k·90°). `CameraState` is pure maths:
  grab-and-drag pan, zoom-to-cursor, eased rotation that snaps to classic angles on release, clamped bounds.
- **Terrain**: one flat-shaded mesh, per-tile colour with slope-driven rock, plus an earth skirt. **Water**: a
  translucent slab with a shader that ripples and sparkles only on up-facing surfaces; rivers are a 4× sub-grid
  mesh smoothed by a vertex-fraction threshold so staircase courses read as bends.
- **Flora**: five `InstancedMesh`es (oak, pine, bush, rock, flowers), wind sway in the vertex shader.
- **Buildings**: procedural geometry (`assets/geo.ts`): primitives merged per layer into vertex-coloured
  meshes with baked ambient-occlusion ramp. 1–3 draw calls each; geometry cached by type+variant+colours.
  Windmill sails, forge flame and glowing windows are separate layers so they can animate.
- **Creatures**: jointed rigs (torso, hip- and shoulder-pivoted limbs) posed from sim state.
- **Input** (`InputController`): pointer events for mouse *and* touch in one state machine; hover/pick work is
  throttled to one ground pick per frame and only published when the snapped cell changes. Ground picking
  ray-marches the height field (cheap); object picking raycasts only the `pickables` group.
- **Performance** (iPad): DPR ≤ 2, no per-frame React updates, shadow window follows the camera and is sized to
  the visible area, shadows toggle, ~150–200 draw calls typical, geometry/material sharing everywhere.

## Persistence (`storage/`, `state/persistence.ts`)

- **Codec** (`codec.ts`): `World ⇄ { format: "mnemosyne.world", schemaVersion, world }`. Tile arrays are base64.
  Decoding validates *everything* (ids, ranges, enums, tile lengths, duplicate ids) and throws a friendly
  `WorldFormatError`; nothing partially loads. Files from a newer schema are refused with a clear message.
- **Migrations**: ordered list; each upgrades `vN → vN+1`. Add one whenever `SCHEMA_VERSION` changes.
- **Adapters** implement `StorageAdapter` (list/load/save/delete/meta). `IndexedDbAdapter` is the durable store
  (world bodies and lightweight summaries in separate object stores so listing is fast); `MemoryAdapter` backs
  tests and the private-browsing fallback. A cloud adapter slots in without touching callers.
- **Repository** stamps `revision + 1` and `updatedAt` on every save (the hook for conflict detection) and
  turns imports of an already-present world ID into a *copy*, so an import can never overwrite.
- **Autosaver**: debounced, flushes on page hide, never loses an edit made mid-save, retries after errors.

## Extension seams (designed, not yet built)

### Memory palace (Milestone 4)
A memory location is `{ id: memory_*, targetId: ObjectId, journeyIds, content: { text, images, pao, prompt } }`
stored in `World` (new top-level field + migration). It references objects **by stable ID only**, and
`removeObject` will consult it, so editing the world can never silently orphan a memory (the test suite for M4
must prove that move/rotate/recolor/rename preserve every association, and that removal warns first).

### Asset pipeline (designed, not built)
```
 text prompt ─▶ AssetGenerator.generate({ prompt, kind, style, seed })      (server-side proxy; keys never in the browser)
                      │ progress events
                      ▼
               AssetDraft { kind, preview(png), spec }  ─▶ user previews / tweaks / accepts
                      ▼
               AssetLibrary.save(AssetRecord)            IndexedDB `assets` store (cloud later); personal + reusable
                      ▼
               placeAsset command (editing/)             places `asset_*` references like any object
                      ▼
               renderer: asset → BuiltAsset { solid, glow?, … }   same shape buildingGeometry.ts already returns
```
- `AssetRecord { id: asset_*, kind: sprite|texture|decoration|building|character, name, prompt, source:
  procedural|ai|imported, spec, preview, tags, createdAt }`.
- **Style guardrails** converge every source on the house look: palette quantisation to the medieval palette,
  polygon budget, footprint limits. A converter turns a model/voxel/sprite spec into the same vertex-coloured
  `BuiltAsset` the procedural buildings use, so generated art needs no special rendering path.
- **Self-contained exports**: a world embeds a manifest of the assets it uses, so a file opens correctly on
  another device without that device's library.

### Cloud sync (Milestone 7)
A `CloudAdapter implements StorageAdapter`. `revision`/`updatedAt` give optimistic-concurrency; conflicts surface
as a "keep mine / keep theirs / keep both (copy)" dialog, reusing the import-as-copy rule.

## Decisions and trade-offs

| Decision | Why | Cost |
|---|---|---|
| Terrain stored, not re-derived | Permanence: generator improvements never mutate existing worlds | ~10 KB/world base64 |
| Whole-tile terrain with a smoothed vertex surface | Trivial placement/pathing rules, smooth look, rivers carve naturally | Hand terrain sculpting needs a new tool |
| Procedural geometry, merged vertex colours | Real depth, 1–3 draw calls/building, recolour = new cache key, perfect seam for generated art | Hand-authoring models is code, not a DCC tool |
| Pure commands + snapshot undo | Everything testable in Node; undo is a pointer swap | Objects record copied per edit (cheap at this scale) |
| One input state machine for mouse/touch | Identical behaviour everywhere; fewer bugs | Slightly more code than per-device handlers |
| Main-thread generation | Simpler; 10–60 ms at 72² | Move to a Worker before very large worlds |
| Memory-only fallback when IndexedDB is missing | App never hard-fails | Work is lost on refresh; the UI warns loudly |

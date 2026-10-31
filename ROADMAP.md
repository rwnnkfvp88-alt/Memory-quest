# Roadmap

One complete, tested feature at a time. Each milestone ends with working software, updated docs and
passing acceptance tests. Earlier milestones must keep passing.

## ✅ Milestone 1: A living, buildable landscape *(done)*

Generated, explorable isometric medieval terrain; five placeable buildings; camera controls on
mouse/touch/keyboard; animated villagers and sheep; chimney smoke, windmill sails, forge glow, wind-swept
trees, rippling water, drifting birds; autosave, library, export/import, undo/redo.
Evidence: [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

## Milestone 2: Roads, settlements and zoom-to-town

- Roads (A* over terrain cost) joining points of interest; bridges over rivers.
- Settlement generator: villages, towns, castles laid out along roads with building-type mix by size.
- Settlement density control on the Generate panel.
- Semantic zoom: overworld → district → street, with level-of-detail for flora and props.
- **Protected regions:** regeneration never touches user-edited tiles/objects without explicit confirmation
  (the machinery for "regenerate around my village").

## Milestone 3: Interiors and furnishing

- Enter a building: rooms, doors, floors, windows. Walls cut away; first-person-ish orbit view.
- Furniture and decoration placement with grid snapping, rotation, recolor; lighting (hearth, lanterns, candles).
- Custom objects; interior contents saved under the building's stable ID.

## Milestone 4: Memory palace core

- Memory locations attachable to **any** world object (building, room, furniture, creature, tree, river).
- Ordered journeys through settlements and buildings with a route preview.
- Per-location content: images, text, PAO (person-action-object) associations, recall prompts.
- Associations are keyed by stable ID and live in `World`, so every edit preserves them (tests must prove it).

## Milestone 5: Recall mode

- Walk a journey with answers hidden; reveal on demand; self-grade.
- Spaced-repetition scheduling and per-location performance history; progress dashboard.

## Milestone 6: Asset library and AI asset generation

Designed in [docs/ARCHITECTURE.md § Asset pipeline](docs/ARCHITECTURE.md#asset-pipeline-designed-not-built):
- Personal asset library (IndexedDB), previewable and reusable across worlds; worlds embed a manifest so exports are self-contained.
- Text-prompt → sprite / texture / decoration / simple model via a server-side proxy (no keys in the browser).
- Style guardrails (palette quantisation, polygon budget) so generated art matches the medieval fantasy look.
- Customisable variants for buildings, characters and decorations.

## Milestone 7: Sync and sharing

- Cloud adapter behind the existing `StorageAdapter` interface; `revision` + `updatedAt` already support conflict detection.
- Account, multi-device sync, shareable read-only worlds.

## Backlog / known limitations

- Rivers are 1 tile wide and have no bridges; terrain is not yet editable by hand.
- No day/night cycle or weather; lighting is a fixed afternoon.
- Generation runs on the main thread (10–60 ms at 72²); move to a Web Worker before 256² worlds.
- If IndexedDB is unavailable (some private modes) the app falls back to memory and warns; add an auto-export prompt.
- Large worlds render ~2,000 trees as full geometry; add LOD/impostors for 150k+ instances.
- Accessibility: keyboard-only building placement and screen-reader descriptions of the map.
- Lint config (ESLint) not yet added; CI runs typecheck, unit tests and build.

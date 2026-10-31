import { create } from 'zustand';
import { BUILDING_DEFS, footprintRect } from '../core/buildingDefs';
import { getObjectIndex } from '../core/objectIndex';
import type { BuildingColors, BuildingObject, BuildingTypeId, CreatureSpecies, ObjectId, World } from '../core/types';
import { moveBuilding, placeBuilding, placeCreature, recolorBuilding, removeObject, renameObject, rotateBuilding, setBuildingVariant, type EditResult } from '../editing/commands';
import { emptyHistory, record, redo as redoHistory, snapshotOf, undo as undoHistory, type History } from '../editing/history';
import { generateWorld, randomSeed, type GenerateInput } from '../generation';
import type { SaveStatus } from '../storage/autosave';

export type Tool = 'select' | 'build' | 'remove' | 'move';
export type BuildChoice = { kind: 'building'; type: BuildingTypeId } | { kind: 'creature'; species: CreatureSpecies };
export type Dialog =
  | null
  | { kind: 'worlds' }
  | { kind: 'help' }
  | { kind: 'confirm-generate'; input: GenerateInput }
  | { kind: 'confirm-delete'; id: string; name: string };

export interface Notice {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

export interface Hover {
  /** Continuous ground position in tile units. */
  gx: number;
  gz: number;
}

export interface AppState {
  world: World;
  /** Bumps whenever persisted content changes; drives autosave. */
  editRevision: number;
  history: History;
  tool: Tool;
  build: BuildChoice;
  buildRotation: 0 | 1 | 2 | 3;
  buildVariant: number;
  buildColors: BuildingColors | null;
  selectedId: ObjectId | null;
  hover: Hover | null;
  notice: Notice | null;
  dialog: Dialog;
  generating: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  shadows: boolean;
  form: GenerateInput;
  panelOpen: boolean;
  /** Pristine worlds the user replaced via Generate; persistence deletes them from the library. */
  discardQueue: string[];
}

export interface AppActions {
  setForm(patch: Partial<GenerateInput>): void;
  rollSeed(): void;
  requestGenerate(): void;
  generate(input?: GenerateInput): Promise<void>;
  loadWorld(world: World, opts?: { dirty?: boolean; message?: string; discardPrevious?: boolean }): void;
  setTool(tool: Tool): void;
  chooseBuilding(type: BuildingTypeId): void;
  chooseCreature(species: CreatureSpecies): void;
  rotateBuild(): void;
  setBuildVariant(v: number): void;
  setBuildColors(colors: Partial<BuildingColors>): void;
  setHover(h: Hover | null): void;
  tapGround(gx: number, gz: number): void;
  tapObject(id: ObjectId): void;
  removeAt(gx: number, gz: number): void;
  select(id: ObjectId | null): void;
  rotateSelected(turns: number): void;
  recolorSelected(colors: Partial<BuildingColors>): void;
  variantSelected(v: number): void;
  renameSelected(name: string): void;
  removeSelected(): void;
  beginMove(): void;
  undo(): void;
  redo(): void;
  renameWorld(name: string): void;
  notify(text: string, tone?: Notice['tone']): void;
  clearNotice(): void;
  openDialog(d: Dialog): void;
  toggleShadows(): void;
  setPanelOpen(open: boolean): void;
}

const DEFAULT_FORM: GenerateInput = { seed: 'hearthmoor', size: 'medium', terrain: 'temperate' };
export const DEFAULT_INPUT = DEFAULT_FORM;

const nextFrame = (): Promise<void> => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => setTimeout(r, 0)) : setTimeout(r, 0)));

let noticeCounter = 0;

function readShadowPref(): boolean {
  try {
    return localStorage.getItem('mnemosyne.shadows') !== 'off';
  } catch {
    return true;
  }
}

/** Footprint min-corner so the building is centred under a continuous cursor position. */
export function anchorFor(type: BuildingTypeId, rotation: number, gx: number, gz: number): { x: number; z: number } {
  const fp = BUILDING_DEFS[type].footprint;
  const swap = rotation % 2 === 1;
  const w = swap ? fp.d : fp.w;
  const d = swap ? fp.w : fp.d;
  return { x: Math.round(gx - w / 2), z: Math.round(gz - d / 2) };
}

export const useApp = create<AppState & AppActions>((set, get) => {
  /** Apply an edit result: record undo, bump the autosave revision, or explain the refusal. */
  const commit = (result: EditResult): boolean => {
    if (!result.ok) {
      get().notify(result.message, 'error');
      return false;
    }
    const s = get();
    if (result.world === s.world) return true;
    set({ history: record(s.history, snapshotOf(s.world)), world: result.world, editRevision: s.editRevision + 1 });
    return true;
  };

  const selectedBuilding = (): BuildingObject | null => {
    const s = get();
    const o = s.selectedId ? s.world.objects[s.selectedId] : undefined;
    return o && o.kind === 'building' ? o : null;
  };

  return {
    world: generateWorld(DEFAULT_FORM, { id: 'world_bootstrap0000' }),
    editRevision: 0,
    history: emptyHistory,
    tool: 'select',
    build: { kind: 'building', type: 'cottage' },
    buildRotation: 0,
    buildVariant: 0,
    buildColors: null,
    selectedId: null,
    hover: null,
    notice: null,
    dialog: null,
    generating: false,
    saveStatus: 'saved',
    lastSavedAt: null,
    shadows: readShadowPref(),
    form: DEFAULT_FORM,
    panelOpen: true,
    discardQueue: [],

    setForm: (patch) => set({ form: { ...get().form, ...patch } }),
    rollSeed: () => set({ form: { ...get().form, seed: randomSeed() } }),

    requestGenerate() {
      const s = get();
      const input = { ...s.form, seed: s.form.seed.trim() || randomSeed() };
      if (s.world.customized) set({ dialog: { kind: 'confirm-generate', input } });
      else void s.generate(input);
    },

    async generate(input) {
      const s = get();
      const params = input ?? { ...s.form, seed: s.form.seed.trim() || randomSeed() };
      set({ generating: true, dialog: null, form: params });
      await nextFrame();
      try {
        const world = generateWorld(params);
        get().loadWorld(world, { dirty: true, discardPrevious: true, message: `${world.name} rises from the mist.` });
      } finally {
        set({ generating: false });
      }
    },

    loadWorld(world, opts = {}) {
      const s = get();
      // An untouched, generated world is reproducible from its seed, so replacing it shouldn't clutter the library.
      const discard = opts.discardPrevious && !s.world.customized && s.world.id !== world.id ? [...s.discardQueue, s.world.id] : s.discardQueue;
      set({
        discardQueue: discard,
        world,
        history: emptyHistory,
        selectedId: null,
        tool: 'select',
        hover: null,
        editRevision: opts.dirty ? s.editRevision + 1 : s.editRevision,
        form: { seed: world.generation.seed, size: world.generation.size, terrain: world.generation.terrain },
      });
      if (opts.message) get().notify(opts.message, 'success');
    },

    setTool(tool) {
      const s = get();
      if (tool === 'move' && !selectedBuilding()) {
        s.notify('Select a building first, then choose Move.', 'info');
        return;
      }
      set({ tool, hover: null, ...(tool === 'build' ? { selectedId: null } : {}) });
    },

    chooseBuilding(type) {
      set({ tool: 'build', build: { kind: 'building', type }, buildVariant: 0, buildColors: null, selectedId: null, panelOpen: get().panelOpen });
    },
    chooseCreature(species) {
      set({ tool: 'build', build: { kind: 'creature', species }, selectedId: null });
    },
    rotateBuild() {
      set({ buildRotation: (((get().buildRotation + 1) % 4) as 0 | 1 | 2 | 3) });
    },
    setBuildVariant(v) {
      const b = get().build;
      if (b.kind !== 'building') return;
      const count = BUILDING_DEFS[b.type].variants;
      set({ buildVariant: ((v % count) + count) % count });
    },
    setBuildColors(colors) {
      const s = get();
      const base = s.buildColors ?? (s.build.kind === 'building' ? BUILDING_DEFS[s.build.type].defaultColors : { wall: '#e9dcc0', roof: '#b24c32' });
      set({ buildColors: { ...base, ...colors } });
    },
    setHover: (h) => set({ hover: h }),

    tapGround(gx, gz) {
      const s = get();
      if (s.tool === 'build') {
        if (s.build.kind === 'building') {
          const def = BUILDING_DEFS[s.build.type];
          const a = anchorFor(s.build.type, s.buildRotation, gx, gz);
          const r = placeBuilding(s.world, { type: s.build.type, x: a.x, z: a.z, rotation: s.buildRotation, variant: s.buildVariant, colors: s.buildColors ?? def.defaultColors });
          commit(r);
        } else {
          commit(placeCreature(s.world, s.build.species, gx, gz));
        }
      } else if (s.tool === 'move') {
        const b = selectedBuilding();
        if (!b) return;
        const a = anchorFor(b.type, b.rotation, gx, gz);
        if (commit(moveBuilding(s.world, b.id, a.x, a.z))) set({ tool: 'select', hover: null });
      } else if (s.tool === 'remove') {
        s.removeAt(gx, gz);
      } else {
        set({ selectedId: null });
      }
    },

    tapObject(id) {
      const s = get();
      if (s.tool === 'remove') {
        commit(removeObject(s.world, id));
        if (get().selectedId === id) set({ selectedId: null });
      } else if (s.tool === 'select') {
        set({ selectedId: id });
      }
      // In build/move mode taps on objects are handled as ground taps by the input layer.
    },

    removeAt(gx, gz) {
      const s = get();
      const tx = Math.floor(gx);
      const tz = Math.floor(gz);
      const index = getObjectIndex(s.world);
      const bi = index.buildingAt[tz * s.world.size + tx];
      if (bi) {
        commit(removeObject(s.world, index.buildings[bi - 1].id));
        return;
      }
      let best: { id: ObjectId; d: number } | null = null;
      for (const p of index.propsByTile.get(tz * s.world.size + tx) ?? []) {
        const d = Math.hypot(p.x - gx, p.z - gz);
        if (!best || d < best.d) best = { id: p.id, d };
      }
      if (best) commit(removeObject(s.world, best.id));
    },

    select: (id) => set({ selectedId: id, ...(id ? {} : { tool: get().tool === 'move' ? 'select' : get().tool }) }),

    rotateSelected(turns) {
      const b = selectedBuilding();
      if (b) commit(rotateBuilding(get().world, b.id, turns));
    },
    recolorSelected(colors) {
      const b = selectedBuilding();
      if (b) commit(recolorBuilding(get().world, b.id, colors));
    },
    variantSelected(v) {
      const b = selectedBuilding();
      if (b) commit(setBuildingVariant(get().world, b.id, v));
    },
    renameSelected(name) {
      const s = get();
      if (s.selectedId) commit(renameObject(s.world, s.selectedId, name));
    },
    removeSelected() {
      const s = get();
      if (!s.selectedId) return;
      if (commit(removeObject(s.world, s.selectedId))) set({ selectedId: null, tool: 'select' });
    },
    beginMove() {
      get().setTool('move');
    },

    undo() {
      const s = get();
      const r = undoHistory(s.history, snapshotOf(s.world));
      if (!r) return;
      const stillThere = s.selectedId && r.snapshot.objects[s.selectedId] ? s.selectedId : null;
      set({ history: r.history, world: { ...s.world, objects: r.snapshot.objects, customized: r.snapshot.customized }, editRevision: s.editRevision + 1, selectedId: stillThere });
    },
    redo() {
      const s = get();
      const r = redoHistory(s.history, snapshotOf(s.world));
      if (!r) return;
      const stillThere = s.selectedId && r.snapshot.objects[s.selectedId] ? s.selectedId : null;
      set({ history: r.history, world: { ...s.world, objects: r.snapshot.objects, customized: r.snapshot.customized }, editRevision: s.editRevision + 1, selectedId: stillThere });
    },

    renameWorld(name) {
      const s = get();
      const clean = name.trim().slice(0, 48);
      if (!clean || clean === s.world.name) return;
      set({ world: { ...s.world, name: clean, customized: true }, editRevision: s.editRevision + 1 });
    },

    notify(text, tone = 'info') {
      set({ notice: { id: ++noticeCounter, text, tone } });
    },
    clearNotice: () => set({ notice: null }),
    openDialog: (dialog) => set({ dialog }),
    toggleShadows() {
      const next = !get().shadows;
      set({ shadows: next });
      try {
        localStorage.setItem('mnemosyne.shadows', next ? 'on' : 'off');
      } catch {
        /* storage unavailable: preference lasts for this session only */
      }
    },
    setPanelOpen: (panelOpen) => set({ panelOpen }),
  };
});

export { footprintRect };

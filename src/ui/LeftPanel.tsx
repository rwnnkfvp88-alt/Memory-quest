import { BUILDING_DEFS, BUILDING_ORDER, ROOF_COLORS, WALL_COLORS } from '../core/buildingDefs';
import { WORLD_SIZES, WORLD_SIZE_NAMES } from '../core/constants';
import { TERRAIN_TYPES, type TerrainType } from '../core/types';
import { useApp } from '../state/store';
import { BuildingIcon, IconCreature, IconDice, IconRemove, IconRotateCw, IconSelect, IconSheep } from './icons';

const TERRAIN_INFO: Record<TerrainType, { name: string; blurb: string }> = {
  temperate: { name: 'Temperate', blurb: 'Rolling meadows, forests, a few peaks' },
  highlands: { name: 'Highlands', blurb: 'Rugged ridges and high passes' },
  islands: { name: 'Islands', blurb: 'Scattered land in open sea' },
  plains: { name: 'Plains', blurb: 'Broad, gentle farmland' },
};

function GeneratePanel() {
  const form = useApp((s) => s.form);
  const setForm = useApp((s) => s.setForm);
  const rollSeed = useApp((s) => s.rollSeed);
  const request = useApp((s) => s.requestGenerate);
  const generating = useApp((s) => s.generating);
  return (
    <details className="card fold" open>
      <summary id="gen-h"><h2>Generate World</h2></summary>
      <label className="field">
        <span>Seed</span>
        <div className="seed-row">
          <input
            value={form.seed}
            onChange={(e) => setForm({ seed: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && request()}
            spellCheck={false}
            autoCapitalize="off"
            aria-label="World seed"
            placeholder="any words or numbers"
          />
          <button className="icon-btn" onClick={rollSeed} aria-label="Random seed" title="Random seed"><IconDice /></button>
        </div>
      </label>
      <div className="field">
        <span id="size-l">World size</span>
        <div className="segmented" role="radiogroup" aria-labelledby="size-l">
          {WORLD_SIZE_NAMES.map((n) => (
            <button key={n} role="radio" aria-checked={form.size === n} className={form.size === n ? 'on' : ''} onClick={() => setForm({ size: n })}>
              {n[0].toUpperCase() + n.slice(1)}
              <small>{WORLD_SIZES[n]}²</small>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span id="terrain-l">Terrain</span>
        <div className="terrain-grid" role="radiogroup" aria-labelledby="terrain-l">
          {TERRAIN_TYPES.map((t) => (
            <button key={t} role="radio" aria-checked={form.terrain === t} className={form.terrain === t ? 'on' : ''} onClick={() => setForm({ terrain: t })} title={TERRAIN_INFO[t].blurb}>
              <strong>{TERRAIN_INFO[t].name}</strong>
              <small>{TERRAIN_INFO[t].blurb}</small>
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn--primary btn--wide" onClick={request} disabled={generating} data-testid="generate">
        {generating ? 'Shaping the land…' : 'Generate World'}
      </button>
    </details>
  );
}

function Swatches({ label, colors, value, onPick }: { label: string; colors: Array<{ name: string; value: string }>; value: string; onPick: (v: string) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="swatches">
        {colors.map((c) => (
          <button key={c.value} className={`swatch ${value.toLowerCase() === c.value.toLowerCase() ? 'on' : ''}`} style={{ background: c.value }} title={c.name} aria-label={`${label}: ${c.name}`} aria-pressed={value.toLowerCase() === c.value.toLowerCase()} onClick={() => onPick(c.value)} />
        ))}
        <label className="swatch swatch--custom" title={`Custom ${label.toLowerCase()} colour`}>
          <input type="color" value={value} onChange={(e) => onPick(e.target.value)} aria-label={`Custom ${label.toLowerCase()} colour`} />
        </label>
      </div>
    </div>
  );
}

export function StyleControls({ type, variant, colors, onVariant, onColors }: { type: keyof typeof BUILDING_DEFS; variant: number; colors: { wall: string; roof: string }; onVariant: (v: number) => void; onColors: (c: Partial<{ wall: string; roof: string }>) => void }) {
  const def = BUILDING_DEFS[type];
  return (
    <>
      <div className="field">
        <span>Style</span>
        <div className="segmented">
          {Array.from({ length: def.variants }, (_, i) => (
            <button key={i} className={variant === i ? 'on' : ''} aria-pressed={variant === i} onClick={() => onVariant(i)}>{i + 1}</button>
          ))}
        </div>
      </div>
      <Swatches label="Walls" colors={WALL_COLORS} value={colors.wall} onPick={(v) => onColors({ wall: v })} />
      <Swatches label="Roof" colors={ROOF_COLORS} value={colors.roof} onPick={(v) => onColors({ roof: v })} />
    </>
  );
}

function BuildPanel() {
  const tool = useApp((s) => s.tool);
  const build = useApp((s) => s.build);
  const setTool = useApp((s) => s.setTool);
  const chooseBuilding = useApp((s) => s.chooseBuilding);
  const chooseCreature = useApp((s) => s.chooseCreature);
  const rotateBuild = useApp((s) => s.rotateBuild);
  const rotation = useApp((s) => s.buildRotation);
  const variant = useApp((s) => s.buildVariant);
  const setVariant = useApp((s) => s.setBuildVariant);
  const buildColors = useApp((s) => s.buildColors);
  const setBuildColors = useApp((s) => s.setBuildColors);
  const placing = tool === 'build';
  const activeBuilding = placing && build.kind === 'building' ? build.type : null;

  return (
    <details className="card fold" open>
      <summary id="build-h"><h2>Build</h2></summary>
      <div className="segmented segmented--tools" role="toolbar" aria-label="Tools">
        <button className={tool === 'select' ? 'on' : ''} aria-pressed={tool === 'select'} onClick={() => setTool('select')} title="Select (Esc)"><IconSelect /><span>Select</span></button>
        <button className={tool === 'remove' ? 'on' : ''} aria-pressed={tool === 'remove'} onClick={() => setTool('remove')} title="Remove buildings, creatures, trees and rocks"><IconRemove /><span>Remove</span></button>
      </div>
      <div className="build-grid" role="group" aria-label="Buildings">
        {BUILDING_ORDER.map((t) => (
          <button key={t} className={`build-card ${activeBuilding === t ? 'on' : ''}`} aria-pressed={activeBuilding === t} onClick={() => chooseBuilding(t)} data-testid={`build-${t}`}>
            <BuildingIcon type={t} />
            <strong>{BUILDING_DEFS[t].name}</strong>
            <small>{BUILDING_DEFS[t].footprint.w}×{BUILDING_DEFS[t].footprint.d}</small>
          </button>
        ))}
      </div>
      <div className="build-grid build-grid--2" role="group" aria-label="Creatures">
        <button className={`build-card ${placing && build.kind === 'creature' && build.species === 'villager' ? 'on' : ''}`} onClick={() => chooseCreature('villager')} data-testid="build-villager"><IconCreature /><strong>Villager</strong><small>walks</small></button>
        <button className={`build-card ${placing && build.kind === 'creature' && build.species === 'sheep' ? 'on' : ''}`} onClick={() => chooseCreature('sheep')} data-testid="build-sheep"><IconSheep /><strong>Sheep</strong><small>grazes</small></button>
      </div>
      {activeBuilding && (
        <div className="placement">
          <p className="hint">{BUILDING_DEFS[activeBuilding].blurb} Tap or click the terrain to place it.</p>
          <button className="btn btn--wide" onClick={rotateBuild} title="Rotate (R)"><IconRotateCw /><span>Rotate · {rotation * 90}°</span></button>
          <StyleControls
            type={activeBuilding}
            variant={variant}
            colors={buildColors ?? BUILDING_DEFS[activeBuilding].defaultColors}
            onVariant={setVariant}
            onColors={setBuildColors}
          />
        </div>
      )}
      {placing && build.kind === 'creature' && <p className="hint">Tap or click open, dry ground to add a {build.species}.</p>}
      {tool === 'remove' && <p className="hint">Tap a building, creature, tree or rock to remove it. Undo brings it back.</p>}
    </details>
  );
}

export function LeftPanel() {
  const open = useApp((s) => s.panelOpen);
  const world = useApp((s) => s.world);
  return (
    <aside className={`panel ${open ? '' : 'panel--hidden'}`} aria-label="World and build tools">
      <GeneratePanel />
      <BuildPanel />
      <p className="fine">
        {world.generation.seed} · {world.generation.terrain} · {world.size}² tiles
      </p>
    </aside>
  );
}

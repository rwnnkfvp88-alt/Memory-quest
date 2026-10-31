import { useEffect, useState } from 'react';
import { BUILDING_DEFS } from '../core/buildingDefs';
import type { BuildingObject, CharacterObject } from '../core/types';
import { useApp } from '../state/store';
import { StyleControls } from './LeftPanel';
import { IconClose, IconMove, IconRemove, IconRotateCcw, IconRotateCw } from './icons';

function NameField({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="name-input"
      aria-label={label}
      value={draft}
      maxLength={40}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => (draft.trim() && draft.trim() !== value ? onCommit(draft) : setDraft(value))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

const shortId = (id: string): string => `${id.slice(0, id.indexOf('_') + 1)}${id.slice(id.indexOf('_') + 1, id.indexOf('_') + 7)}…`;

function BuildingInspector({ b }: { b: BuildingObject }) {
  const s = useApp.getState;
  const tool = useApp((st) => st.tool);
  const def = BUILDING_DEFS[b.type];
  return (
    <>
      <NameField value={b.name} label="Building name" onCommit={(v) => s().renameSelected(v)} />
      <p className="meta">{def.name} · {def.footprint.w}×{def.footprint.d} · turned {b.rotation * 90}°</p>
      <div className="btn-row btn-row--wrap">
        <button className="btn" onClick={() => s().rotateSelected(-1)} title="Rotate left"><IconRotateCcw /><span>Left</span></button>
        <button className="btn" onClick={() => s().rotateSelected(1)} title="Rotate right (R)"><IconRotateCw /><span>Right</span></button>
        <button className={`btn ${tool === 'move' ? 'btn--active' : ''}`} onClick={() => s().beginMove()} title="Move (M)" data-testid="move"><IconMove /><span>{tool === 'move' ? 'Tap a spot…' : 'Move'}</span></button>
        <button className="btn btn--danger" onClick={() => s().removeSelected()} title="Remove (Delete)" data-testid="remove-selected"><IconRemove /><span>Remove</span></button>
      </div>
      <StyleControls type={b.type} variant={b.variant} colors={b.colors} onVariant={(v) => s().variantSelected(v)} onColors={(c) => s().recolorSelected(c)} />
      <p className="id" title={b.id}>{shortId(b.id)}</p>
    </>
  );
}

function CreatureInspector({ c }: { c: CharacterObject }) {
  const s = useApp.getState;
  return (
    <>
      <NameField value={c.name} label="Creature name" onCommit={(v) => s().renameSelected(v)} />
      <p className="meta">{c.species === 'villager' ? 'Villager' : 'Sheep'}, wandering freely</p>
      <div className="btn-row">
        <button className="btn btn--danger" onClick={() => s().removeSelected()}><IconRemove /><span>Remove</span></button>
      </div>
      <p className="id" title={c.id}>{shortId(c.id)}</p>
    </>
  );
}

export function Inspector() {
  const selected = useApp((s) => (s.selectedId ? s.world.objects[s.selectedId] : undefined));
  const select = useApp((s) => s.select);
  if (!selected || selected.kind === 'prop') return null;
  return (
    <aside className="inspector card" aria-label="Selected object" data-testid="inspector">
      <button className="icon-btn inspector-close" aria-label="Deselect" onClick={() => select(null)}><IconClose /></button>
      {selected.kind === 'building' ? <BuildingInspector b={selected} /> : <CreatureInspector c={selected} />}
    </aside>
  );
}

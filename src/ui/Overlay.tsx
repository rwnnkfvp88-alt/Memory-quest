import { useEffect } from 'react';
import { BIOME_NAMES } from '../core/types';
import { validateBuildingPlacement } from '../editing/placement';
import { cameraState } from '../render/cameraState';
import { anchorFor, useApp } from '../state/store';
import { IconHome, IconRotateCcw, IconRotateCw, IconZoomIn, IconZoomOut } from './icons';

export function CameraControls() {
  return (
    <div className="camera-controls" role="group" aria-label="Camera">
      <button className="icon-btn" aria-label="Rotate view left" title="Rotate left (Q)" onClick={() => cameraState.rotateGoalBy(-Math.PI / 2)}><IconRotateCcw /></button>
      <button className="icon-btn" aria-label="Rotate view right" title="Rotate right (E)" onClick={() => cameraState.rotateGoalBy(Math.PI / 2)}><IconRotateCw /></button>
      <button className="icon-btn" aria-label="Zoom in" title="Zoom in (+)" onClick={() => cameraState.zoomGoalBy(1.4)}><IconZoomIn /></button>
      <button className="icon-btn" aria-label="Zoom out" title="Zoom out (-)" onClick={() => cameraState.zoomGoalBy(1 / 1.4)}><IconZoomOut /></button>
      <button className="icon-btn" aria-label="Reset view" title="Reset view (0)" onClick={() => cameraState.reset()}><IconHome /></button>
    </div>
  );
}

/** Bottom-left readout of what's under the cursor and whether the active tool can act there. */
export function HoverChip() {
  const hover = useApp((s) => s.hover);
  const world = useApp((s) => s.world);
  const tool = useApp((s) => s.tool);
  const build = useApp((s) => s.build);
  const rotation = useApp((s) => s.buildRotation);
  const selectedId = useApp((s) => s.selectedId);
  if (!hover) return <div className="chip chip--idle">Hover the land to inspect it</div>;
  const tx = Math.floor(hover.gx);
  const tz = Math.floor(hover.gz);
  if (tx < 0 || tz < 0 || tx >= world.size || tz >= world.size) return null;
  const biome = BIOME_NAMES[world.tiles.biome[tz * world.size + tx]];
  let verdict: { ok: boolean; text: string } | null = null;
  if (tool === 'build' && build.kind === 'building') {
    const a = anchorFor(build.type, rotation, hover.gx, hover.gz);
    const c = validateBuildingPlacement(world, build.type, rotation, a.x, a.z);
    verdict = c.ok ? { ok: true, text: 'Room to build here' } : { ok: false, text: c.message };
  } else if (tool === 'move' && selectedId) {
    const b = world.objects[selectedId];
    if (b?.kind === 'building') {
      const a = anchorFor(b.type, b.rotation, hover.gx, hover.gz);
      const c = validateBuildingPlacement(world, b.type, b.rotation, a.x, a.z, b.id);
      verdict = c.ok ? { ok: true, text: 'Drop it here' } : { ok: false, text: c.message };
    }
  }
  return (
    <div className="chip" data-testid="hover-chip">
      <strong>{biome}</strong>
      <span>
        {tx}, {tz}
      </span>
      {verdict && <em className={verdict.ok ? 'ok' : 'bad'}>{verdict.text}</em>}
    </div>
  );
}

export function Toast() {
  const notice = useApp((s) => s.notice);
  const clear = useApp((s) => s.clearNotice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clear, notice.tone === 'error' ? 6500 : 3800);
    return () => clearTimeout(t);
  }, [notice, clear]);
  if (!notice) return null;
  return (
    <div className={`toast toast--${notice.tone}`} role="status" aria-live="polite" key={notice.id} data-testid="toast" onClick={clear}>
      {notice.text}
    </div>
  );
}

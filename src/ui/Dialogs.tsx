import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { WorldSummary } from '../storage/codec';
import { useApp } from '../state/store';
import { readFileText } from './download';
import { IconClose, IconUpload } from './icons';
import { persistence } from './services';

function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

function WorldsDialog({ onClose }: { onClose: () => void }) {
  const currentId = useApp((s) => s.world.id);
  const openDialog = useApp((s) => s.openDialog);
  const [worlds, setWorlds] = useState<WorldSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      await persistence.saveNow();
      setWorlds(await persistence.repo.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read your library.');
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Modal
      title="Your Worlds"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => fileRef.current?.click()}><IconUpload /><span>Import world file</span></button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              await persistence.importText(await readFileText(file));
              onClose();
            }}
          />
        </>
      }
    >
      {error && <p className="error">{error}</p>}
      {!worlds && !error && <p className="hint">Opening the archive…</p>}
      {worlds && worlds.length === 0 && <p className="hint">Nothing saved yet.</p>}
      <ul className="world-list">
        {worlds?.map((w) => (
          <li key={w.id} className={w.id === currentId ? 'current' : ''} data-testid="world-row">
            <div>
              <strong>{w.name}</strong>
              {w.id === currentId && <em> · open now</em>}
              <small>
                {w.terrain} · {w.size}² · seed “{w.seed}” · {w.buildings} building{w.buildings === 1 ? '' : 's'} · {new Date(w.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </small>
            </div>
            <div className="btn-row">
              {w.id !== currentId && (
                <button
                  className="btn"
                  onClick={async () => {
                    await persistence.openWorld(w.id);
                    onClose();
                  }}
                >
                  Open
                </button>
              )}
              <button className="btn btn--danger" onClick={() => openDialog({ kind: 'confirm-delete', id: w.id, name: w.name })}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function ConfirmGenerate({ input }: { input: { seed: string; size: string; terrain: string } }) {
  const name = useApp((s) => s.world.name);
  const generate = useApp((s) => s.generate);
  const openDialog = useApp((s) => s.openDialog);
  return (
    <Modal
      title="Generate a new world?"
      onClose={() => openDialog(null)}
      footer={
        <>
          <button className="btn" onClick={() => openDialog(null)}>Keep working</button>
          <button className="btn btn--primary" data-testid="confirm-generate" onClick={() => void generate(input as Parameters<typeof generate>[0])}>Generate</button>
        </>
      }
    >
      <p>
        <strong>{name}</strong> holds your edits. A new {input.terrain} world (seed “{input.seed}”) will replace it on screen.
      </p>
      <p className="hint">Nothing is erased: {name} stays saved in Your Worlds, and you can reopen it any time.</p>
    </Modal>
  );
}

function ConfirmDelete({ id, name }: { id: string; name: string }) {
  const openDialog = useApp((s) => s.openDialog);
  const isCurrent = useApp((s) => s.world.id === id);
  return (
    <Modal
      title="Delete this world?"
      onClose={() => openDialog({ kind: 'worlds' })}
      footer={
        <>
          <button className="btn" onClick={() => openDialog({ kind: 'worlds' })}>Cancel</button>
          <button
            className="btn btn--danger"
            data-testid="confirm-delete"
            onClick={async () => {
              openDialog(null);
              await persistence.deleteWorld(id);
            }}
          >
            Delete forever
          </button>
        </>
      }
    >
      <p>
        <strong>{name}</strong> and everything in it will be permanently deleted from this device.
      </p>
      {isCurrent && <p className="hint">It is the world on screen, so a fresh one will take its place.</p>}
      <p className="hint">Tip: use Export first if you want a copy.</p>
    </Modal>
  );
}

function Help() {
  const openDialog = useApp((s) => s.openDialog);
  const rows: Array<[string, string]> = [
    ['Pan', 'Drag with mouse or one finger · WASD / arrows'],
    ['Zoom', 'Scroll wheel, trackpad pinch, or two-finger pinch · + / −'],
    ['Rotate view', 'Right-drag, Shift-drag, or twist two fingers · Q / E or the on-screen buttons'],
    ['Place', 'Pick a building, then click or tap terrain. On touch, the ghost follows your finger until you lift'],
    ['Rotate building', 'R, or the Rotate button'],
    ['Move / recolor / remove', 'Select a building, then use the panel · M · Delete'],
    ['Undo / Redo', 'Ctrl/Cmd+Z · Ctrl/Cmd+Shift+Z'],
    ['Save', 'Automatic. Ctrl/Cmd+S saves right now'],
    ['Reset view', '0 or the home button'],
  ];
  return (
    <Modal title="Controls" onClose={() => openDialog(null)} footer={<button className="btn btn--primary" onClick={() => openDialog(null)}>Got it</button>}>
      <dl className="keys">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useApp((s) => s.dialog);
  const openDialog = useApp((s) => s.openDialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'worlds':
      return <WorldsDialog onClose={() => openDialog(null)} />;
    case 'confirm-generate':
      return <ConfirmGenerate input={dialog.input} />;
    case 'confirm-delete':
      return <ConfirmDelete id={dialog.id} name={dialog.name} />;
    case 'help':
      return <Help />;
  }
}

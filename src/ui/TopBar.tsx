import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { downloadText, readFileText } from './download';
import { IconDownload, IconFolder, IconHelp, IconMenu, IconRedo, IconSave, IconUndo, IconUpload } from './icons';
import { persistence } from './services';

function SaveBadge() {
  const status = useApp((s) => s.saveStatus);
  const at = useApp((s) => s.lastSavedAt);
  const label =
    status === 'saving' ? 'Saving…' : status === 'dirty' ? 'Unsaved changes' : status === 'error' ? 'Save failed, retrying on next edit' : at ? `Saved ${new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Saved';
  return (
    <span className={`badge badge--${status}`} role="status" aria-live="polite" data-testid="save-status">
      <i aria-hidden />
      {label}
    </span>
  );
}

function WorldName() {
  const name = useApp((s) => s.world.name);
  const rename = useApp((s) => s.renameWorld);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = (): void => {
    if (draft.trim() && draft.trim() !== name) rename(draft);
    else setDraft(name);
  };
  return (
    <input
      className="world-name"
      aria-label="World name"
      value={draft}
      maxLength={48}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(name);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function TopBar() {
  const canUndo = useApp((s) => s.history.past.length > 0);
  const canRedo = useApp((s) => s.history.future.length > 0);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const openDialog = useApp((s) => s.openDialog);
  const panelOpen = useApp((s) => s.panelOpen);
  const setPanelOpen = useApp((s) => s.setPanelOpen);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      await persistence.importText(await readFileText(file));
    } catch {
      useApp.getState().notify('That file could not be read.', 'error');
    }
  };

  return (
    <header className="topbar">
      <button className="icon-btn panel-toggle" aria-label={panelOpen ? 'Hide build panel' : 'Show build panel'} aria-pressed={panelOpen} onClick={() => setPanelOpen(!panelOpen)}>
        <IconMenu />
      </button>
      <div className="brand" aria-label="Mnemosyne">
        <span className="brand-mark" aria-hidden>◈</span>
        <span className="brand-name">Mnemosyne</span>
      </div>
      <WorldName />
      <SaveBadge />
      <div className="spacer" />
      <div className="btn-row">
        <button className="icon-btn" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)"><IconUndo /></button>
        <button className="icon-btn" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)"><IconRedo /></button>
        <button className="icon-btn" onClick={() => void persistence.saveNow().then(() => useApp.getState().notify('World saved.', 'success'))} aria-label="Save now" title="Save now (Ctrl/Cmd+S)"><IconSave /></button>
        <button className="btn" onClick={() => openDialog({ kind: 'worlds' })}><IconFolder /><span>Worlds</span></button>
        <button
          className="icon-btn"
          aria-label="Export world file"
          title="Export this world as a file"
          onClick={() => {
            const { filename, text } = persistence.exportCurrent();
            downloadText(filename, text);
          }}
        >
          <IconDownload />
        </button>
        <button className="icon-btn" aria-label="Import world file" title="Import a world file" onClick={() => fileRef.current?.click()}><IconUpload /></button>
        <button className="icon-btn" aria-label="Help and controls" title="Controls (?)" onClick={() => openDialog({ kind: 'help' })}><IconHelp /></button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="import-input"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );
}

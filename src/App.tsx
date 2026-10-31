import { useEffect, useState } from 'react';
import { Scene } from './render/Scene';
import { useApp } from './state/store';
import { Dialogs } from './ui/Dialogs';
import { Inspector } from './ui/Inspector';
import { LeftPanel } from './ui/LeftPanel';
import { CameraControls, HoverChip, Toast } from './ui/Overlay';
import { TopBar } from './ui/TopBar';
import { bootApp } from './ui/services';
import { useShortcuts } from './ui/useShortcuts';
import { IconSun } from './ui/icons';

export function App() {
  const [ready, setReady] = useState(false);
  const generating = useApp((s) => s.generating);
  const shadows = useApp((s) => s.shadows);
  const toggleShadows = useApp((s) => s.toggleShadows);
  useShortcuts();

  useEffect(() => {
    void bootApp().finally(() => setReady(true));
  }, []);

  return (
    <div className="app">
      <div className="stage" aria-label="World view" data-testid="stage">
        {ready && <Scene />}
        {!ready && <div className="loading">Waking the world…</div>}
        {generating && <div className="loading loading--over">Shaping the land…</div>}
      </div>
      <TopBar />
      <LeftPanel />
      <Inspector />
      <div className="bottom-left">
        <HoverChip />
        <button className={`icon-btn quality ${shadows ? 'on' : ''}`} onClick={toggleShadows} aria-pressed={shadows} aria-label="Shadows" title={shadows ? 'Shadows on (turn off for smoother play on older devices)' : 'Shadows off'}>
          <IconSun />
        </button>
      </div>
      <CameraControls />
      <Toast />
      <Dialogs />
    </div>
  );
}

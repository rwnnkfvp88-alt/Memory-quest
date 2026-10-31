import { useEffect } from 'react';
import { isTyping } from '../render/InputController';
import { useApp } from '../state/store';
import { persistence } from './services';

/** Global editing shortcuts. Camera keys (WASD, arrows, Q/E, +/-, 0) live with the input controller. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useApp.getState();
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;

      if (key === 'escape') {
        if (s.dialog) s.openDialog(null);
        else if (s.tool !== 'select') s.setTool('select');
        else s.select(null);
        return;
      }
      if (isTyping(e.target)) return;

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        s.redo();
      } else if (mod && key === 's') {
        e.preventDefault();
        void persistence.saveNow();
      } else if (mod) {
        return;
      } else if (key === 'r') {
        if (s.tool === 'build' && s.build.kind === 'building') s.rotateBuild();
        else s.rotateSelected(1);
      } else if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        s.removeSelected();
      } else if (key === 'm') {
        s.beginMove();
      } else if (key === '?' || (e.shiftKey && key === '/')) {
        s.openDialog({ kind: 'help' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

import type { ReactNode } from 'react';
import type { BuildingTypeId } from '../core/types';

const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

const make = (children: ReactNode) => function Icon() { return <svg {...base}>{children}</svg>; };

export const IconSelect = make(<path d="M5 3l14 8-6.5 1.5L10 19z" />);
export const IconRemove = make(<><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>);
export const IconMove = make(<><path d="M12 3v18M3 12h18" /><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></>);
export const IconRotateCw = make(<><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" /></>);
export const IconRotateCcw = make(<><path d="M4 12a8 8 0 1 0 2.6-5.9" /><path d="M4 4v5h5" /></>);
export const IconUndo = make(<><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>);
export const IconRedo = make(<><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>);
export const IconSave = make(<><path d="M5 3h12l3 3v15H5z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></>);
export const IconFolder = make(<path d="M3 6h6l2 2h10v11H3z" />);
export const IconDownload = make(<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 20h16" /></>);
export const IconUpload = make(<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 20h16" /></>);
export const IconDice = make(<><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="15" r="1" fill="currentColor" /><circle cx="15" cy="9" r="1" fill="currentColor" /><circle cx="9" cy="15" r="1" fill="currentColor" /></>);
export const IconZoomIn = make(<><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5M11 8v6M8 11h6" /></>);
export const IconZoomOut = make(<><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5M8 11h6" /></>);
export const IconHome = make(<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />);
export const IconHelp = make(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01" /></>);
export const IconClose = make(<path d="M6 6l12 12M18 6L6 18" />);
export const IconMenu = make(<path d="M4 7h16M4 12h16M4 17h16" />);
export const IconSun = make(<><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>);
export const IconCreature = make(<><circle cx="12" cy="7" r="3" /><path d="M6 21v-5a6 6 0 0 1 12 0v5" /></>);
export const IconSheep = make(<><path d="M6 12a4 4 0 0 1 4-4h5a4 4 0 0 1 0 8H8a2 2 0 0 1-2-4z" /><path d="M17 12h3v3M8 16v4M14 16v4" /></>);

const pictogram: Record<BuildingTypeId, ReactNode> = {
  cottage: <><path d="M3 12l9-7 9 7" /><path d="M6 11v9h12v-9" /><path d="M16 7V4h2v5" /><path d="M10 20v-5h4v5" /></>,
  tavern: <><path d="M2 13l7-6 7 6" /><path d="M4 12v8h14v-8" /><path d="M18 20v-6l4 0v6" /><path d="M8 20v-4h3v4" /><path d="M20 8v3" /></>,
  blacksmith: <><path d="M3 9h12c0 3-2 4-4 4v3h3v3H6v-3h3v-3C6 13 4 12 3 9z" /><path d="M15 9l5-2" /></>,
  windmill: <><path d="M9 21l1.5-10h3L15 21z" /><path d="M12 11L6 5M12 11l6-6M12 11l-6 6M12 11l6 6" /></>,
  watchtower: <><path d="M7 21V9h10v12" /><path d="M5 9V5h2v2h2V5h2v2h2V5h2v2h2V5h2v4" /><path d="M11 21v-4h2v4" /></>,
};

export function BuildingIcon({ type }: { type: BuildingTypeId }) {
  return <svg {...base} width={34} height={34} strokeWidth={1.5}>{pictogram[type]}</svg>;
}

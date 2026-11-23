// The kit's icons: stroke paths on a 20 by 20 grid, drawn for this kit.

export const ICON_PATHS = {
  alert: 'M10 3.5l7.5 13h-15zM10 8.5v3.5M10 14.6v.1',
  check: 'M4 10.5l4 4 8-9',
  'chevron-down': 'M5 7.5l5 5 5-5',
  'chevron-right': 'M7.5 5l5 5-5 5',
  close: 'M5 5l10 10M15 5L5 15',
  minus: 'M4 10h12',
  plus: 'M10 4v12M4 10h12',
  search: 'M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM13.5 13.5L17 17',
} as const;

export type IconName = keyof typeof ICON_PATHS;

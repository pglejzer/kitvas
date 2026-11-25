// The studio's own icons (ADR 0057): stroke drawings on a 16 by 16 grid, one line each, no icon
// package. A page carries them once as a sprite (`icon.ts`); markup and scripts name an icon and
// never repeat its drawing. A new icon goes here, drawn with a 1.4 px round stroke in mind: no
// fills, nothing thinner than the stroke, and the drawing kept inside 2 to 14.

export const ICONS = {
  // Arrows and chevrons.
  'chevron-down': '<path d="M4 6l4 4 4-4"/>',
  'chevron-up': '<path d="M4 10l4-4 4 4"/>',
  'chevron-left': '<path d="M10 4L6 8l4 4"/>',
  'chevron-right': '<path d="M6 4l4 4-4 4"/>',
  'arrow-up': '<path d="M8 13V3M4 7l4-4 4 4"/>',
  'arrow-right': '<path d="M3 8h10M10 5l3 3-3 3"/>',
  'arrow-left': '<path d="M13 8H3M6 5L3 8l3 3"/>',
  'arrow-down': '<path d="M8 3v10M5 10l3 3 3-3"/>',
  // The bar.
  undo: '<path d="M5 4L2 7l3 3M2 7h7.5a3.5 3.5 0 010 7H7"/>',
  redo: '<path d="M11 4l3 3-3 3M14 7H6.5a3.5 3.5 0 000 7H9"/>',
  sliders:
    '<path d="M2.5 5h5M11.5 5h2M2.5 11h2M8.5 11h5"/><circle cx="9.5" cy="5" r="1.8"/><circle cx="6.5" cy="11" r="1.8"/>',
  more: '<circle cx="3.5" cy="8" r=".6"/><circle cx="8" cy="8" r=".6"/><circle cx="12.5" cy="8" r=".6"/>',
  compare: '<path d="M2.5 5.5h9M9 3l2.5 2.5L9 8M13.5 10.5h-9M7 8l-2.5 2.5L7 13"/>',
  keyboard:
    '<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 6.6h.2M6.6 6.6h.2M9.2 6.6h.2M11.8 6.6h.2M5 9.5h6"/>',
  help: '<circle cx="8" cy="8" r="6"/><path d="M6.3 6.3a1.8 1.8 0 113 1.4c-.7.5-1.3.9-1.3 1.8M8 11.6v.2"/>',
  // The rail and the panels.
  layers: '<path d="M8 2l6 3-6 3-6-3 6-3zM2 8l6 3 6-3M2 11l6 3 6-3"/>',
  insert: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M8 5.5v5M5.5 8h5"/>',
  why: '<path d="M3 3h10v8H7l-3 2.5V11H3z"/>',
  note: '<path d="M3 2.5h10v8l-3 3H3zM10 13.5v-3h3"/>',
  panel: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6 3v10"/>',
  search: '<circle cx="7" cy="7" r="4"/><path d="M10 10l3.5 3.5"/>',
  filter: '<path d="M2.5 3.5h11l-4.2 5v4l-2.6-1.3V8.5z"/>',
  clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.3 1.6"/>',
  // Elements.
  component: '<path d="M8 2.5l5.5 5.5L8 13.5 2.5 8z"/>',
  section:
    '<rect x="2" y="3" width="12" height="4" rx="1"/><rect x="2" y="9" width="12" height="4" rx="1"/>',
  box: '<rect x="3" y="3" width="10" height="10" rx="2"/>',
  text: '<path d="M4 3.5h8M8 3.5v9"/>',
  image:
    '<rect x="2" y="3" width="12" height="10" rx="2"/><circle cx="5.8" cy="6.5" r="1"/><path d="M2.5 11.5l3.5-3 2.5 2 2-1.5 3 2.5"/>',
  // What can be done to an element.
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>',
  unlock:
    '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 014.8-1"/>',
  eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.8"/>',
  'eye-off':
    '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><path d="M2.5 2.5l11 11"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-1h-8v8h1"/>',
  duplicate:
    '<rect x="2.5" y="2.5" width="8" height="8" rx="1.5"/><path d="M13.5 6v6a1.5 1.5 0 01-1.5 1.5H6M6.5 5v3M5 6.5h3"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>',
  drag: '<circle cx="6" cy="4" r=".6"/><circle cx="10" cy="4" r=".6"/><circle cx="6" cy="8" r=".6"/><circle cx="10" cy="8" r=".6"/><circle cx="6" cy="12" r=".6"/><circle cx="10" cy="12" r=".6"/>',
  pin: '<path d="M8 14V9.5M4.5 9.5h7L10 6V2.5H6V6z"/>',
  upload: '<path d="M8 10.5V3M5 6l3-3 3 3M3 10.5v2.5h10v-2.5"/>',
  external: '<path d="M9.5 2.5h4v4M13.5 2.5l-6 6M11.5 9.5v4h-9v-9h4"/>',
  refresh:
    '<path d="M13 3v3.5H9.5M3 13V9.5h3.5M12.6 6.5A5 5 0 004 5.2L3 6.5M3.4 9.5A5 5 0 0012 10.8l1-1.3"/>',
  // Signs.
  plus: '<path d="M8 4v8M4 8h8"/>',
  minus: '<path d="M4 8h8"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  check: '<path d="M3.5 8.5l3 3 6-6.5"/>',
  'check-circle': '<circle cx="8" cy="8" r="5.5"/><path d="M5.5 8.2l1.7 1.7 3.3-3.6"/>',
  alert: '<path d="M8 4.5v4.2M8 11.3v.2"/>',
  info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.3v3.7M8 5v.2"/>',
  fit: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>',
  // Device sizes in the width pill.
  phone: '<rect x="5" y="2" width="6" height="12" rx="1.5"/><path d="M7 11.5h2"/>',
  tablet: '<rect x="3" y="2" width="10" height="12" rx="1.5"/><path d="M7 11.5h2"/>',
  laptop: '<rect x="3" y="3.5" width="10" height="7" rx="1"/><path d="M1.5 13h13"/>',
  // Layout keywords in Properties.
  'align-start': '<path d="M2.5 2.5v11M5.5 5h7M5.5 9h4"/>',
  'align-center': '<path d="M8 2.5v11M4 5.5h8M5.5 10h5"/>',
  'align-end': '<path d="M13.5 2.5v11M3.5 5h7M6.5 9h4"/>',
  'align-stretch': '<path d="M2.5 2.5v11M13.5 2.5v11M5 6h6M5 10h6"/>',
  // Space between: one item against each edge.
  'align-between': '<path d="M2.5 2.5v11M13.5 2.5v11M5 5.5h3.5M7.5 10.5h3.5"/>',
} as const satisfies Record<string, string>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** The id of an icon's symbol in the sprite; markup and scripts point to it with `<use>`. */
export const iconId = (name: IconName): string => `i-${name}`;

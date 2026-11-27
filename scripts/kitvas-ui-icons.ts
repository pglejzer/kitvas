// The kitvas UI kit's product icons: what a product screen needs and the studio's own interface
// does not (a cart, a bell, a calendar). They are the kit's alone: the studio's sprite never holds
// them. Drawn as the studio's icons are (src/studio/pages/icons/paths.ts): stroke drawings on a 16
// by 16 grid for a 1.4 px round stroke, no fills, nothing thinner than the stroke, kept inside 2 to
// 14. `npm run kit-ui-tokens` writes them into the kit after the studio's icons.

export const PRODUCT_ICONS = {
  // The app's frame.
  home: '<path d="M2.5 7.5L8 2.5l5.5 5v6h-11z"/><path d="M6.5 13.5v-4h3v4"/>',
  menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',
  grid: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
  list: '<path d="M6 4.5h7.5M6 8h7.5M6 11.5h7.5M2.6 4.5h.3M2.6 8h.3M2.6 11.5h.3"/>',
  settings:
    '<path d="M6.66 3.6L6.8 1.82h2.4L9.34 3.6a4.6 4.6 0 011.8 1.04l1.61-.77 1.21 2.08-1.48 1.02a4.6 4.6 0 010 2.06l1.48 1.02-1.21 2.08-1.61-.77a4.6 4.6 0 01-1.8 1.04l-.14 1.78H6.8l-.14-1.78a4.6 4.6 0 01-1.8-1.04l-1.61.77-1.21-2.08 1.48-1.02a4.6 4.6 0 010-2.06L2.04 5.95l1.21-2.08 1.61.77a4.6 4.6 0 011.8-1.04z"/><circle cx="8" cy="8" r="2"/>',
  user: '<circle cx="8" cy="5.5" r="2.7"/><path d="M2.8 13.5c.5-2.6 2.5-4 5.2-4s4.7 1.4 5.2 4"/>',
  users:
    '<circle cx="6" cy="5.5" r="2.4"/><path d="M1.8 13.2c.4-2.3 2-3.6 4.2-3.6s3.8 1.3 4.2 3.6"/><path d="M10.4 3.3a2.4 2.4 0 010 4.5M12 9.9c1.2.5 2 1.6 2.3 3.3"/>',
  bell: '<path d="M4 11V7a4 4 0 018 0v4l1.2 1.5H2.8z"/><path d="M6.6 14a1.5 1.5 0 002.8 0"/>',
  inbox: '<path d="M2.5 9.5l1.8-6h7.4l1.8 6V13h-11z"/><path d="M2.5 9.5h3.2l.8 1.7h3l.8-1.7h3.2"/>',
  'log-out': '<path d="M6.5 2.5h-4v11h4"/><path d="M6.5 8h7M11 5.5L13.5 8 11 10.5"/>',
  // Buying and paying.
  cart: '<path d="M1.8 2.8h1.9l1.6 7.4h6.9l1.4-5.2H4.4"/><circle cx="6" cy="12.6" r="1"/><circle cx="11.2" cy="12.6" r="1"/>',
  bag: '<path d="M3 5.5h10l-.7 8H3.7z"/><path d="M5.8 7.2V4.7a2.2 2.2 0 014.4 0v2.5"/>',
  tag: '<path d="M2.5 2.5h5.3l6 6-5.3 5.3-6-6z"/><circle cx="5.6" cy="5.6" r=".9"/>',
  'credit-card':
    '<rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><path d="M1.5 6.7h13M4 10h2.5"/>',
  wallet:
    '<path d="M12 3.5H3.5a1 1 0 000 2h9a1 1 0 011 1v6a1 1 0 01-1 1h-9a1 1 0 01-1-1v-8"/><path d="M10.8 9.5h.3"/>',
  truck:
    '<path d="M1.5 3.5h8v7h-8zM9.5 6h2.7l2.3 2.4v2.1h-5"/><circle cx="4.5" cy="12" r="1.4"/><circle cx="11.7" cy="12" r="1.4"/>',
  gift: '<rect x="2.5" y="6" width="11" height="7.5" rx="1"/><path d="M8 6v7.5M8 6C7 3.2 4.4 2.6 4.4 4.4 4.4 5.6 6.4 6 8 6zM8 6c1-2.8 3.6-3.4 3.6-1.6C11.6 5.6 9.6 6 8 6z"/>',
  // People talking.
  mail: '<rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><path d="M2 4.5l6 4.5 6-4.5"/>',
  message:
    '<path d="M2.5 3.5h11V11h-6l-3 2.5V11h-2z"/><path d="M5.5 7.2h.2M8 7.2h.2M10.5 7.2h.2"/>',
  send: '<path d="M14 2L7 9M14 2L9.5 14 7 9 2 6.5z"/>',
  share:
    '<circle cx="12" cy="3.8" r="1.8"/><circle cx="4" cy="8" r="1.8"/><circle cx="12" cy="12.2" r="1.8"/><path d="M5.6 7.2l4.8-2.6M5.6 8.8l4.8 2.6"/>',
  link: '<path d="M6.8 9.2a2.8 2.8 0 004 0L13 7a2.8 2.8 0 00-4-4L8 4"/><path d="M9.2 6.8a2.8 2.8 0 00-4 0L3 9a2.8 2.8 0 004 4l1-1"/>',
  // Numbers.
  'chart-bar':
    '<rect x="2.8" y="8" width="2.6" height="5.5" rx=".6"/><rect x="6.7" y="2.5" width="2.6" height="11" rx=".6"/><rect x="10.6" y="5.5" width="2.6" height="8" rx=".6"/>',
  'chart-line': '<path d="M2.5 2.5v11h11"/><path d="M5 10l2.5-3 2 1.8 3.5-4.3"/>',
  'chart-pie':
    '<path d="M7.5 3A5.5 5.5 0 1013 8.5H7.5z"/><path d="M10 2.4A5.2 5.2 0 0113.6 6H10z"/>',
  'trending-up': '<path d="M2 11.5l4-4 2.5 2.5L14 4.5M10 4.5h4v4"/>',
  'trending-down': '<path d="M2 4.5l4 4L8.5 6 14 11.5M10 11.5h4v-4"/>',
  // Time and place.
  calendar:
    '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.8h11M5.5 2v3M10.5 2v3"/>',
  'map-pin':
    '<path d="M8 14.2C5.3 11.4 3.7 9.2 3.7 7a4.3 4.3 0 018.6 0c0 2.2-1.6 4.4-4.3 7.2z"/><circle cx="8" cy="7" r="1.6"/>',
  globe:
    '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2C6 3.8 5.4 5.8 5.4 8S6 12.2 8 14c2-1.8 2.6-3.8 2.6-6S10 3.8 8 2z"/>',
  building: '<path d="M3.5 14V2.5h9V14M2 14h12M6 5.2h.2M9.8 5.2h.2M6 8h.2M9.8 8h.2M7 14v-3h2v3"/>',
  // Files.
  file: '<path d="M3.5 2H9l3.5 3.5V14h-9zM9 2v3.5h3.5"/>',
  folder:
    '<path d="M2 4.5a1 1 0 011-1h3.2l1.5 1.7H13a1 1 0 011 1v6.3a1 1 0 01-1 1H3a1 1 0 01-1-1z"/>',
  download: '<path d="M8 3v7.5M5 7.5l3 3 3-3M3 10.5V13h10v-2.5"/>',
  paperclip:
    '<path d="M13 7.3l-5.2 5.2a3.2 3.2 0 01-4.5-4.5l5.4-5.4a2.1 2.1 0 013 3L6.4 10.9a1 1 0 01-1.5-1.5L9.6 4.8"/>',
  cloud: '<path d="M4.8 12.5a3 3 0 01-.4-6A4 4 0 0112 7.2a2.7 2.7 0 01-.4 5.3z"/>',
  briefcase:
    '<rect x="2" y="5" width="12" height="8.5" rx="1.5"/><path d="M5.8 5V3.5a1 1 0 011-1h2.4a1 1 0 011 1V5M2 9h12"/>',
  // Acts and marks.
  edit: '<path d="M2.5 13.5l.7-3L10.6 3a1.6 1.6 0 012.3 2.3L5.5 12.8zM9.3 4.3l2.3 2.3"/>',
  star: '<path d="M8 2l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4l-3.7 2.1.8-4.2L2 6.4l4.2-.5z"/>',
  heart:
    '<path d="M8 13.5C4.5 11 2.2 8.9 2.2 6.3A3 3 0 018 4.9a3 3 0 015.8 1.4c0 2.6-2.3 4.7-5.8 7.2z"/>',
  bookmark: '<path d="M4 2.5h8V14l-4-3-4 3z"/>',
  flag: '<path d="M3.5 14V2.5M3.5 3h8L9.9 5.8l1.6 2.7h-8"/>',
  key: '<circle cx="5.2" cy="10.8" r="2.7"/><path d="M7.2 8.8l6.3-6.3M11 5l2 2M9.2 6.8l1.4 1.4"/>',
  zap: '<path d="M9 1.8L3.5 9H8l-1 5.2L12.5 7H8z"/>',
  // Media and light.
  play: '<path d="M5 3l8 5-8 5z"/>',
  pause:
    '<rect x="4" y="3" width="2.6" height="10" rx=".6"/><rect x="9.4" y="3" width="2.6" height="10" rx=".6"/>',
  camera: '<path d="M2 5.5h2.6l1.2-2h4.4l1.2 2H14V13H2z"/><circle cx="8" cy="9" r="2.4"/>',
  mic: '<rect x="6" y="2" width="4" height="7.5" rx="2"/><path d="M3.8 8a4.2 4.2 0 008.4 0M8 12.2V14"/>',
  sun: '<circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M12.6 3.4l-.9.9M4.3 11.7l-.9.9"/>',
  moon: '<path d="M13.2 9.4a5.6 5.6 0 01-6.6-6.6 5.6 5.6 0 106.6 6.6z"/>',
} as const satisfies Record<string, string>;

// The studio's own look as values (ADR 0057): two colour sets, four accents and the scales.
// These are the studio's tokens, apart from any kit: the Base kit stays the kit of the person's
// drafts. `theme-css.ts` turns them into the `--st-*` custom properties every skin rule uses;
// this file is the only place a studio colour is written down.

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const ACCENTS = ['copper', 'teal', 'coral', 'rose'] as const;
export type Accent = (typeof ACCENTS)[number];

/** The solid colours of a theme, each `#rrggbb`. */
export const THEME_COLORS = {
  dark: {
    canvas: '#0f1013',
    panel: '#1d1f23',
    raised: '#282b31',
    'raised-strong': '#32363d',
    // The chosen option of a segmented control.
    pressed: '#3a3e47',
    pop: '#26292f',
    line: '#2c2f36',
    'line-strong': '#474b55',
    ink: '#eef0f3',
    'ink-mid': '#a6abb6',
    'ink-soft': '#747a86',
    fix: '#ea755c',
    review: '#e3c04b',
    good: '#4cba7a',
  },
  light: {
    canvas: '#e4e6ea',
    panel: '#ffffff',
    raised: '#f1f2f5',
    'raised-strong': '#e6e8ec',
    pressed: '#ffffff',
    pop: '#ffffff',
    line: '#e1e4e8',
    'line-strong': '#9197a1',
    ink: '#1d2025',
    'ink-mid': '#5f6570',
    'ink-soft': '#8a909a',
    fix: '#b3331f',
    review: '#7d6500',
    good: '#1f6b3a',
  },
} as const satisfies Record<Theme, Record<string, string>>;

/**
 * An accent in each theme (`accent`, and `on`: text on it), and `select`: the one colour the
 * selection is drawn in over a draft, picked to show on a white page and on a dark one, and
 * to carry white text (the tag with an element's name or size).
 */
export const ACCENT_COLORS = {
  copper: {
    dark: { accent: '#f0a56b', on: '#241204' },
    light: { accent: '#b4571a', on: '#ffffff' },
    select: '#b75d1d',
  },
  teal: {
    dark: { accent: '#2fd0ae', on: '#03201a' },
    light: { accent: '#0b7f69', on: '#ffffff' },
    select: '#0c8571',
  },
  coral: {
    dark: { accent: '#ff6a3d', on: '#1a0d07' },
    light: { accent: '#c8440f', on: '#ffffff' },
    select: '#d04715',
  },
  rose: {
    dark: { accent: '#ff6aa9', on: '#2b0a1a' },
    light: { accent: '#d6246e', on: '#ffffff' },
    select: '#de2474',
  },
} as const satisfies Record<
  Accent,
  Record<Theme, { accent: string; on: string }> & { select: string }
>;

/** Text on the selection colour, whatever the theme: a draft is not themed. */
export const ON_SELECT = '#ffffff';

/** Text on a tone used as a fill (a mark over a draft, a count that must be seen). */
export const ON_TONE: Record<Theme, string> = { dark: '#1d2025', light: '#ffffff' };

/** How strong a soft fill (a colour over the surface behind it) is in each theme. */
export const SOFT_ALPHA: Record<Theme, number> = { dark: 0.16, light: 0.1 };

/**
 * The inverted scope (`.k-inverse`): a block filled with the theme's ink, where the theme's panel
 * colour is the text. Each token below is the panel colour at this strength over the ink.
 */
export const INVERSE_MIX = {
  'ink-mid': 0.7,
  'ink-soft': 0.5,
  panel: 0.09,
  raised: 0.11,
  'raised-strong': 0.18,
  pressed: 0.24,
  line: 0.16,
} as const satisfies Record<string, number>;

/** The colours with an alpha, as `[#rrggbb, alpha]`. */
export const THEME_TINTS = {
  dark: {
    'frame-edge': ['#ffffff', 0.14],
    veil: ['#000000', 0.55],
  },
  light: {
    'frame-edge': ['#000000', 0.14],
    veil: ['#1d2025', 0.4],
  },
} as const satisfies Record<Theme, Record<string, readonly [string, number]>>;

/**
 * Shadows. `pop`: menus, popovers and pills on the canvas. `low`: small things that float.
 * `island`: the panels in Cards. `pressed`: the chosen option of a segmented control. `frame`: a draft on the canvas, with its hairline edge. In the
 * light theme a popover also gets a 1 px ring, because a white box on a white panel has no edge.
 */
export const THEME_SHADOWS = {
  dark: {
    pop: '0 12px 32px rgb(0 0 0 / 0.5), 0 2px 6px rgb(0 0 0 / 0.35)',
    low: '0 4px 12px rgb(0 0 0 / 0.35)',
    island: '0 10px 28px rgb(0 0 0 / 0.38)',
    pressed: 'none',
    frame:
      '0 0 0 1px var(--st-color-frame-edge), 0 2px 6px rgb(0 0 0 / 0.22), 0 24px 60px rgb(0 0 0 / 0.45)',
  },
  light: {
    pop: '0 0 0 1px var(--st-color-line), 0 12px 32px rgb(29 32 37 / 0.16), 0 2px 6px rgb(29 32 37 / 0.1)',
    low: '0 0 0 1px var(--st-color-line), 0 4px 12px rgb(29 32 37 / 0.08)',
    island: '0 6px 20px rgb(29 32 37 / 0.09)',
    pressed: '0 0 0 1px var(--st-color-line), 0 1px 2px rgb(29 32 37 / 0.08)',
    frame:
      '0 0 0 1px var(--st-color-frame-edge), 0 2px 6px rgb(0 0 0 / 0.08), 0 18px 44px rgb(29 32 37 / 0.14)',
  },
} as const satisfies Record<Theme, Record<string, string>>;

/** Everything that is the same in both themes: `--st-<group>-<name>`. */
export const SCALES = {
  space: {
    '2': '2px',
    '4': '4px',
    '6': '6px',
    '8': '8px',
    '10': '10px',
    '12': '12px',
    // The side padding of a pane, its groups and its rows.
    '14': '14px',
    '16': '16px',
    '24': '24px',
    '32': '32px',
  },
  radius: { sm: '6px', md: '10px', lg: '14px', full: '999px' },
  font: {
    body: '"Figtree", system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: 'ui-monospace, "Cascadia Code", Consolas, monospace',
  },
  // `xs` is for meta lines only (a count, a size, a time), never for a sentence.
  // `label` is for the labels of a pane's rows and the headers of its groups.
  'font-size': {
    xs: '11px',
    sm: '12px',
    label: '12.5px',
    md: '13px',
    lg: '15px',
    xl: '18px',
    '2xl': '24px',
  },
  'font-weight': { regular: '400', medium: '500', bold: '600' },
  'line-height': { tight: '1.2', normal: '1.4' },
  motion: { fast: '140ms', slow: '240ms', flash: '560ms' },
  ease: { out: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
  size: {
    bar: '44px',
    rail: '52px',
    control: '28px',
    row: '28px',
    icon: '16px',
    left: '248px',
    right: '312px',
    // The gap between the islands, and around them, in Cards.
    gap: '10px',
    // The least size of anything a pointer has to hit (WCAG 2.5.8).
    target: '24px',
    // The label column of a row, the header of a group, the height of a chip.
    label: '84px',
    group: '34px',
    chip: '18px',
  },
} as const satisfies Record<string, Record<string, string>>;

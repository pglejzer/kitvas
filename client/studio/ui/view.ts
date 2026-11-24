// The view (theme, panels, accent) as the page's scripts see it: the attributes of `<html>` that
// the server wrote (`src/studio/pages/shell.ts`) and the theme's rules read. No DOM here, so the
// rules can be tested; `view-settings.ts` is the part that touches the page.

import type { ViewSettings } from '../../../src/shared/settings/config.ts';

export type ViewKey = keyof ViewSettings;

/** The words of each setting, the same as the server's (`VIEW_THEMES` and the others). */
export const VIEW_VALUES = {
  theme: ['system', 'light', 'dark'],
  panels: ['cards', 'flush'],
  accent: ['copper', 'teal', 'coral', 'rose'],
} as const satisfies { [K in ViewKey]: readonly ViewSettings[K][] };

export const VIEW_START: ViewSettings = { theme: 'system', panels: 'cards', accent: 'copper' };

/** The `data-*` attributes of `<html>`: a `DOMStringMap`, or a plain object in a test. */
export type ViewData = Record<string, string | undefined>;

function oneOf<K extends ViewKey>(key: K, value: string | undefined): ViewSettings[K] | undefined {
  const values: readonly string[] = VIEW_VALUES[key];
  return value !== undefined && values.includes(value) ? (value as ViewSettings[K]) : undefined;
}

/** The view written on `<html>`. A missing or unknown word is the setting's first one. */
export function readView(data: ViewData): ViewSettings {
  return {
    theme: oneOf('theme', data.theme) ?? VIEW_START.theme,
    panels: oneOf('panels', data.panels) ?? VIEW_START.panels,
    accent: oneOf('accent', data.accent) ?? VIEW_START.accent,
  };
}

/** Writes `view` on `<html>`: no `data-theme` means the system's choice. */
export function writeView(data: ViewData, view: ViewSettings): void {
  if (view.theme === 'system') delete data.theme;
  else data.theme = view.theme;
  data.panels = view.panels;
  data.accent = view.accent;
}

/** `view` with one setting changed; `null` when the setting or the word is unknown. */
export function withChoice(
  view: ViewSettings,
  key: string | undefined,
  value: string | undefined,
): ViewSettings | null {
  if (key === 'theme') {
    const theme = oneOf('theme', value);
    return theme ? { ...view, theme } : null;
  }
  if (key === 'panels') {
    const panels = oneOf('panels', value);
    return panels ? { ...view, panels } : null;
  }
  if (key === 'accent') {
    const accent = oneOf('accent', value);
    return accent ? { ...view, accent } : null;
  }
  return null;
}

/** What a prototype's overlays need: the theme that shows now, and the accent. */
export type Tones = { theme: 'light' | 'dark'; accent: ViewSettings['accent'] };

export function tonesOf(view: ViewSettings, systemDark: boolean): Tones {
  const theme = view.theme === 'system' ? (systemDark ? 'dark' : 'light') : view.theme;
  return { theme, accent: view.accent };
}

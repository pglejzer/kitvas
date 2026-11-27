// A token of a Tailwind 3 kit may map onto a path of the project's theme, `theme(colors.primary)`,
// as well as onto a custom property. The probe of a build declares one variable per path, filled by
// the project's own Tailwind; the token sheet and the `tokens` step use that variable. No imports:
// the Tailwind worker loads this file on its own.

/** `theme(colors.primary)`: a dot path of the theme, each part a plain word. */
export const THEME_PATH = /^theme\(([A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*)\)$/;

/** The dot path inside `theme(…)`, or `undefined` for any other value. */
export const themePathOf = (value: string): string | undefined => THEME_PATH.exec(value)?.[1];

/** The variable a build declares for a theme path: `colors.primary` → `--kitvas-theme-colors-primary`. */
export const themeVariable = (path: string): string =>
  `--kitvas-theme-${path.replace(/[^A-Za-z0-9_-]/g, '-')}`;

/** The page variable a map value stands for: a theme path's variable, else the value itself. */
export function nativeVariable(value: string): string {
  const path = themePathOf(value);
  return path === undefined ? value : themeVariable(path);
}

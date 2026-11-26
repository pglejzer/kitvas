// A theme's attributes on the page's body (ADR 0083): what a design system's own switch needs,
// such as `data-mui-color-scheme="dark"`, while that theme shows, and none of another theme's.
// Never on the root (`<html>`), where `data-state` and `data-opt-*` stay: a system's provider
// writes its own scheme attribute there when it mounts and would overwrite them. The body holds
// the page and every portal. `class` names classes, added and taken off one by one, so the classes
// others put on the body stay.

/** Theme id to the attributes it sets on the body; only the themes that have some. */
export type ThemeAttributes = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** The part of `document.body` a theme is written to. */
export type BodyAttributes = {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  readonly classList: { add(...tokens: string[]): void; remove(...tokens: string[]): void };
};

export type ThemeBody = {
  /** The body carries the attributes of theme `id` and of no other; none for `undefined`. */
  show(id: string | undefined): void;
  /** A new build's themes take the place of the old ones; the next `show` writes them. */
  use(next: ThemeAttributes): void;
};

const NONE: Readonly<Record<string, string>> = Object.freeze({});

const classes = (value: string): string[] => value.split(/\s+/).filter((name) => name !== '');

export function createThemeBody(body: BodyAttributes, first: ThemeAttributes): ThemeBody {
  let themes = first;
  let shown = NONE;
  return {
    show(id) {
      const next = (id !== undefined && Object.hasOwn(themes, id) ? themes[id] : NONE) ?? NONE;
      if (next === shown) return;
      // All of the old ones off first, so a class both themes name is on at the end.
      for (const [name, value] of Object.entries(shown)) {
        if (name === 'class') body.classList.remove(...classes(value));
        else if (next[name] === undefined) body.removeAttribute(name);
      }
      for (const [name, value] of Object.entries(next)) {
        if (name === 'class') body.classList.add(...classes(value));
        else body.setAttribute(name, value);
      }
      shown = next;
    },
    use(next) {
      themes = next;
    },
  };
}

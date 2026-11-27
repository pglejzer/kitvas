// Which `--kit-*` variable a built draft uses for which kind of property (plan 21, goal A4). The
// tree's binder reads it to tell a space token from a radius token that happens to share a value.
// Pure: it reads the text of the built `index.css`.

/** What a variable is used for. `paint` is any colour; `space` is a gap, padding, margin or size. */
export type TokenKind = 'paint' | 'space' | 'radius' | 'font-size' | 'font-weight' | 'font-family';

/** `--kit-space-12` to the kinds of property it is used for; a variable never used is not a key. */
export type TokenUses = ReadonlyMap<string, ReadonlySet<TokenKind>>;

const COMMENT = /\/\*[\s\S]*?\*\//g;
const DECLARATION = /([A-Za-z-]+)\s*:\s*([^;{}]*)/g;
const KIT_VAR = /var\(\s*(--kit-[A-Za-z0-9_-]+)/g;

const SPACE_NAMES = new Set([
  'gap',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
]);
const BORDER_SHORTHAND = /^border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?$/;

/** The kinds a CSS property takes its value for; [] for a property no Figma value stands for. */
function kindsOf(property: string): TokenKind[] {
  const name = property.toLowerCase();
  if (name.startsWith('--')) return [];
  if (name === 'font') return ['font-size', 'font-weight', 'font-family'];
  if (name === 'font-size') return ['font-size'];
  if (name === 'font-weight') return ['font-weight'];
  if (name === 'font-family') return ['font-family'];
  if (name.endsWith('radius')) return ['radius'];
  if (
    name === 'background' ||
    name === 'background-image' ||
    name === 'fill' ||
    name === 'stroke' ||
    name === 'outline' ||
    name === 'text-decoration' ||
    name === 'box-shadow' ||
    name === 'text-shadow' ||
    name.endsWith('color') ||
    BORDER_SHORTHAND.test(name)
  ) {
    return ['paint'];
  }
  if (
    SPACE_NAMES.has(name) ||
    name.endsWith('-gap') ||
    name.startsWith('padding') ||
    name.startsWith('margin') ||
    name.startsWith('inset') ||
    /^(?:border|outline)(?:-[a-z]+)*-width$/.test(name)
  ) {
    return ['space'];
  }
  return [];
}

export function tokenUses(css: string): TokenUses {
  const uses = new Map<string, Set<TokenKind>>();
  for (const declaration of css.replace(COMMENT, '').matchAll(DECLARATION)) {
    const kinds = kindsOf(declaration[1] ?? '');
    if (kinds.length === 0) continue;
    for (const found of (declaration[2] ?? '').matchAll(KIT_VAR)) {
      const name = found[1] ?? '';
      const set = uses.get(name) ?? new Set<TokenKind>();
      for (const kind of kinds) set.add(kind);
      uses.set(name, set);
    }
  }
  return uses;
}

const kebab = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase();

/**
 * `--kit-space-12` for the token path `['space', '12']`. The same name the kit module's
 * `cssVarName` gives (a test holds the two together): a domain file may not take that code from
 * another module, so the few lines are here.
 */
export const kitVarName = (path: readonly string[]): string => `--kit-${path.map(kebab).join('-')}`;

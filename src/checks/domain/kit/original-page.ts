// The page kitvas draws an original on (ADR 0093): the markup an agent wrote for one example of a
// `code` kit, with the project's own compiled styles, standing as a catalog page stands. Pure: the
// step `original` of `kit verify` reads the files, compiles the styles and gives the frame's rule.

/** An original over this many characters is refused. */
export const ORIGINAL_MAX = 200_000;
/** The attribute on the root of every kit component in an original; its value is the name. */
export const SCOPE_MARK = 'data-kv-scope';

export type OriginalStyle = {
  css: string;
  /** The component these styles reach alone; undefined for styles of the whole page. */
  scope: string | undefined;
};

/** The app's shell of a `code` kit (`source.shell`), as the kit's contract holds it. */
export type OriginalShell = {
  html: Record<string, string>;
  body: Record<string, string>;
  /** From the outside in. */
  wrappers: { tag: string; attributes: Record<string, string> }[];
};

export type OriginalPageInput = {
  markup: string;
  /** In the order they apply. */
  styles: OriginalStyle[];
  /** The `file:` address of the project folder, ending in `/`: relative addresses start there. */
  base: string;
  /** The rule of kitvas's own frame, the one a catalog page has (`CATALOG_BODY_RULE`). */
  frame: string;
  shell: OriginalShell | undefined;
};

const REFUSED_TAGS =
  'html|head|body|script|style|link|iframe|object|embed|base|meta|frame|frameset|applet';
const ADDRESS_ATTRIBUTES = 'src|href|srcset|action|formaction|poster|data|ping|background';

/** Why an original is not a fragment kitvas may open, in English; undefined when it is one. */
export function originalIssue(markup: string): string | undefined {
  if (markup.length > ORIGINAL_MAX) return `it is over ${ORIGINAL_MAX} characters`;
  if (/<!doctype/i.test(markup)) return 'it holds a doctype';
  if (!/^\s*<[A-Za-z]/.test(markup)) return 'it does not start with an element';
  const tag = new RegExp(`<\\s*(${REFUSED_TAGS})(?![\\w-])`, 'i').exec(markup)?.[1];
  if (tag !== undefined) return `it holds a <${tag.toLowerCase()}> tag`;
  const handler = /<[^>]*?[\s"'/](on[a-z]+)\s*=/i.exec(markup)?.[1];
  if (handler !== undefined) return `it holds the attribute "${handler.toLowerCase()}"`;
  if (/javascript\s*:/i.test(markup)) return 'it holds a javascript: address';
  const outside = new RegExp(
    `(?:\\b(?:${ADDRESS_ATTRIBUTES})\\s*=\\s*["']?\\s*|url\\(\\s*["']?\\s*)(?:[a-z][a-z0-9+.-]*:)?//`,
    'i',
  );
  if (outside.test(markup)) return 'it holds an outside address';
  return undefined;
}

/** The names on the marks of an original, each once, in the order they first appear. */
export function originalMarks(markup: string): string[] {
  const names = new Set<string>();
  for (const match of markup.matchAll(new RegExp(`${SCOPE_MARK}\\s*=\\s*["']([^"']*)["']`, 'g'))) {
    if (match[1]) names.add(match[1]);
  }
  return [...names];
}

/** The index of the bracket that closes the one at `open`; -1 when none does. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    if (text[at] === '(') depth += 1;
    else if (text[at] === ')') {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return -1;
}

/**
 * `:host` is the web's own name for a component's root: here it is the marked element. A selector
 * that depends on what is around the component (`:host-context`) cannot be drawn: it is left as a
 * name no browser reads, so `needsBuild` reports it.
 */
function rootSelectors(css: string, mark: string): string {
  let out = '';
  let at = 0;
  for (;;) {
    const next = css.indexOf(':host', at);
    if (next === -1) return out + css.slice(at);
    out += css.slice(at, next);
    const after = next + ':host'.length;
    const follow = css[after] ?? '';
    const end = follow === '(' ? closing(css, after) : -1;
    if (end !== -1) {
      out += `${mark}:is(${css.slice(after + 1, end)})`;
      at = end + 1;
    } else {
      out += follow === '(' || /[\w-]/.test(follow) ? ':kv-unread' : mark;
      at = after;
    }
  }
}

/**
 * Styles that reach one component alone (spike 13). The scope starts at the parent of the marked
 * root, because a plain selector inside `@scope` never matches the scope's own root; it ends at the
 * root's siblings and at everything inside a nested component's root.
 */
export function scopedCss(css: string, name: string): string {
  const mark = `[${SCOPE_MARK}="${name}"]`;
  const ends = `:scope > :not(${mark}), ${mark} [${SCOPE_MARK}] > *`;
  return `@scope (:has(> ${mark})) to (${ends}) {\n${rootSelectors(css, mark)}\n}\n`;
}

/** A style as the page holds it: the text `scanStyles` reads for the probe. */
export const sheetCss = ({ css, scope }: OriginalStyle): string =>
  scope === undefined ? css : scopedCss(css, scope);

const escapeAttribute = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

/** ' name="value"' for each attribute. */
const attributesOf = (attributes: Record<string, string>): string =>
  Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');

/**
 * The whole document: the styles in order, the frame's own rule last, the markup in `#root`, and
 * the app's shell around it. The page's own mount has the id `root`, so a wrapper never takes it:
 * a rule the project wrote for `#root` already applies.
 */
export function originalPage({ markup, styles, base, frame, shell }: OriginalPageInput): string {
  const html = { lang: 'en', ...shell?.html };
  const wrappers = (shell?.wrappers ?? []).map(({ tag, attributes }) => {
    const kept = Object.fromEntries(
      Object.entries(attributes).filter(([name, value]) => name !== 'id' || value !== 'root'),
    );
    return { open: `<${tag}${attributesOf(kept)}>`, close: `</${tag}>` };
  });
  const sheet = (css: string): string =>
    `<style>\n${css.replace(/<\/(style)/gi, '<\\/$1')}\n</style>`;
  return [
    '<!doctype html>',
    `<html${attributesOf(html)}>`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<base href="${escapeAttribute(base)}">`,
    ...styles.map((style) => sheet(sheetCss(style))),
    sheet(frame),
    '</head>',
    `<body${attributesOf(shell?.body ?? {})}>`,
    ...wrappers.map((wrapper) => wrapper.open),
    `<div id="root">${markup}</div>`,
    ...wrappers.map((wrapper) => wrapper.close).reverse(),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** What a page must be able to read for the styles to show as written. */
export type StyleScan = {
  /** Every selector of every style rule, each once. */
  selectors: string[];
  /** Every declaration of a style rule, each once; custom properties are left out. */
  declarations: [property: string, value: string][];
  /** The names of the at-rules, each once, without the `@`. */
  atRules: string[];
};

/** The at-rules of CSS itself; any other needs a build of the project. */
const STANDARD_AT_RULES = new Set([
  'charset',
  'container',
  'counter-style',
  'font-face',
  'font-feature-values',
  'font-palette-values',
  'import',
  'keyframes',
  '-webkit-keyframes',
  'layer',
  'media',
  'namespace',
  'page',
  'position-try',
  'property',
  'scope',
  'starting-style',
  'supports',
  'view-transition',
]);
const KEYFRAMES = new Set(['keyframes', '-webkit-keyframes']);
/** At-rules whose block holds declarations, not rules. */
const DECLARATION_BLOCKS = new Set([
  'counter-style',
  'font-face',
  'font-feature-values',
  'font-palette-values',
  'page',
  'position-try',
  'property',
  'view-transition',
]);

type Block = 'style' | 'group' | 'keyframes' | 'plain';

/** `text` cut at the commas that stand outside brackets and strings. */
function splitList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let from = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] ?? '';
    if (quote !== '') {
      if (char === '\\') at += 1;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(from, at));
      from = at + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((part) => part.trim().replace(/\s+/g, ' ')).filter((part) => part !== '');
}

/** Reads CSS text block by block; comments and strings never open or close a block. */
export function scanStyles(css: string): StyleScan {
  const selectors = new Set<string>();
  const declarations = new Map<string, [string, string]>();
  const atRules = new Set<string>();
  const stack: Block[] = [];
  let buffer = '';
  let depth = 0;

  const atName = (text: string): string => /^@([\w-]+)/.exec(text)?.[1]?.toLowerCase() ?? '';
  const statement = (): void => {
    const text = buffer.trim();
    buffer = '';
    if (text === '') return;
    if (text.startsWith('@')) {
      atRules.add(atName(text));
      return;
    }
    const colon = text.indexOf(':');
    if (stack.at(-1) !== 'style' || colon <= 0) return;
    const property = text.slice(0, colon).trim();
    const value = text
      .slice(colon + 1)
      .replace(/!\s*important\s*$/i, '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!property.startsWith('--')) declarations.set(`${property}: ${value}`, [property, value]);
  };
  const open = (): void => {
    const prelude = buffer.trim();
    buffer = '';
    const parent = stack.at(-1);
    if (prelude.startsWith('@')) {
      const name = atName(prelude);
      atRules.add(name);
      stack.push(
        KEYFRAMES.has(name) ? 'keyframes' : DECLARATION_BLOCKS.has(name) ? 'plain' : 'group',
      );
    } else if (parent === 'keyframes' || parent === 'plain' || prelude.startsWith('--')) {
      // A keyframe, or a custom property whose value is a block: nothing to read as a rule.
      stack.push('plain');
    } else {
      // A rule nested in a rule may start with a combinator: it then continues its parent.
      for (const part of splitList(prelude)) {
        selectors.add(parent === 'style' && /^[>+~]/.test(part) ? `& ${part}` : part);
      }
      stack.push('style');
    }
  };

  for (let at = 0; at < css.length; at += 1) {
    const char = css[at] ?? '';
    if (char === '/' && css[at + 1] === '*') {
      const end = css.indexOf('*/', at + 2);
      at = end === -1 ? css.length : end + 1;
    } else if (char === '"' || char === "'") {
      let end = at + 1;
      while (end < css.length && css[end] !== char) end += css[end] === '\\' ? 2 : 1;
      buffer += css.slice(at, end + 1);
      at = end;
    } else if (char === '{' && depth === 0) open();
    else if (char === ';' && depth === 0) statement();
    else if (char === '}' && depth === 0) {
      statement();
      stack.pop();
    } else {
      if (char === '(' || char === '[') depth += 1;
      else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
      buffer += char;
    }
  }
  statement();
  return {
    selectors: [...selectors],
    declarations: [...declarations.values()],
    atRules: [...atRules].filter((name) => name !== ''),
  };
}

/** A name written for another browser engine: this browser drops it, as it does in the app. */
const OTHER_ENGINE = /(?:^|[\s:(,@])-(?:moz|ms|o|khtml)-/i;

/**
 * What of the styles only the project's own build would make readable: at-rules that are not CSS,
 * an `@import` left in the text, and each selector or declaration (`property: value`) the page did
 * not read (`unread`), unless it is written for another engine. [] when the page shows the styles
 * as the app does.
 */
export function needsBuild(scan: StyleScan, unread: string[]): string[] {
  const found = scan.atRules
    .filter((name) => !STANDARD_AT_RULES.has(name) || name === 'import')
    .map((name) => `@${name}`);
  return [...found, ...unread].filter((item) => !OTHER_ENGINE.test(item));
}

/** True when the styles change with the width of the page or of a container. */
export function hasBreakpoint(css: string): boolean {
  return /@(?:media|container)\b[^{]*\b(?:width|inline-size)\b/i.test(css);
}

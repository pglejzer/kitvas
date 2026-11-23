// The JSX elements of one draft file, read from the code esbuild makes of it with `jsxDev`,
// and the element ids derived from them.
//
// esbuild prints `jsxDEV(<tag>, <props with the children>, …, { fileName, lineNumber, columnNumber }, this)`.
// The calls open in source order and the source objects close in post-order; together the two
// orders give every element's parent without parsing the code.

export type JsxSite = {
  /** `section`, `Button`, `Card.Header`, `Fragment`. */
  tag: string;
  line: number;
  column: number;
  /** Index of the enclosing JSX element in the same list. */
  parent: number | undefined;
};

export type ElementId = { id: string; file: string; line: number; column: number; tag: string };

export type IdsFile = {
  schemaVersion: 1;
  ids: Record<string, { file: string; line: number; column: number; tag: string }>;
};

const OPENING = /\bjsxDEV\d*\(\s*("[^"]*"|[A-Za-z_$][\w$.]*)/g;
const SOURCE = /fileName:\s*"(?:[^"\\]|\\.)*",\s*lineNumber:\s*(\d+),\s*columnNumber:\s*(\d+)/g;
const FRAGMENT = /^Fragment\d*$/;

/** `undefined` when the calls and the source objects cannot be paired. */
export function readSites(code: string): JsxSite[] | undefined {
  const tags = [...code.matchAll(OPENING)].map((match) => (match[1] ?? '').replaceAll('"', ''));
  const found = [...code.matchAll(SOURCE)].map((match, closed) => ({
    line: Number(match[1]),
    column: Number(match[2]),
    closed,
  }));
  if (tags.length !== found.length) return undefined;

  const ordered = [...found].sort((a, b) => a.line - b.line || a.column - b.column);
  return ordered.map((site, index) => {
    let parent: number | undefined;
    for (let before = index - 1; before >= 0; before -= 1) {
      // An element that starts earlier and closes later encloses this one.
      if ((ordered[before]?.closed ?? -1) > site.closed) {
        parent = before;
        break;
      }
    }
    return { tag: tags[index] ?? '', line: site.line, column: site.column, parent };
  });
}

/** `file` is the path inside the draft version, with forward slashes: `src/tsx/sections/Hero.tsx`. */
export function elementIds(file: string, sites: JsxSite[]): ElementId[] {
  const stem = file.replace(/^src\/tsx\//, '').replace(/\.tsx$/, '');
  const idAt: (string | undefined)[] = [];
  const seen = new Map<string, number>();
  const ids: ElementId[] = [];

  /** The nearest enclosing element that is not a fragment. */
  const owner = (start: number | undefined): number | undefined => {
    let current = start;
    while (current !== undefined && FRAGMENT.test(sites[current]?.tag ?? '')) {
      current = sites[current]?.parent;
    }
    return current;
  };

  for (const [index, site] of sites.entries()) {
    if (FRAGMENT.test(site.tag)) continue;
    const parent = owner(site.parent);
    const slot = `${parent === undefined ? `${stem}:` : `${idAt[parent]}/`}${site.tag}`;
    const count = (seen.get(slot) ?? 0) + 1;
    seen.set(slot, count);
    const id = count === 1 ? slot : `${slot}.${count}`;
    idAt[index] = id;
    ids.push({ id, file, line: site.line, column: site.column, tag: site.tag });
  }
  return ids;
}

/** What the JSX runtime looks ids up by: `<file>:<line>:<column>`. */
export function siteMap(ids: ElementId[]): Record<string, string> {
  return Object.fromEntries(
    ids.map((entry) => [`${entry.file}:${entry.line}:${entry.column}`, entry.id]),
  );
}

export function idsFile(ids: ElementId[]): IdsFile {
  return {
    schemaVersion: 1,
    ids: Object.fromEntries(
      ids.map(({ id, file, line, column, tag }) => [id, { file, line, column, tag }]),
    ),
  };
}

// The icon sheet (ADR 0075): a kit's icons in one grid of fixed cells, rendered by the catalog bundle
// as an example of its own (`?example=kitvas-icons`) and shot as one image for the editor's Insert
// pane. Cell i is at x = (i % columns) * cell, y = floor(i / columns) * cell, in CSS pixels.

/** The sheet's key in the catalog bundle: lower case with a dash, so no `<Component>.<n>` key is it. */
export const ICON_SHEET_KEY = 'kitvas-icons';

/** The attribute on the sheet's grid: the box a shot of the sheet takes, nothing around it. */
export const ICON_SHEET_MARK = 'data-kitvas-sheet';

/** One cell, square, in CSS pixels. */
export const SHEET_CELL = 32;
/** Cells a row at most; a kit with fewer icons gets one row of exactly its icons. */
export const SHEET_COLUMNS = 32;
/** Icons on one sheet at most: the first ones the kit names. */
export const SHEET_MAX = 1024;

/** A name that can sit inside the string literal the Insert pane writes (`iconCode`). */
export const SHEET_NAME = /^[A-Za-z0-9_-]+$/;

export type IconSheet = {
  /** The kit's icon component, a component name of kit.json. */
  component: string;
  /** The icons on the sheet, in cell order. */
  names: string[];
  cell: number;
  columns: number;
};

/**
 * The names the sheet holds, in the kit's order: a name that is not `SHEET_NAME` and a name met
 * before are left out, then the first `SHEET_MAX` are kept.
 */
export function sheetNames(names: readonly string[]): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (kept.length === SHEET_MAX) break;
    if (!SHEET_NAME.test(name) || seen.has(name)) continue;
    seen.add(name);
    kept.push(name);
  }
  return kept;
}

/** Cells a row for `count` icons: all of them up to `SHEET_COLUMNS`, never 0. */
export const sheetColumns = (count: number): number =>
  Math.max(1, Math.min(SHEET_COLUMNS, Math.floor(count)));

/**
 * The sheet of an icon component and the names it takes; `undefined` when no name can be on it.
 * Only a kit whose `icons.source` is `component` has one: the caller checks that.
 */
export function iconSheet(icons: {
  component: string;
  names: readonly string[];
}): IconSheet | undefined {
  const names = sheetNames(icons.names);
  if (names.length === 0) return undefined;
  return {
    component: icons.component,
    names,
    cell: SHEET_CELL,
    columns: sheetColumns(names.length),
  };
}

/**
 * The sheet as lines of the catalog entry: the icon component taken from the kit by its name, the
 * names, and `KitvasIconSheet`, a grid of fixed cells with each icon centred in its cell with its
 * default props and cut at the cell's edge. Every value is written with `JSON.stringify` or is a
 * number of this file; the entry is only bundled, never type-checked.
 */
export function iconSheetSource(sheet: IconSheet): string[] {
  const size = `${sheet.cell}px`;
  const flat = "margin: 0, padding: 0, border: 'none'";
  const grid = [
    "display: 'grid'",
    `gridTemplateColumns: 'repeat(${sheet.columns}, ${size})'`,
    `gridAutoRows: '${size}'`,
    `width: '${sheet.columns * sheet.cell}px'`,
    flat,
  ].join(', ');
  const cell = [
    `width: '${size}'`,
    `height: '${size}'`,
    "overflow: 'hidden'",
    "display: 'flex'",
    "alignItems: 'center'",
    "justifyContent: 'center'",
    flat,
  ].join(', ');
  return [
    `const KitvasSheetIcon = (Kit as Record<string, unknown>)[${JSON.stringify(sheet.component)}];`,
    `const KITVAS_SHEET_NAMES: string[] = ${JSON.stringify(sheet.names)};`,
    'function KitvasIconSheet() {',
    '  return (',
    `    <div ${ICON_SHEET_MARK}="" style={{ ${grid} }}>`,
    '      {KITVAS_SHEET_NAMES.map((name) => (',
    `        <div key={name} style={{ ${cell} }}>`,
    '          <KitvasSheetIcon name={name} />',
    '        </div>',
    '      ))}',
    '    </div>',
    '  );',
    '}',
  ];
}

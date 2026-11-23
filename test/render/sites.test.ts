import assert from 'node:assert/strict';
import { test } from 'node:test';
import { elementIds, idsFile, readSites, siteMap } from '../../src/render/domain/sites.ts';

const FILE = 'src/tsx/sections/Hero.tsx';

/** One element the way esbuild prints it with jsxDev: the call opens, children follow, the source closes. */
const el = (tag: string, line: number, column: number, ...children: string[]): string =>
  `/* @__PURE__ */ jsxDEV(${tag}, { children: [${children.join(', ')}] }, void 0, false, {\n` +
  `  fileName: "${FILE}",\n  lineNumber: ${line},\n  columnNumber: ${column}\n}, this)`;

const CODE = [
  'import { Fragment, jsxDEV } from "react/jsx-dev-runtime";',
  `const Row = () => ${el('"li"', 1, 10)};`,
  `export const Hero = () => ${el(
    '"section"',
    3,
    5,
    el('Fragment', 4, 7, el('"p"', 5, 9), el('"p"', 6, 9)),
    el('"p"', 8, 7),
    el('Card', 9, 7, el('Button', 10, 9), el('Button', 11, 9)),
  )};`,
].join('\n');

test('reads every JSX element with its parent, in source order', () => {
  assert.deepEqual(readSites(CODE), [
    { tag: 'li', line: 1, column: 10, parent: undefined },
    { tag: 'section', line: 3, column: 5, parent: undefined },
    { tag: 'Fragment', line: 4, column: 7, parent: 1 },
    { tag: 'p', line: 5, column: 9, parent: 2 },
    { tag: 'p', line: 6, column: 9, parent: 2 },
    { tag: 'p', line: 8, column: 7, parent: 1 },
    { tag: 'Card', line: 9, column: 7, parent: 1 },
    { tag: 'Button', line: 10, column: 9, parent: 6 },
    { tag: 'Button', line: 11, column: 9, parent: 6 },
  ]);
});

test('code without JSX has no sites; code it cannot pair up is refused', () => {
  assert.deepEqual(readSites('export const a = 1;'), []);
  assert.equal(readSites('jsxDEV("p", {}, void 0, false, void 0, this)'), undefined);
});

test('ids are the tag path in the file; fragments are skipped; same-tag siblings are numbered', () => {
  const ids = elementIds(FILE, readSites(CODE) ?? []);
  assert.deepEqual(
    ids.map((entry) => entry.id),
    [
      'sections/Hero:li',
      'sections/Hero:section',
      'sections/Hero:section/p',
      'sections/Hero:section/p.2',
      'sections/Hero:section/p.3',
      'sections/Hero:section/Card',
      'sections/Hero:section/Card/Button',
      'sections/Hero:section/Card/Button.2',
    ],
  );
  assert.deepEqual(ids.at(-1), {
    id: 'sections/Hero:section/Card/Button.2',
    file: FILE,
    line: 11,
    column: 9,
    tag: 'Button',
  });
});

test('two roots with the same tag are numbered too', () => {
  const code = [el('"div"', 1, 1), el('"div"', 5, 1)].join(';\n');
  assert.deepEqual(
    elementIds('src/tsx/index.tsx', readSites(code) ?? []).map((entry) => entry.id),
    ['index:div', 'index:div.2'],
  );
});

test('the bundle map and ids.json are built from the ids', () => {
  const ids = elementIds(FILE, readSites(CODE) ?? []).slice(0, 2);
  assert.deepEqual(siteMap(ids), {
    'src/tsx/sections/Hero.tsx:1:10': 'sections/Hero:li',
    'src/tsx/sections/Hero.tsx:3:5': 'sections/Hero:section',
  });
  assert.deepEqual(idsFile(ids), {
    schemaVersion: 1,
    ids: {
      'sections/Hero:li': { file: FILE, line: 1, column: 10, tag: 'li' },
      'sections/Hero:section': { file: FILE, line: 3, column: 5, tag: 'section' },
    },
  });
});

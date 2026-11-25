import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogMountSource } from '../../src/render/domain/catalog-mount.ts';
import { EXAMPLE_KEY } from '../../src/render/domain/catalog-stamp.ts';
import {
  cellAt,
  ICON_SHEET_KEY,
  ICON_SHEET_MARK,
  iconSheet,
  iconSheetSource,
  SHEET_CELL,
  SHEET_COLUMNS,
  SHEET_MAX,
  sheetColumns,
  sheetNames,
  sheetSize,
} from '../../src/render/domain/icon-sheet.ts';

const many = (count: number): string[] => Array.from({ length: count }, (_, i) => `icon-${i}`);

test('the sheet holds 32 px cells, at most 32 a row and 1024 in all', () => {
  assert.equal(SHEET_CELL, 32);
  assert.equal(SHEET_COLUMNS, 32);
  assert.equal(SHEET_MAX, 1024);
});

test('names that cannot sit in a string literal, and repeats, are left out in order', () => {
  assert.deepEqual(
    sheetNames(['check', 'arrow left', 'close', 'a"b', 'check', "it's", 'chevron_down', '']),
    ['check', 'close', 'chevron_down'],
  );
  assert.deepEqual(sheetNames(['Alert-2', 'ok_1']), ['Alert-2', 'ok_1']);
});

test('only the first 1024 names are kept, counted after the unsafe ones are left out', () => {
  const names = ['bad name', ...many(1100)];
  const kept = sheetNames(names);
  assert.equal(kept.length, 1024);
  assert.equal(kept[0], 'icon-0');
  assert.equal(kept.at(-1), 'icon-1023');
});

test('a few icons make one row of exactly them; many make rows of 32', () => {
  assert.equal(sheetColumns(0), 1);
  assert.equal(sheetColumns(8), 8);
  assert.equal(sheetColumns(32), 32);
  assert.equal(sheetColumns(33), 32);
  const small = iconSheet({ component: 'Icon', names: ['a', 'b', 'c'] });
  assert.deepEqual(small, { component: 'Icon', names: ['a', 'b', 'c'], cell: 32, columns: 3 });
  assert.deepEqual(small && sheetSize(small), { width: 96, height: 32 });
  const full = iconSheet({ component: 'Icon', names: many(1100) });
  assert.equal(full?.columns, 32);
  assert.deepEqual(full && sheetSize(full), { width: 1024, height: 1024 });
  const ragged = iconSheet({ component: 'Icon', names: many(33) });
  assert.deepEqual(ragged && sheetSize(ragged), { width: 1024, height: 64 });
});

test('no name the sheet can hold means no sheet', () => {
  assert.equal(iconSheet({ component: 'Icon', names: [] }), undefined);
  assert.equal(iconSheet({ component: 'Icon', names: ['not safe', '<b>'] }), undefined);
});

test('cell i is at x = (i % columns) * cell and y = floor(i / columns) * cell', () => {
  const sheet = { cell: 32, columns: 32 };
  assert.deepEqual(cellAt(sheet, 0), { x: 0, y: 0 });
  assert.deepEqual(cellAt(sheet, 31), { x: 992, y: 0 });
  assert.deepEqual(cellAt(sheet, 32), { x: 0, y: 32 });
  assert.deepEqual(cellAt(sheet, 1023), { x: 992, y: 992 });
  assert.deepEqual(cellAt({ cell: 32, columns: 3 }, 4), { x: 32, y: 32 });
});

test('the sheet key can never be an example key of a component', () => {
  assert.equal(EXAMPLE_KEY.test(ICON_SHEET_KEY), false);
});

test('the sheet source is a fixed grid of clipped, centred cells with the names quoted', () => {
  const sheet = { component: 'Icon', names: ['check', 'x-1'], cell: 32, columns: 2 };
  const source = iconSheetSource(sheet).join('\n');
  assert.ok(source.includes('const KitvasSheetIcon = (Kit as Record<string, unknown>)["Icon"];'));
  assert.ok(source.includes('const KITVAS_SHEET_NAMES: string[] = ["check","x-1"];'));
  assert.ok(source.includes(`<div ${ICON_SHEET_MARK}="" style={{ display: 'grid'`));
  assert.ok(source.includes("gridTemplateColumns: 'repeat(2, 32px)'"));
  assert.ok(source.includes("gridAutoRows: '32px'"));
  assert.ok(source.includes("width: '64px'"));
  assert.ok(source.includes("overflow: 'hidden'"));
  assert.ok(source.includes("alignItems: 'center'"));
  assert.ok(source.includes("justifyContent: 'center'"));
  // Each icon with its default props: only its name is given.
  assert.ok(source.includes('<KitvasSheetIcon name={name} />'));
});

test('a catalog with a sheet renders it under its own key, after the examples', () => {
  const sheet = { component: 'Icon', names: ['check'], cell: 32, columns: 1 };
  const source = catalogMountSource({
    providers: [],
    components: ['Button', 'Icon'],
    examples: [{ key: 'Button.1', code: '<Button>Save</Button>' }],
    sheet,
  });
  assert.ok(
    source.includes(
      'const EXAMPLES: [string, () => unknown][] = [["Button.1", KitvasExample0], ["kitvas-icons", KitvasIconSheet]];',
    ),
  );
  assert.ok(source.includes('startExample({ keys: ["Button.1","kitvas-icons"], render });'));
  assert.ok(
    source.indexOf('function KitvasExample0()') < source.indexOf('function KitvasIconSheet()'),
  );
  assert.ok(source.indexOf('function KitvasIconSheet()') < source.indexOf('class KitvasBoundary'));
});

test('a catalog without a sheet is the same as before', () => {
  const input = {
    providers: [],
    components: ['Button'],
    examples: [{ key: 'Button.1', code: '<Button>Save</Button>' }],
  };
  const source = catalogMountSource(input);
  assert.equal(catalogMountSource({ ...input, sheet: undefined }), source);
  assert.ok(!source.includes('KitvasIconSheet'));
  assert.ok(source.includes('startExample({ keys: ["Button.1"], render });'));
});

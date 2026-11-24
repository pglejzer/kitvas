// A duplicated list item must not repeat a React key (spec 4d, goal 8): a literal `key` of the
// item is made unique in the copy; a key read from another field is left as it is.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyListEdit, type ListOp } from '../../../src/edit/domain/list/edit.ts';

const ID = 'sections/Plans:section/ul/li';

/** A list section whose items are `lines`, each rendered as `<li key={item.<field>}>`. */
function section(lines: string[], field = 'key'): string {
  return [
    'const ITEMS = [',
    ...lines,
    '];',
    '',
    'export function Plans() {',
    '  return (',
    '    <ul>',
    '      {ITEMS.map((item) => (',
    `        <li key={item.${field}}>{item.title}</li>`,
    '      ))}',
    '    </ul>',
    '  );',
    '}',
    '',
  ].join('\n');
}

const A = "  { key: 'a', title: 'A' },";
const B = "  { key: 'b', title: 'B' },";

function edited(text: string, op: ListOp): string {
  const result = applyListEdit(text, text.indexOf('<li'), op, { force: false });
  assert.ok('text' in result, JSON.stringify(result));
  return result.text;
}

const duplicate = (item: number): ListOp => ({ op: 'duplicateItem', id: ID, item });
const remove = (item: number): ListOp => ({ op: 'removeItem', id: ID, item });

test('a copy of an item with a literal key gets the key with -2', () => {
  const copied = edited(section([A, B]), duplicate(0));
  assert.equal(copied, section([A, "  { key: 'a-2', title: 'A' },", B]));
});

test('the last item is copied with a free key too, and removing the copy gives the file back', () => {
  const text = section([A, B]);
  const copied = edited(text, duplicate(1));
  assert.equal(copied, section([A, B, "  { key: 'b-2', title: 'B' },"]));
  assert.equal(edited(copied, remove(2)), text);
});

test('the number counts up while the name is taken', () => {
  const taken = "  { key: 'a-2', title: 'A' },";
  const copied = edited(section([A, taken]), duplicate(0));
  assert.equal(copied, section([A, "  { key: 'a-3', title: 'A' },", taken]));
});

test('the removal of a copy gives the file back byte for byte, also with CRLF', () => {
  const text = section([A, B]).replaceAll('\n', '\r\n');
  const copied = edited(text, duplicate(0));
  assert.ok(copied.includes("key: 'a-2'"));
  assert.equal(edited(copied, remove(1)), text);
});

test('a double-quoted key keeps its quotes', () => {
  const one = '  { key: "a", title: "A" },';
  const copied = edited(section([one]), duplicate(0));
  assert.equal(copied, section([one, '  { key: "a-2", title: "A" },']));
});

test('a key read from another field is copied as it is: the person decides', () => {
  const lines = ["  { id: 'a', title: 'A' },", "  { id: 'b', title: 'B' },"];
  const copied = edited(section(lines, 'id'), duplicate(0));
  assert.equal(copied, section([lines[0] ?? '', lines[0] ?? '', lines[1] ?? ''], 'id'));
});

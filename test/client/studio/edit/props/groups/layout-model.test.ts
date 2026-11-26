// Layout's rows with human labels (plan 18f, task 2; spec S4.6 item 4): which show for what the
// element lays out, and that each is a view of a raw row kept in "All layout properties".

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { segmentIcons } from '../../../../../../client/studio/edit/props/controls/keyword-icons.ts';
import { STYLE_GROUPS } from '../../../../../../client/studio/edit/props/groups/groups.ts';
import {
  HUMAN_ROWS,
  humanRows,
  layoutKind,
} from '../../../../../../client/studio/edit/props/groups/layout-model.ts';
import { keywordsOf } from '../../../../../../client/studio/edit/props/values/kinds.ts';

const ids = (kind: Parameters<typeof humanRows>[0]): string[] =>
  humanRows(kind).map((row) => row.id);

test('what the element lays out comes from its display', () => {
  assert.equal(layoutKind('flex'), 'flex');
  assert.equal(layoutKind(' inline-flex '), 'flex');
  assert.equal(layoutKind('grid'), 'grid');
  assert.equal(layoutKind('inline-grid'), 'grid');
  assert.equal(layoutKind('block'), 'other');
  assert.equal(layoutKind(''), 'unknown');
  assert.equal(layoutKind(null), 'unknown');
  assert.equal(layoutKind(undefined), 'unknown');
});

test('a flex box shows all five rows, a grid three, anything else none', () => {
  assert.deepEqual(ids('flex'), ['direction', 'align', 'justify', 'wrap', 'gap']);
  assert.deepEqual(ids('grid'), ['align', 'justify', 'gap']);
  assert.deepEqual(ids('other'), []);
  // Several elements with displays that differ: every row, each writes to all of them.
  assert.deepEqual(ids('unknown'), ['direction', 'align', 'justify', 'wrap', 'gap']);
});

test("each human row is a view of a raw layout row, with the property's own keywords", () => {
  for (const row of HUMAN_ROWS) {
    assert.ok(STYLE_GROUPS.layout.includes(row.property), row.id);
    if (row.keywords === null) continue;
    const all = keywordsOf(row.property) ?? [];
    for (const keyword of row.keywords) assert.ok(all.includes(keyword), `${row.id}: ${keyword}`);
  }
});

test('Direction, Align and Justify draw as icons, Wrap as a switch', () => {
  const look = (id: string) => HUMAN_ROWS.find((row) => row.id === id);
  for (const id of ['direction', 'align', 'justify']) {
    const row = look(id);
    assert.ok(row);
    assert.equal(row.look, 'icons');
    assert.notEqual(segmentIcons(row.property, row.keywords ?? []), null, id);
  }
  assert.deepEqual(look('align')?.keywords, ['flex-start', 'center', 'flex-end', 'stretch']);
  assert.deepEqual(look('wrap')?.keywords, ['nowrap', 'wrap']);
  assert.equal(look('gap')?.look, 'field');
});

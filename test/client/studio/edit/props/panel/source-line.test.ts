// What the Source strip of Properties says (plan 18f, task 2; spec S4.6 item 7): the element's
// file and line, its opening tag as one line, and its class rule's file and line, each copied as
// `path:line`.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fileName,
  sourceLines,
} from '../../../../../../client/studio/edit/props/panel/source-line.ts';

const TSX = 'src/tsx/sections/Pricing.tsx';
const SCSS = 'src/scss/sections/pricing.scss';

test('a place is named by its file and copied as its path and line', () => {
  assert.equal(fileName(TSX), 'Pricing.tsx');
  assert.equal(fileName('Pricing.tsx'), 'Pricing.tsx');
  const lines = sourceLines({
    file: TSX,
    line: 21,
    source: { tag: '<section className="pricing">', ruleFile: SCSS, ruleLine: 3 },
    styleClass: { className: 'pricing', exists: true },
  });
  assert.deepEqual(lines, {
    file: { name: 'Pricing.tsx', line: 21, copy: `${TSX}:21` },
    tag: '<section className="pricing">',
    rule: { name: 'pricing.scss', line: 3, copy: `${SCSS}:3`, className: 'pricing' },
  });
});

test('an element without a rule, a line or a source says only what it has', () => {
  const noRule = sourceLines({
    file: TSX,
    line: 8,
    source: { tag: '<p>', ruleFile: null, ruleLine: null },
    styleClass: null,
  });
  assert.equal(noRule.rule, null);
  assert.equal(noRule.tag, '<p>');
  // A studio that sends no source: the file alone, as the header showed it before.
  const old = sourceLines({ file: TSX, styleClass: null });
  assert.deepEqual(old.file, { name: 'Pricing.tsx', line: null, copy: TSX });
  assert.deepEqual([old.tag, old.rule], [null, null]);
});

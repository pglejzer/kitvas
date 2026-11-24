import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SOURCE_RULE_IDS, sourceRuleFindings } from '../../../src/checks/index.ts';

const tsx = (text: string) => sourceRuleFindings({ file: 'src/tsx/sections/Hero.tsx', text });
const scss = (text: string) => sourceRuleFindings({ file: 'src/scss/sections/hero.scss', text });

test('a blocked paste is a fix at the attribute', () => {
  const found = tsx(
    'export const A = () => (\n  <input onPaste={(e) => { e.preventDefault(); }} />\n);\n',
  );
  assert.equal(found.length, 1);
  assert.deepEqual(
    {
      check: found[0]?.check,
      rule: found[0]?.rule,
      severity: found[0]?.severity,
      file: found[0]?.file,
      line: found[0]?.line,
      column: found[0]?.column,
      element: found[0]?.element,
      states: found[0]?.states,
      widths: found[0]?.widths,
    },
    {
      check: 'ux',
      rule: 'ux/paste-blocked',
      severity: 'fix',
      file: 'src/tsx/sections/Hero.tsx',
      line: 2,
      column: 10,
      element: null,
      states: [],
      widths: [],
    },
  );
});

test('a paste handler that does not prevent the default is fine', () => {
  assert.deepEqual(tsx('<input onPaste={(e) => track(e)} />'), []);
  assert.deepEqual(tsx('<input onPaste={track} onChange={(e) => e.preventDefault()} />'), []);
});

test('autoFocus is a review; a comment or a string that says it is not', () => {
  const found = tsx('<input\n  autoFocus\n/>');
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/autofocus');
  assert.equal(found[0]?.severity, 'review');
  assert.equal(found[0]?.line, 2);
  assert.equal(found[0]?.column, 3);
  assert.deepEqual(tsx('// autoFocus is not used\n/* autoFocus */\n<p>ok</p>'), []);
  assert.deepEqual(tsx('const s = "autoFocus";'), []);
});

test('transition all in SCSS is found, named properties are not', () => {
  const found = scss('.a {\n  transition: all 0.2s ease;\n}\n');
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ui/transition-all');
  assert.equal(found[0]?.check, 'ui');
  assert.equal(found[0]?.severity, 'review');
  assert.equal(found[0]?.line, 2);
  assert.equal(found[0]?.column, 3);
  assert.equal(scss('.a { transition-property: all; }').length, 1);
  assert.deepEqual(scss('.a { transition: opacity 0.2s, transform 0.2s; }'), []);
  assert.deepEqual(scss('.a { transition: color 1s; transition-property: width; }'), []);
  assert.deepEqual(scss('// transition: all 1s\n/* transition: all 1s */\n.a { color: red; }'), []);
});

test('transition all in a TSX style object is found', () => {
  const found = tsx("<div style={{ transition: 'all 0.3s' }} />");
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ui/transition-all');
  assert.equal(tsx("<div style={{ transitionProperty: 'all' }} />").length, 1);
  assert.deepEqual(tsx("<div style={{ transition: 'opacity 0.3s' }} />"), []);
  assert.deepEqual(tsx("// transition: 'all 1s'\n<div />"), []);
});

test('an img without a size is a review at the tag', () => {
  const found = tsx('<section>\n  <img src="a.png" alt="" />\n</section>');
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ui/image-size');
  assert.equal(found[0]?.severity, 'review');
  assert.equal(found[0]?.line, 2);
  assert.equal(found[0]?.column, 3);
});

test('an img with a size or an aspect ratio is fine', () => {
  assert.deepEqual(tsx('<img src="a.png" width={400} height={300} alt="" />'), []);
  assert.deepEqual(tsx('<img src="a.png" style={{ aspectRatio: \'4 / 3\' }} alt="" />'), []);
  assert.equal(tsx('<img src="a.png" width={400} alt="" />').length, 1);
  assert.deepEqual(tsx('{/* <img src="a.png" /> */}<p />'), []);
});

test('other files and empty sources give nothing', () => {
  assert.deepEqual(tsx(''), []);
  assert.deepEqual(scss(''), []);
  assert.deepEqual(sourceRuleFindings({ file: 'notes.md', text: '<img src="a.png" />' }), []);
});

test('every source rule id is listed', () => {
  assert.deepEqual([...SOURCE_RULE_IDS].sort(), [
    'ui/image-size',
    'ui/transition-all',
    'ux/autofocus',
    'ux/paste-blocked',
  ]);
});

// Every operation followed by its inverse gives the file back byte for byte (src/edit/AGENTS.md),
// held here for every real SCSS file of the fixtures and of the built-in kit.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  applyScss,
  listRules,
  readRule,
  type ScssOp,
  scssBalanced,
} from '../../src/edit/domain/apply-scss.ts';
import {
  type ApplyResult,
  type Declaration,
  type EditOp,
  inverse,
  keywordsOf,
  kindOf,
  plainValue,
  type StyleValue,
} from '../../src/edit/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { listFiles } from '../helpers/architecture.ts';

const ID = 'sections/Pricing:section/Stack';
const PLAIN = { force: false };
const PROBE: StyleValue = { token: '--kit-rt-probe' };

const files = ['test/fixtures', 'kits/base']
  .flatMap((folder) => listFiles(PLUGIN_ROOT, folder))
  .filter((path) => path.endsWith('.scss'))
  .map((path) => ({ path, text: readFileSync(join(PLUGIN_ROOT, path), 'utf8') }));

function scssOp(op: EditOp): ScssOp {
  if (op.op !== 'setStyle' && op.op !== 'removeStyle') assert.fail(`not a style op: ${op.op}`);
  return op;
}

function textOf(result: ApplyResult, where: string): string {
  if (!('text' in result)) assert.fail(`${where}: ${JSON.stringify(result)}`);
  return result.text;
}

/** The style value a declaration holds, as an operation names it for its `before`. */
function heldValue(declaration: Declaration): StyleValue {
  if (declaration.offKit) return { raw: declaration.value };
  const name = /^var\((--kit-[A-Za-z0-9_-]+)\)$/.exec(declaration.value)?.[1];
  // A plain value (`display: flex`) has no marker: `mark: false` names it as it is.
  return name === undefined ? { raw: declaration.value, mark: false } : { token: name };
}

/**
 * What to write over a declaration and how the file then spells it: the probe token, or for a
 * keyword property another word of its list (a token there is refused). `null`: nothing to try.
 */
function probeFor(declaration: Declaration): { value: StyleValue; css: string } | null {
  const kind = kindOf(declaration.property);
  if (kind === 'image') return null;
  if (kind !== 'keyword') return { value: PROBE, css: 'var(--kit-rt-probe)' };
  const words = keywordsOf(declaration.property) ?? [];
  if (!words.includes(declaration.value)) return null;
  const other = words.find((word) => word !== declaration.value);
  return other === undefined ? null : { value: plainValue(other), css: other };
}

test('the fixtures and the built-in kit have SCSS files with class rules to try', () => {
  assert.ok(files.length >= 10, `only ${files.length} files`);
  assert.ok(files.flatMap((file) => listRules(file.text)).length >= 10);
  for (const file of files) assert.equal(scssBalanced(file.text), true, file.path);
});

test('a new declaration and then its inverse leave every rule of every file as it was', () => {
  let tried = 0;
  for (const { path, text } of files) {
    for (const rule of listRules(text)) {
      const where = `${path} .${rule.className}`;
      if (readRule(text, rule.className) === 'ambiguous') continue;
      const taken = [...rule.declarations.map((d) => d.property), ...rule.nested];
      if (taken.includes('outline-offset')) continue;
      const op: ScssOp = {
        op: 'setStyle',
        id: ID,
        className: rule.className,
        property: 'outline-offset',
        value: { raw: '1px' },
        before: null,
        newRule: false,
      };
      const applied = textOf(applyScss(text, op, PLAIN), where);
      assert.notEqual(applied, text, where);
      const added = readRule(applied, rule.className);
      assert.ok(added !== null && added !== 'ambiguous', where);
      assert.deepEqual(added.declarations.at(-1)?.property, 'outline-offset', where);
      assert.equal(added.declarations.at(-1)?.offKit, true, where);
      assert.equal(textOf(applyScss(applied, scssOp(inverse(op)), PLAIN), where), text, where);
      tried += 1;
    }
  }
  assert.ok(tried >= 10, `only ${tried} rules tried`);
});

test('a token on every existing declaration and then its inverse leave the file as it was', () => {
  let exact = 0;
  let plain = 0;
  let keywords = 0;
  for (const { path, text } of files) {
    for (const rule of listRules(text)) {
      if (readRule(text, rule.className) === 'ambiguous') continue;
      for (const declaration of rule.declarations) {
        const { property, span } = declaration;
        const where = `${path} .${rule.className} ${property}`;
        if (rule.declarations.filter((d) => d.property === property).length > 1) continue;
        const probe = probeFor(declaration);
        if (probe === null) continue;
        const before = heldValue(declaration);
        const op: ScssOp = {
          op: 'setStyle',
          id: ID,
          className: rule.className,
          property,
          value: probe.value,
          before,
          newRule: false,
        };
        const applied = textOf(applyScss(text, op, PLAIN), where);
        // Only the value changed: everything before and after it is the file's own text.
        const at = text.indexOf(declaration.value, text.indexOf(':', span.start));
        assert.equal(
          applied,
          `${text.slice(0, at)}${probe.css}${text.slice(at + declaration.value.length)}`,
          where,
        );
        const back = textOf(applyScss(applied, scssOp(inverse(op)), PLAIN), where);
        assert.equal(back, text, where);
        if (kindOf(property) === 'keyword') keywords += 1;
        if ('mark' in before) plain += 1;
        else exact += 1;
      }
    }
  }
  assert.ok(exact >= 10, `only ${exact} token declarations tried`);
  assert.ok(plain >= 10, `only ${plain} plain declarations tried`);
  // Plan 15: the keyword words of the fixtures and the kit, each swapped for another of its list.
  assert.ok(keywords >= 5, `only ${keywords} keyword declarations tried`);
});

test('a new rule and then its inverse leave every file as it was', () => {
  for (const { path, text } of files) {
    assert.equal(readRule(text, 'rt-new'), null, path);
    const op: ScssOp = {
      op: 'setStyle',
      id: ID,
      className: 'rt-new',
      property: 'gap',
      value: { token: '--kit-space-md' },
      before: null,
      newRule: true,
    };
    const applied = textOf(applyScss(text, op, PLAIN), path);
    assert.ok(applied.startsWith(text), path);
    assert.equal(scssBalanced(applied), true, path);
    const created = readRule(applied, 'rt-new');
    assert.ok(created !== null && created !== 'ambiguous', path);
    assert.deepEqual(
      created.declarations.map((d) => [d.property, d.value, d.offKit]),
      [['gap', 'var(--kit-space-md)', false]],
      path,
    );
    assert.equal(textOf(applyScss(applied, scssOp(inverse(op)), PLAIN), path), text, path);
  }
});

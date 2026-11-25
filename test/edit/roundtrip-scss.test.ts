// Every operation followed by its inverse gives the file back byte for byte (src/edit/AGENTS.md),
// held here for every real SCSS file of the fixtures and of the built-in kit, for every class of
// it: the top-level rules and the ones nested as `&__part` or `&--modifier` (ADR 0067).

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
  scssOverrides,
} from '../../src/edit/domain/style/apply-scss.ts';
import { readRules } from '../../src/edit/domain/style/scss-rules.ts';
import {
  type ApplyResult,
  type Declaration,
  type EditOp,
  inverse,
  keywordsOf,
  kindOf,
  plainValue,
  type RuleView,
  type StyleContext,
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

/** Each class of the file once, its rules read together as the editor reads them. */
function classesOf(text: string): RuleView[] {
  const names = [...new Set(readRules(text).map((rule) => rule.view.className))];
  return names.map((name) => {
    const rule = readRule(text, name);
    if (rule === null || rule === 'ambiguous') assert.fail(`no rule .${name}`);
    return rule;
  });
}

/** The rule that holds the declaration declares its property again: a write there is refused. */
function declaredTwice(text: string, declaration: Declaration): boolean {
  const holder = readRules(text).find((rule) =>
    rule.view.declarations.some((each) => each.span.start === declaration.span.start),
  );
  const same = holder?.view.declarations.filter((each) => each.property === declaration.property);
  return (same?.length ?? 0) > 1;
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
    for (const rule of classesOf(text)) {
      const where = `${path} .${rule.className}`;
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
      // Last of the body, or above the rule's first width, state or joined rule (spec 4c).
      const made = added.declarations.find((d) => d.property === 'outline-offset');
      assert.equal(made?.offKit, true, where);
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
    for (const rule of classesOf(text)) {
      for (const declaration of rule.declarations) {
        const { property, span } = declaration;
        const where = `${path} .${rule.className} ${property}`;
        if (declaredTwice(text, declaration)) continue;
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

const CONTEXTS: StyleContext[] = [
  { width: 768, state: null },
  { width: 1280, state: null },
  { width: null, state: 'hover' },
  { width: null, state: 'focus-visible' },
  { width: null, state: 'active' },
  { width: 768, state: 'hover' },
  { width: 1280, state: 'active' },
];

test('a value for a width or a state and then its inverse leave every rule as it was', () => {
  let tried = 0;
  for (const { path, text } of files) {
    for (const rule of classesOf(text)) {
      for (const context of CONTEXTS) {
        const where = `${path} .${rule.className} ${JSON.stringify(context)}`;
        const here = (each: { context: StyleContext }): boolean =>
          each.context.width === context.width && each.context.state === context.state;
        // As the panel sends a new value: a context the rule has a block of keeps it, and its
        // inverse leaves the block there with what else it holds; another gets a new one.
        const op: ScssOp = {
          op: 'setStyle',
          id: ID,
          className: rule.className,
          property: 'outline-width',
          value: { raw: '1px' },
          before: null,
          newRule: false,
          context,
          newBlock: true,
        };
        const result = applyScss(text, op, PLAIN);
        // A rule kitvas cannot add to is refused or a conflict: a block read twice, a last line
        // without `;`, a block that sets the property already.
        if (!('text' in result)) continue;
        const applied = result.text;
        assert.equal(scssBalanced(applied), true, where);
        assert.deepEqual(
          scssOverrides(applied, rule.className)
            .filter((each) => each.property === 'outline-width' && here(each))
            .map((each) => [each.value, each.offKit]),
          [['1px', true]],
          where,
        );
        // The base of the rule is what it was.
        const after = readRule(applied, rule.className);
        assert.ok(after !== null && after !== 'ambiguous', where);
        assert.deepEqual(
          after.declarations.map((d) => [d.property, d.value, d.offKit]),
          rule.declarations.map((d) => [d.property, d.value, d.offKit]),
          where,
        );
        assert.deepEqual(after.nested, rule.nested, where);
        assert.equal(textOf(applyScss(applied, scssOp(inverse(op)), PLAIN), where), text, where);
        tried += 1;
      }
    }
  }
  assert.ok(tried >= 30, `only ${tried} contexts tried`);
});

test('a new rule with a width and a state and then its inverse leave every file as it was', () => {
  for (const { path, text } of files) {
    for (const context of CONTEXTS) {
      const op: ScssOp = {
        op: 'setStyle',
        id: ID,
        className: 'rt-new',
        property: 'gap',
        value: { token: '--kit-space-md' },
        before: null,
        newRule: true,
        context,
        newBlock: true,
      };
      const applied = textOf(applyScss(text, op, PLAIN), path);
      assert.ok(applied.startsWith(text), path);
      assert.equal(scssBalanced(applied), true, path);
      assert.deepEqual(scssOverrides(applied, 'rt-new'), [
        { context, property: 'gap', value: 'var(--kit-space-md)', offKit: false },
      ]);
      assert.equal(textOf(applyScss(applied, scssOp(inverse(op)), PLAIN), path), text, path);
    }
  }
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

test('a new class of a block nests in its rule, and its inverse leaves every file as it was', () => {
  let tried = 0;
  const values = (rule: RuleView | null | 'ambiguous'): unknown =>
    rule === null || rule === 'ambiguous'
      ? rule
      : [rule.declarations.map((d) => [d.property, d.value, d.offKit]), rule.nested];
  for (const { path, text } of files) {
    const blocks = listRules(text).map((rule) => rule.className);
    for (const block of new Set(blocks)) {
      const className = `${block}__rt-new`;
      for (const context of [null, ...CONTEXTS]) {
        const where = `${path} .${className} ${JSON.stringify(context)}`;
        const op: ScssOp = {
          op: 'setStyle',
          id: ID,
          className,
          property: 'gap',
          value: { token: '--kit-space-md' },
          before: null,
          newRule: true,
          ...(context === null ? {} : { context, newBlock: true }),
        };
        const applied = textOf(applyScss(text, op, PLAIN), where);
        assert.equal(scssBalanced(applied), true, where);
        // Inside the block's rule: the file has no new top-level rule, and the block's own
        // values are what they were.
        assert.deepEqual(
          listRules(applied).map((rule) => rule.className),
          blocks,
          where,
        );
        assert.deepEqual(values(readRule(applied, block)), values(readRule(text, block)), where);
        if (context === null) {
          assert.deepEqual(values(readRule(applied, className)), [
            [['gap', 'var(--kit-space-md)', false]],
            [],
          ]);
        } else {
          assert.deepEqual(scssOverrides(applied, className), [
            { context, property: 'gap', value: 'var(--kit-space-md)', offKit: false },
          ]);
        }
        assert.equal(textOf(applyScss(applied, scssOp(inverse(op)), PLAIN), where), text, where);
        tried += 1;
      }
    }
  }
  assert.ok(tried >= 40, `only ${tried} new nested rules tried`);
});

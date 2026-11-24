// Every property plan 15 adds, written at each of its places and then undone, gives the file back
// byte for byte (src/edit/AGENTS.md): a new declaration, a new value in one, a new rule, and the
// kit prop that covers it (Base's Stack `direction`, `align`, `justify` and `wrap`).

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  applyScss,
  readRule,
  type ScssOp,
  type ScssOptions,
} from '../../src/edit/domain/style/apply-scss.ts';
import { applyTsx, openingTags, readTag, type TsxOp } from '../../src/edit/domain/tsx/apply-tsx.ts';
import {
  type ApplyResult,
  type EditOp,
  imageUrl,
  inverse,
  keywordOfWord,
  keywordsOf,
  kindOf,
  plainValue,
  STYLE_PROPERTIES,
  type StyleProperty,
  type StyleValue,
  styleSource,
  tokenGroupsOf,
} from '../../src/edit/index.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { type KitComponent, requireKit } from '../../src/kit/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';

const ID = 'sections/Hero:section/div';
const OPTIONS: ScssOptions = { force: false, hasImage: (file) => file === 'hero.png' };
const KEEP = { force: false };
/** The properties plan 15 adds, after stage 4a's seventeen. */
const ADDED = STYLE_PROPERTIES.slice(17);

type SetStyle = Extract<ScssOp, { op: 'setStyle' }>;

const SCSS = [
  '.hero {',
  '  padding: var(--kit-space-md);',
  '  display: grid;',
  '  align-items: start;',
  '}',
  '',
  '.card {',
  '  gap: var(--kit-space-sm);',
  '}',
  '',
].join('\n');
const TEXTS = [SCSS, SCSS.replaceAll('\n', '\r\n')];

function textOf(result: ApplyResult, where: string): string {
  if (!('text' in result)) assert.fail(`${where}: ${JSON.stringify(result)}`);
  return result.text;
}

function scssOp(op: EditOp): ScssOp {
  if (op.op !== 'setStyle' && op.op !== 'removeStyle') assert.fail(`not a style op: ${op.op}`);
  return op;
}

function tsxOp(op: EditOp): TsxOp {
  if (op.op === 'setProp' || op.op === 'removeProp') return op;
  return assert.fail(`not a prop op: ${op.op}`);
}

/** Values to try for a property: tokens and raw values, each keyword of its list, an image. */
function valuesOf(property: StyleProperty): StyleValue[] {
  const kind = kindOf(property);
  if (kind === 'keyword') return (keywordsOf(property) ?? []).map((word) => plainValue(word));
  if (kind === 'image') return [plainValue(imageUrl('hero.png'))];
  if (kind === 'color') return [{ token: '--kit-color-ink' }, { raw: '#123456' }];
  return [{ token: '--kit-space-md' }, { raw: '13px' }];
}

/** How the file spells a value, and whether it carries the off-kit marker. */
function spelled(value: StyleValue): [string, boolean] {
  if ('token' in value) return [`var(${value.token})`, false];
  return [value.raw, value.mark !== false];
}

test('every added property has values to try; a keyword or an image never has the marker', () => {
  assert.equal(ADDED.length, 21);
  for (const property of ADDED) {
    const values = valuesOf(property);
    assert.ok(values.length > 0, property);
    const kind = kindOf(property);
    if (kind === 'keyword' || kind === 'image') {
      for (const value of values) assert.equal(spelled(value)[1], false, property);
    }
  }
});

test('a new declaration of each added property, and its inverse, leave the file as it was', () => {
  let tried = 0;
  for (const text of TEXTS) {
    for (const property of ADDED) {
      for (const value of valuesOf(property)) {
        const where = `${property} ${JSON.stringify(value)}`;
        const op: SetStyle = {
          op: 'setStyle',
          id: ID,
          className: 'card',
          property,
          value,
          before: null,
          newRule: false,
        };
        const applied = textOf(applyScss(text, op, OPTIONS), where);
        const rule = readRule(applied, 'card');
        assert.ok(rule !== null && rule !== 'ambiguous', where);
        const last = rule.declarations.at(-1);
        const read = [last?.property, last?.value, last?.offKit];
        assert.deepEqual(read, [property, ...spelled(value)], where);
        assert.equal(textOf(applyScss(applied, scssOp(inverse(op)), OPTIONS), where), text, where);
        tried += 1;
      }
    }
  }
  assert.ok(tried >= 80, `only ${tried} tried`);
});

test('a new value in a declaration of each added property, and its inverse, give it back', () => {
  for (const text of TEXTS) {
    for (const property of ADDED) {
      const values = valuesOf(property);
      const [first] = values;
      if (first === undefined) continue;
      const add: SetStyle = {
        op: 'setStyle',
        id: ID,
        className: 'card',
        property,
        value: first,
        before: null,
        newRule: false,
      };
      const start = textOf(applyScss(text, add, OPTIONS), property);
      // Every other value over the first one, then back: the declaration as it was, byte for byte.
      for (const value of values.slice(1)) {
        const where: string = `${property} ${JSON.stringify(first)} to ${JSON.stringify(value)}`;
        const op: SetStyle = { ...add, value, before: first };
        const applied = textOf(applyScss(start, op, OPTIONS), where);
        assert.notEqual(applied, start, where);
        assert.equal(textOf(applyScss(applied, scssOp(inverse(op)), OPTIONS), where), start, where);
      }
    }
  }
});

test('a new rule of each added property, and its inverse, leave the file as it was', () => {
  for (const text of TEXTS) {
    for (const property of ADDED) {
      const [value] = valuesOf(property);
      if (value === undefined) continue;
      const op: ScssOp = {
        op: 'setStyle',
        id: ID,
        className: 'rt-new',
        property,
        value,
        before: null,
        newRule: true,
      };
      const applied = textOf(applyScss(text, op, OPTIONS), property);
      assert.ok(applied.startsWith(text), property);
      assert.equal(textOf(applyScss(applied, scssOp(inverse(op)), OPTIONS), property), text);
    }
  }
});

test('a keyword written by hand is replaced and put back; a foreign word is not', () => {
  for (const text of TEXTS) {
    const display: SetStyle = {
      op: 'setStyle',
      id: ID,
      className: 'hero',
      property: 'display',
      value: plainValue('flex'),
      before: plainValue('grid'),
      newRule: false,
    };
    const flex = textOf(applyScss(text, display, OPTIONS), 'display');
    assert.ok(flex.includes('  display: flex;'), flex);
    assert.equal(textOf(applyScss(flex, scssOp(inverse(display)), OPTIONS), 'back'), text);

    // `start` is no word of the list: the change to `center` is written, but its inverse would
    // write `start`, so the request answers a patch of the files instead (style-checks.ts).
    const align: SetStyle = {
      ...display,
      property: 'align-items',
      value: plainValue('center'),
      before: plainValue('start'),
    };
    const aligned = textOf(applyScss(text, align, OPTIONS), 'align');
    assert.ok(aligned.includes('  align-items: center;'), aligned);
    const undo = inverse(align);
    assert.deepEqual(applyScss(aligned, scssOp(undo), OPTIONS), { refused: 'invalid' });
  }
});

test('an image the version lacks, a marked keyword and a token keyword are refused', () => {
  const op = (property: StyleProperty, value: StyleValue): ScssOp => ({
    op: 'setStyle',
    id: ID,
    className: 'card',
    property,
    value,
    before: null,
    newRule: false,
  });
  const refused: ScssOp[] = [
    op('background-image', plainValue(imageUrl('gone.png'))),
    op('display', { raw: 'flex' }),
    op('justify-content', { token: '--kit-space-md' }),
    op('text-align', plainValue('start')),
  ];
  for (const one of refused) {
    assert.deepEqual(applyScss(SCSS, one, OPTIONS), { refused: 'invalid' }, one.property);
  }
  // Without `hasImage` nothing says the file is there.
  const image = op('background-image', plainValue(imageUrl('hero.png')));
  assert.deepEqual(applyScss(SCSS, image, { force: false }), { refused: 'invalid' });
});

// The kit prop that covers a property: Base's Stack.

const base = requireKit(createFolderKitStore(join(PLUGIN_ROOT, 'kits')), 'base');
const stack = base.kit.components.find((component) => component.name === 'Stack');
const groups = tokenGroupsOf(
  base.tokens.map((token) => ({ path: token.path.join('.'), type: token.type })),
);
const COVERED = ['flex-direction', 'flex-wrap', 'justify-content', 'align-items'] as const;

const TSX = [
  "import { Stack } from '@kit';",
  '',
  'export function Hero() {',
  '  return (',
  '    <Stack direction="row" gap="md">',
  '      <Stack>',
  '        <h1>Shop</h1>',
  '      </Stack>',
  '    </Stack>',
  '  );',
  '}',
  '',
].join('\n');

test("Stack's direction, wrap, justify and align cover the four properties", () => {
  assert.ok(stack !== undefined);
  for (const property of COVERED) {
    const found = styleSource({
      property,
      component: stack,
      written: [],
      rule: null,
      classes: [],
      format: 'scss',
      tokenGroups: groups,
    });
    assert.equal(found.kind, 'prop', property);
  }
  // Each enum value of the covering props names a keyword of its property.
  for (const [name, property] of [
    ['direction', 'flex-direction'],
    ['align', 'align-items'],
    ['justify', 'justify-content'],
  ] as const) {
    const prop: KitComponent['props'][number] | undefined = stack.props.find(
      (one) => one.name === name,
    );
    assert.ok(prop?.values !== undefined && prop.values.length > 0, name);
    for (const value of prop.values) {
      assert.ok(keywordOfWord(property, value) !== null, `${name}=${value}`);
    }
  }
});

test('each value of a covering prop, written and undone, gives the TSX back byte for byte', () => {
  assert.ok(stack !== undefined);
  let tried = 0;
  for (const text of [TSX, TSX.replaceAll('\n', '\r\n')]) {
    for (const at of openingTags(text)) {
      const tag = readTag(text, at);
      if (typeof tag === 'string' || tag.name !== 'Stack') continue;
      const last = tag.props.at(-1)?.name ?? null;
      for (const name of ['direction', 'align', 'justify', 'wrap']) {
        const def = stack.props.find((one) => one.name === name);
        const written = tag.props.find((one) => one.name === name);
        const before = written?.kind === 'literal' ? written.value : null;
        const values =
          def?.type === 'boolean'
            ? [true, false].map((value) => ({ kind: 'boolean' as const, value }))
            : (def?.values ?? []).map((value) => ({ kind: 'string' as const, value }));
        for (const value of values) {
          const same = before?.kind === value.kind && before.value === value.value;
          if (same) continue;
          const where: string = `${tag.name} at ${at} ${name}=${String(value.value)}`;
          const op: TsxOp = { op: 'setProp', id: ID, name, value, before, after: last };
          const there = textOf(applyTsx(text, at, op, KEEP), where);
          assert.notEqual(there, text, where);
          const back = textOf(applyTsx(there, at, tsxOp(inverse(op)), KEEP), `${where} (back)`);
          assert.equal(back, text, where);
          tried += 1;
        }
      }
    }
  }
  assert.ok(tried >= 20, `only ${tried} tried`);
});

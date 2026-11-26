import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  coveredAt,
  heldAt,
  sourceWords,
  wantedOp,
} from '../../../../../../client/studio/edit/props/context/context.ts';
import type { StyleContext } from '../../../../../../src/edit/index.ts';
import type { DraftOption } from '../../../../../../src/shared/values/options.ts';
import type { Inspect } from '../../../../../../src/studio/api/edit/edit-schemas.ts';

const ID = 'sections/Hero:section';
const TABLET: StyleContext = { width: 768, state: null, option: null };
const DESK: StyleContext = { width: 1280, state: null, option: null };
const HOVER: StyleContext = { width: null, state: 'hover', option: null };
const BASE: StyleContext = { width: null, state: null, option: null };
/** Plan 25: the value `dark` of the option `theme`, and the options the labels come from. */
const DARK = { id: 'theme', value: 'dark' };
const OPTIONS: DraftOption[] = [
  {
    id: 'theme',
    label: 'Theme',
    default: 'light',
    values: [
      { id: 'light', label: 'Light' },
      { id: 'dark', label: 'Dark' },
    ],
  },
];

/** An inspect answer with only the fields the rows read in a context. */
const inspect = (fields: Record<string, unknown>): Inspect =>
  ({
    id: ID,
    styles: {},
    props: [],
    overrides: [],
    scss: null,
    styleClass: null,
    ...fields,
  }) as unknown as Inspect;

const padding = (value: string, context: StyleContext = TABLET) => ({
  context,
  property: 'padding',
  value,
  offKit: false,
  utility: null,
});

test('a row holds the value set in exactly its context, else none', () => {
  const view = inspect({ overrides: [padding('24px')] });
  assert.deepEqual(heldAt([view], 'padding', TABLET), {
    held: '24px',
    offKit: false,
    mixed: false,
  });
  assert.deepEqual(heldAt([view], 'padding', DESK), { held: null, offKit: false, mixed: false });
});

test('elements that hold different values in the context show as mixed', () => {
  const one = inspect({ overrides: [padding('24px')] });
  const other = inspect({ overrides: [padding('32px')] });
  assert.equal(heldAt([one, other], 'padding', TABLET).mixed, true);
  assert.equal(heldAt([one, one], 'padding', TABLET).mixed, false);
});

test('the source line says where a value in a context comes from', () => {
  const words = (source: Parameters<typeof sourceWords>[0], context: StyleContext) =>
    sourceWords(source, context);
  const here = { kind: 'here', value: '24px', offKit: false } as const;
  assert.equal(words(here, TABLET).key, 'context.source.here');
  assert.equal(words({ kind: 'kit' }, TABLET).key, 'context.source.kit');
  const base = { kind: 'below', width: null, state: null, value: '8px' } as const;
  assert.equal(words(base, TABLET).key, 'context.source.all');
  const tablet = { kind: 'below', width: 768, state: null, value: '24px' } as const;
  assert.deepEqual(words(tablet, DESK), { key: 'context.source.up', params: { width: 768 } });
  assert.equal(words(tablet, { ...TABLET, state: 'hover' }).key, 'context.source.default');
  assert.equal(words(base, { ...BASE, state: 'active' }).key, 'context.source.default');
  const hovered = { kind: 'below', width: null, state: 'hover', value: '8px' } as const;
  assert.equal(words(hovered, { ...TABLET, state: 'hover' }).key, 'context.source.all');
  // A shorthand of the context's block holds the value (ADR 0070): the line names it.
  const part = { kind: 'here', value: '24px', offKit: false, via: 'padding' } as const;
  assert.deepEqual(words(part, TABLET), {
    key: 'context.source.shorthand',
    params: { shorthand: 'padding' },
  });
});

test("a value an option's block holds names the value, by the labels of the options row", () => {
  // Outside a page every text is its key (`texts-of.ts`), so the place shows as its key.
  const here = { kind: 'here', value: '8px', offKit: false, option: DARK } as const;
  const dark = { ...BASE, option: DARK };
  assert.deepEqual(sourceWords(here, dark, OPTIONS), {
    key: 'context.source.option',
    params: { source: 'context.source.here', option: 'Theme', value: 'Dark' },
  });
  // From the option's block of every width, at 768.
  const below = { kind: 'below', width: null, state: null, value: '8px', option: DARK } as const;
  assert.deepEqual(sourceWords(below, { ...TABLET, option: DARK }, OPTIONS).params, {
    source: 'context.source.all',
    option: 'Theme',
    value: 'Dark',
  });
  // The bar on one value, and the rule's own value of the same width shows through.
  const own = { kind: 'below', width: 768, state: null, value: '4px' } as const;
  const only = { ...TABLET, option: DARK };
  assert.deepEqual(sourceWords(own, only), { key: 'context.source.allOptions', params: {} });
  assert.equal(sourceWords(own, { ...DESK, option: DARK }).key, 'context.source.up');
  // A value the options lack is named by its ids.
  const odd = { ...here, option: { id: 'cards', value: 'filled' } };
  assert.deepEqual(sourceWords(odd, dark, OPTIONS).params, {
    source: 'context.source.here',
    option: 'cards',
    value: 'filled',
  });
});

test("a row in an option's value holds what its block sets while the page shows it", () => {
  const view = inspect({ overrides: [padding('24px', { ...BASE, option: DARK })] });
  const at = { ...BASE, option: DARK };
  const none = { held: null, offKit: false, mixed: false };
  assert.deepEqual(heldAt([view], 'padding', at, { theme: 'dark' }), {
    held: '24px',
    offKit: false,
    mixed: false,
  });
  // Not shown: the block is no value of the page.
  assert.deepEqual(heldAt([view], 'padding', at, { theme: 'light' }), none);
  assert.deepEqual(heldAt([view], 'padding', at), none);
});

test('a property a prop sets is covered in every context but the base', () => {
  const view = inspect({ styles: { color: { kind: 'prop', prop: 'tone' } } });
  assert.equal(coveredAt(view, 'color', TABLET), true);
  assert.equal(coveredAt(view, 'color', HOVER), true);
  // A prop has one value for every option too.
  assert.equal(coveredAt(view, 'color', { ...BASE, option: DARK }), true);
  assert.equal(coveredAt(view, 'color', BASE), false);
  assert.equal(coveredAt(inspect({}), 'color', TABLET), false);
});

test('a pick on a covered property is the edit Claude is asked for, in its context', () => {
  const view = inspect({
    scss: { file: 'src/scss/sections/Hero.module.scss', rule: null, declarations: [] },
    styleClass: { className: 'hero' },
  });
  assert.deepEqual(wantedOp(view, 'color', { token: '--kit-color-ink' }, TABLET), {
    op: 'setStyle',
    id: ID,
    className: 'hero',
    property: 'color',
    value: { token: '--kit-color-ink' },
    before: null,
    newRule: true,
    context: TABLET,
    newBlock: true,
  });
  assert.equal(wantedOp(inspect({}), 'color', { raw: 'red' }, TABLET), null);
});

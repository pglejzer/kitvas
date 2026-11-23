import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contrast,
  hueBucket,
  isNeutral,
  kitComponentOf,
  PLACEHOLDER_FIX,
  PLACEHOLDER_REVIEW,
  parseColour,
  ruleFinding,
  sectionKey,
  stateKind,
  usageAt,
} from '../../../src/checks/index.ts';
import { node, page, visit } from './facts.ts';

test('colours are read from #rgb, #rrggbb and #rrggbbaa only', () => {
  assert.deepEqual(parseColour('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColour('#0f7a52'), { r: 15, g: 122, b: 82, a: 1 });
  assert.deepEqual(parseColour('#00000080'), { r: 0, g: 0, b: 0, a: 128 / 255 });
  assert.equal(parseColour('red'), null);
  assert.equal(parseColour(''), null);
});

test('contrast follows WCAG and lays translucent colours down first', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff') * 10) / 10, 21);
  assert.equal(Math.round(contrast('#767676', '#ffffff') * 100) / 100, 4.54);
  // Half-black text on white is a mid grey: about 4.
  assert.equal(Math.round(contrast('#00000080', '#ffffffff') * 100) / 100, 4);
  // A transparent background is white.
  assert.equal(Math.round(contrast('#000000ff', '#00000000') * 10) / 10, 21);
  assert.equal(contrast('nope', '#ffffff'), 1);
});

test('greys are neutral and colours fall in 15 degree hue buckets', () => {
  assert.equal(isNeutral('#ffffff'), true);
  assert.equal(isNeutral('#f3f4f6'), true);
  assert.equal(isNeutral('#1a1a1a'), true);
  assert.equal(isNeutral('#0f7a52'), false);
  assert.equal(hueBucket('#0f7a52'), 10);
  assert.equal(hueBucket('#ff0000'), 0);
  assert.equal(hueBucket('#808080'), null);
});

test('a finding at a node gets its element, place, state and width', () => {
  const input = visit(page([node({ ks: 'sections/Hero:section/h1' })]), {
    seen: {
      ids: [
        {
          id: 'sections/Hero:section/h1',
          file: 'src/tsx/sections/Hero.tsx',
          line: 4,
          column: 7,
          tag: 'h1',
        },
      ],
    },
  });
  const message = { key: 'checkRule.x', params: {} };
  const hint = { key: 'checkHint.x', params: {} };
  assert.deepEqual(
    ruleFinding(input, { rule: 'ui/line-length', severity: 'fix', node: 0, message, hint }),
    {
      check: 'ui',
      rule: 'ui/line-length',
      severity: 'fix',
      file: 'src/tsx/sections/Hero.tsx',
      line: 4,
      column: 7,
      element: 'sections/Hero:section/h1',
      message,
      hint,
      states: ['filled'],
      widths: [390],
    },
  );
  const pageLevel = ruleFinding(input, {
    rule: 'ui/wireframe',
    severity: 'review',
    node: null,
    message,
    hint,
  });
  assert.equal(pageLevel.element, null);
  assert.equal(pageLevel.file, null);
});

test('a node inside a kit component becomes review with the kitInternal hint, unless kept', () => {
  const ks = 'sections/Hero:section/Button';
  const input = visit(page([node({ ks }), node({ ks: null })]), {
    seen: { components: new Map([[ks, 'Button']]) },
    report: { usage: [{ id: ks, component: 'Button', props: { variant: 'solid' } }] },
  });
  const at = {
    rule: 'a11y/control-contrast',
    severity: 'fix' as const,
    node: 0,
    message: { key: 'checkRule.x', params: {} },
    hint: { key: 'checkHint.x', params: {} },
  };
  assert.equal(kitComponentOf(input, 0), 'Button');
  assert.equal(kitComponentOf(input, 1), null);
  const inside = ruleFinding(input, at);
  assert.equal(inside.severity, 'review');
  assert.deepEqual(inside.hint, { key: 'checkHint.kitInternal', params: { component: 'Button' } });
  const kept = ruleFinding(input, { ...at, kit: 'keep' });
  assert.equal(kept.severity, 'fix');
  assert.deepEqual(kept.hint, at.hint);
  assert.deepEqual(usageAt(input, ks)?.props, { variant: 'solid' });
  assert.equal(usageAt(input, 'nope'), undefined);
});

test('sections, state kinds and placeholder copy', () => {
  assert.equal(sectionKey('sections/Form:Card/form/Stack'), 'sections/Form');
  assert.equal(sectionKey('root'), null);
  assert.equal(sectionKey(null), null);
  assert.equal(stateKind('filled', 'filled'), 'baseline');
  assert.equal(stateKind('empty', 'filled'), 'empty');
  assert.equal(stateKind('loading-more', 'filled'), 'loading');
  assert.equal(stateKind('error-network', 'filled'), 'error');
  assert.equal(stateKind('errors', 'filled'), 'other');
  assert.equal(stateKind('success', 'filled'), 'other');
  assert.ok(PLACEHOLDER_FIX.test('Lorem ipsum dolor sit amet'));
  assert.ok(PLACEHOLDER_FIX.test('TODO: real copy'));
  assert.ok(!PLACEHOLDER_FIX.test('Today'));
  assert.ok(PLACEHOLDER_REVIEW.test('Feature one'));
  assert.ok(PLACEHOLDER_REVIEW.test('Item 3'));
  assert.ok(!PLACEHOLDER_REVIEW.test('Title of your bakery'));
});

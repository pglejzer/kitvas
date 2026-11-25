// The Kit lens's pins (plan 19, task 2): texts, keys, the cut, the nearest token and `null`.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_PIN_CODE,
  MAX_PIN_KEY,
  MAX_PIN_TEXT,
} from '../../../../../client/channel/lens-protocol.ts';
import { text } from '../../../../../client/studio/edit/texts.ts';
import { kitPins } from '../../../../../client/studio/lens/pins/kit.ts';
import type { TokenOption } from '../../../../../src/edit/index.ts';
import type { KitLens } from '../../../../../src/studio/api/edit/kit-lens-schemas.ts';

const TOKENS: TokenOption[] = [
  { var: '--kit-space-md', path: 'space.md', type: 'dimension', css: '12px' },
  { var: '--kit-space-lg', path: 'space.lg', type: 'dimension', css: '16px' },
  { var: '--kit-color-ink', path: 'color.ink', type: 'color', css: '#1a1a1a' },
];

const element = (
  id: string,
  parts: Partial<KitLens['elements'][number]> = {},
): KitLens['elements'][number] => ({ id, spacing: [], offKit: [], suggest: null, ...parts });

test('no report gives no pins', () => {
  assert.deepEqual(kitPins(null, TOKENS), []);
  assert.deepEqual(kitPins({ version: 1, elements: [] }, TOKENS), []);
});

test('a spacing token is a plain pin with the property as its code', () => {
  const report: KitLens = {
    version: 1,
    elements: [
      element('s:section/Stack', {
        spacing: [
          { property: 'gap', token: 'space-md', value: '12px' },
          { property: 'padding', token: 'space-lg', value: '16px' },
        ],
      }),
    ],
  };
  assert.deepEqual(kitPins(report, TOKENS), [
    {
      key: 'kit:s:section/Stack:gap',
      id: 's:section/Stack',
      kind: 'kit',
      tone: 'plain',
      code: 'gap',
      text: 'space-md · 12',
    },
    {
      key: 'kit:s:section/Stack:padding',
      id: 's:section/Stack',
      kind: 'kit',
      tone: 'plain',
      code: 'padding',
      text: 'space-lg · 16',
    },
  ]);
});

test('one off-kit pin an element: a single value names its nearest token, several list their values', () => {
  const report: KitLens = {
    version: 1,
    elements: [
      element('a', {
        offKit: [
          { property: 'background-color', value: '#1a73e8' },
          { property: 'padding', value: '13px' },
        ],
      }),
      element('b', { offKit: [{ property: 'background-color', value: '#1a73e8' }] }),
    ],
  };
  const pins = kitPins(report, TOKENS);
  assert.equal(pins.length, 2);
  const [both, one] = pins;
  assert.equal(both?.tone, 'review');
  assert.equal(both?.text, `${text('lens.kit.off')}: #1a73e8, 13px`);
  assert.equal(one?.text, `${text('lens.kit.off')}: #1a73e8 · ${text('lens.kit.nearest')} ink`);
  const padding = kitPins(
    { version: 1, elements: [element('c', { offKit: [{ property: 'padding', value: '13px' }] })] },
    TOKENS,
  );
  assert.equal(padding[0]?.text, `${text('lens.kit.off')}: 13px · ${text('lens.kit.nearest')} md`);
  const bare = kitPins(report, []);
  assert.equal(bare[1]?.text, `${text('lens.kit.off')}: #1a73e8`);
  assert.equal(bare[1]?.code, undefined);
});

test('a size the kit has no scale for is not off the kit, and a scale of another kind is no nearest', () => {
  const report: KitLens = {
    version: 1,
    elements: [
      element('card', {
        offKit: [
          { property: 'border-width', value: '1px' },
          { property: 'width', value: '340px' },
        ],
      }),
    ],
  };
  // TOKENS have spaces and a colour, no border widths and no sizes: nothing to miss.
  assert.deepEqual(kitPins(report, TOKENS), []);
  const borders: TokenOption[] = [
    ...TOKENS,
    { var: '--kit-border-thin', path: 'border.thin', type: 'dimension', css: '1px' },
  ];
  const [pin, ...rest] = kitPins(
    {
      version: 1,
      elements: [element('card', { offKit: [{ property: 'border-width', value: '2px' }] })],
    },
    borders,
  );
  assert.equal(pin?.text, `${text('lens.kit.off')}: 2px · ${text('lens.kit.nearest')} thin`);
  assert.deepEqual(rest, []);
});

test('a suggestion is a plain pin', () => {
  const [pin] = kitPins({ version: 1, elements: [element('x', { suggest: 'Button' })] }, TOKENS);
  assert.equal(pin?.tone, 'plain');
  assert.equal(pin?.kind, 'kit');
  assert.equal(pin?.text, `${text('lens.kit.could')} Button`);
});

test('keys are unique and stable; texts, codes and keys keep their limits', () => {
  const long = `s:section/${'Stack/'.repeat(30)}Card`;
  const report: KitLens = {
    version: 1,
    elements: [
      element('a', {
        spacing: [{ property: 'gap', token: 'space-md', value: '12px' }],
        offKit: [
          { property: 'padding', value: '1px' },
          { property: 'padding-top', value: '2px' },
        ],
        suggest: 'Button',
      }),
      element(long, {
        offKit: [{ property: 'color', value: '#'.padEnd(120, 'f') }],
        suggest: 'C'.repeat(80),
      }),
      element(`${long}x`, { suggest: 'C'.repeat(80) }),
    ],
  };
  const pins = kitPins(report, TOKENS);
  assert.deepEqual(pins, kitPins(report, TOKENS));
  assert.equal(new Set(pins.map((pin) => pin.key)).size, pins.length);
  for (const pin of pins) {
    assert.ok(pin.text.length <= MAX_PIN_TEXT);
    assert.ok(pin.key.length <= MAX_PIN_KEY);
    assert.ok((pin.code ?? '').length <= MAX_PIN_CODE);
  }
  // Three of the first element (one spacing, one off kit, one suggestion), two of the long one, one of the last.
  assert.equal(pins.length, 6);
});

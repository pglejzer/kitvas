// The link the box model opens on (ADR 0070): what the element's class rule says of a layer's
// sides, read here as the server reads a shorthand, so the two cannot drift apart.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkOfSides, ruleLink } from '../../../../../client/studio/edit/props/box.ts';
import { splitShorthand } from '../../../../../src/edit/domain/style/shorthand.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';

type Layer = 'padding' | 'margin';

/** An inspect answer with only what the box reads: the sources and the rule's declarations. */
const inspect = (styles: Record<string, unknown>, declarations: unknown[]): Inspect =>
  ({
    id: 'sections/Hero:section',
    styles,
    scss: { declarations, nested: [] },
  }) as unknown as Inspect;

/** An element whose rule says `<layer>: <value>`, each side as the server reads it from there. */
function boxed(layer: Layer, value: string): Inspect {
  const held = splitShorthand(layer, value, () => null) ?? {};
  const styles: Record<string, unknown> = {
    [layer]: { kind: 'scss', className: 'card', value, offKit: false },
  };
  for (const [property, part] of Object.entries(held)) {
    styles[property] = { kind: 'scss', className: 'card', value: part, offKit: false, via: layer };
  }
  return inspect(styles, [{ property: layer, value, offKit: false }]);
}

/** An element whose rule declares the properties themselves, no shorthand. */
function declared(values: Record<string, string>): Inspect {
  const declarations = Object.entries(values).map(([property, value]) => ({
    property,
    value,
    offKit: false,
  }));
  return inspect({}, declarations);
}

test('one value opens the box on all sides, two on the pairs, three or four on one side', () => {
  assert.equal(ruleLink(boxed('padding', '8px'), 'padding'), 'all');
  assert.equal(ruleLink(boxed('padding', 'var(--kit-space-md)'), 'padding'), 'all');
  assert.equal(ruleLink(boxed('padding', '8px 16px'), 'padding'), 'pair');
  assert.equal(ruleLink(boxed('margin', '0 auto'), 'margin'), 'pair');
  assert.equal(ruleLink(boxed('padding', '8px 16px 4px'), 'padding'), 'one');
  assert.equal(ruleLink(boxed('padding', '8px 16px 4px 2px'), 'padding'), 'one');
  // A value written longer than it has to be opens on what it comes to.
  assert.equal(ruleLink(boxed('padding', '8px 8px'), 'padding'), 'all');
  assert.equal(ruleLink(boxed('padding', '8px 16px 8px 16px'), 'padding'), 'pair');
});

test('a layer the rule does not set leaves the link as it is', () => {
  assert.equal(ruleLink(boxed('padding', '8px'), 'margin'), null);
  assert.equal(ruleLink(declared({ gap: '8px' }), 'padding'), null);
  assert.equal(ruleLink(inspect({}, []), 'margin'), null);
});

test('a value that does not split is still the whole layer', () => {
  // `$pad` is not read: no side comes from it, and an edit replaces the declaration.
  assert.equal(ruleLink(boxed('padding', '$pad'), 'padding'), 'all');
  assert.equal(ruleLink(boxed('margin', '0 auto !important'), 'margin'), 'all');
});

test('sides declared on their own open on the pair they make, or on one side', () => {
  const block = declared({ 'padding-top': '8px', 'padding-bottom': '8px' });
  assert.equal(ruleLink(block, 'padding'), 'pair');
  assert.equal(ruleLink(declared({ 'padding-top': '8px' }), 'padding'), 'one');
  const uneven = declared({ 'margin-left': '8px', 'margin-right': '4px' });
  assert.equal(ruleLink(uneven, 'margin'), 'one');
  const four = declared({
    'margin-top': '0',
    'margin-right': '0',
    'margin-bottom': '0',
    'margin-left': '0',
  });
  assert.equal(ruleLink(four, 'margin'), 'all');
});

test('the link follows the values of the four sides', () => {
  const none = { top: null, right: null, bottom: null, left: null };
  assert.equal(linkOfSides(none, false), null);
  assert.equal(linkOfSides(none, true), 'all');
  const same = { top: '8px', right: '8px', bottom: '8px', left: '8px' };
  assert.equal(linkOfSides(same, true), 'all');
  assert.equal(linkOfSides({ ...same, left: '4px', right: '4px' }, true), 'pair');
  assert.equal(linkOfSides({ ...same, left: '4px' }, true), 'one');
  // Three sides set alike are no four: the fourth is the kit's.
  assert.equal(linkOfSides({ ...same, left: null }, false), 'one');
});

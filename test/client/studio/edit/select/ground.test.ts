import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Chosen } from '../../../../../client/studio/edit/select/copies.ts';
import { groundSelection } from '../../../../../client/studio/edit/select/ground.ts';

const CARD = 'sections/Pricing:section/Stack/Card';
const ONE: Chosen = { selection: [CARD], copies: [{ id: CARD, item: 2, path: [2] }] };
const PLAIN = { shiftKey: false, ctrlKey: false, metaKey: false };

/** An element of the canvas as a click's target: its own `data-canvas`. */
const part = (canvas?: string): unknown => ({ dataset: canvas === undefined ? {} : { canvas } });
/** A click that began and ended on the same element. */
const on = (target: unknown): { press: unknown; target: unknown } => ({ press: target, target });

test('a click on the ground of the canvas clears the selection, as a click on empty page does', () => {
  for (const ground of ['scroll', 'sizer', 'world']) {
    assert.deepEqual(groundSelection(ONE, on(part(ground)), PLAIN), { selection: [], copies: [] });
  }
  // Pressed in a gap between two cards, let go beside them: both are the ground.
  const across = { press: part('world'), target: part('sizer') };
  assert.deepEqual(groundSelection(ONE, across, PLAIN), { selection: [], copies: [] });
});

test('with the add key held the selection stays, as it does inside a frame', () => {
  for (const key of ['shiftKey', 'ctrlKey', 'metaKey']) {
    assert.equal(groundSelection(ONE, on(part('world')), { ...PLAIN, [key]: true }), ONE);
  }
});

test('a click on a card, a handle or anything else of the canvas is no click on the ground', () => {
  for (const target of [part('handle'), part('shield'), part(), null, 'text', {}]) {
    assert.equal(groundSelection(ONE, on(target), PLAIN), null);
  }
});

test('a drag that began on a width handle and ended on the ground keeps the selection', () => {
  // The browser names the common parent of the press and the release as the click's target.
  assert.equal(groundSelection(ONE, { press: part('handle'), target: part('world') }, PLAIN), null);
  assert.equal(groundSelection(ONE, { press: null, target: part('scroll') }, PLAIN), null);
});

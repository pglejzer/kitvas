import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpening } from '../../../../client/studio/draft/opening.ts';

/** An opening that counts how often the screen was shown. */
function counted(): { opening: ReturnType<typeof createOpening>; shown: () => number } {
  let shown = 0;
  const opening = createOpening(() => {
    shown += 1;
  });
  return { opening, shown: () => shown };
}

test('a page that waits for nothing shows as soon as its script has run', () => {
  const { opening, shown } = counted();
  assert.equal(shown(), 0, 'not before every part had its say');
  opening.start();
  assert.equal(shown(), 1);
});

test('the screen shows when the last part it waits for is there, not before', () => {
  const { opening, shown } = counted();
  const frame = opening.hold();
  const tree = opening.hold();
  opening.start();
  assert.equal(shown(), 0);
  frame();
  assert.equal(shown(), 0, 'the Layers tree is still on its way');
  tree();
  assert.equal(shown(), 1);
});

test('a part that is there before the script has finished does not show the screen early', () => {
  const { opening, shown } = counted();
  // A frame that loaded before the page script answers at once; the canvas is not placed yet.
  opening.hold()();
  assert.equal(shown(), 0);
  opening.start();
  assert.equal(shown(), 1);
});

test('the screen shows once, whatever is said again afterwards', () => {
  const { opening, shown } = counted();
  const frame = opening.hold();
  opening.start();
  frame();
  // A frame says `ready` again after every build; a second `start` is as harmless.
  frame();
  opening.start();
  assert.equal(shown(), 1);
  // A part that lets go twice does not let go for another one.
  const other = counted();
  const first = other.opening.hold();
  other.opening.hold();
  first();
  first();
  other.opening.start();
  assert.equal(other.shown(), 0);
});

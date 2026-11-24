import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type CommandButton, commandOf } from '../../../../client/studio/ui/copy.ts';

/** A button inside a `.k-cmd` whose `code` holds `text`. */
function buttonIn(text: string | null, withBox = true): CommandButton {
  return {
    closest: (selector) =>
      withBox && selector === '.k-cmd'
        ? { querySelector: (inner) => (inner === 'code' ? { textContent: text } : null) }
        : null,
  };
}

test('the button copies the text of the command beside it', () => {
  assert.equal(commandOf(buttonIn('kitvas studio')), 'kitvas studio');
  assert.equal(commandOf(buttonIn('  /kitvas:compose \n')), '/kitvas:compose');
});

test('a button with no command beside it copies nothing', () => {
  assert.equal(commandOf(buttonIn('')), undefined);
  assert.equal(commandOf(buttonIn('   ')), undefined);
  assert.equal(commandOf(buttonIn(null)), undefined);
  assert.equal(commandOf(buttonIn('kitvas studio', false)), undefined);
});

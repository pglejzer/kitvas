import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SIZE, parseFrameMessage } from '../../../client/channel/protocol.ts';
import {
  chosenExample,
  exampleHeight,
  exampleMark,
  startExample,
} from '../../../client/frame/example.ts';

const KEYS = ['Button.1', 'Button.2', 'Dialog.1'];

/**
 * Starts the example runtime on a page that is not framed (no channel in the hash) and returns
 * what it left on `<html data-example>` and the keys it rendered.
 */
function startOn(search: string, renders: boolean): { mark: string | undefined; asked: string[] } {
  const scope = globalThis as unknown as Record<string, unknown>;
  const before = { location: scope.location, document: scope.document };
  const dataset: Record<string, string> = {};
  const asked: string[] = [];
  scope.location = { search, hash: '' };
  scope.document = { documentElement: { dataset } };
  try {
    startExample({
      keys: KEYS,
      render(key) {
        asked.push(key);
        return renders;
      },
    });
  } finally {
    scope.location = before.location;
    scope.document = before.document;
  }
  return { mark: dataset.example, asked };
}

test('the page is marked with what happened to its example, without a studio around it', () => {
  assert.equal(exampleMark(true), 'shown');
  assert.equal(exampleMark(false), 'failed');
  assert.deepEqual(startOn('?example=Button.2', true), { mark: 'shown', asked: ['Button.2'] });
  assert.deepEqual(startOn('?example=Button.2', false), { mark: 'failed', asked: ['Button.2'] });
  // An example the bundle does not hold is never rendered, and that is a failure too.
  assert.deepEqual(startOn('?example=Nope.1', true), { mark: 'failed', asked: [] });
  assert.deepEqual(startOn('', true), { mark: 'failed', asked: [] });
});

test('the example in the address is chosen when the bundle holds it', () => {
  assert.equal(chosenExample('?example=Button.2', KEYS), 'Button.2');
  assert.equal(chosenExample('?example=Dialog.1&state=x', KEYS), 'Dialog.1');
  assert.equal(chosenExample(`?example=${encodeURIComponent('Button.1')}`, KEYS), 'Button.1');
  assert.equal(chosenExample('?example=Button%2E1', KEYS), 'Button.1');
});

test('any other address chooses nothing', () => {
  const others = [
    '',
    '?',
    '?state=filled',
    '?example=',
    '?example=Button.3',
    '?example=button.1',
    '?example=Button.1%20',
    '?Example=Button.1',
    // The first value counts, and it is not one of the keys.
    '?example=Nope.1&example=Button.1',
  ];
  for (const search of others) assert.equal(chosenExample(search, KEYS), undefined, search);
  assert.equal(chosenExample('?example=Button.1', []), undefined, 'an empty bundle');
});

test('the height is the bottom of the body when nothing reaches below it', () => {
  assert.equal(exampleHeight(96, [{ bottom: 40 }, { bottom: 88 }], 0), 96);
  assert.equal(exampleHeight(64.2, [], 0), 65);
});

test('a box outside the flow keeps the gap below it; flow boxes stay inside the body', () => {
  // Body 72 px with 16 px padding: a button ending at 56 needs nothing more.
  assert.equal(exampleHeight(72, [{ bottom: 56 }], 0, 16), 72);
  // A modal dialog from 16 to 180 px: the frame grows to 196.
  assert.equal(exampleHeight(32, [{ bottom: 180 }], 0, 16), 196);
  assert.equal(exampleHeight(32, [{ bottom: 180 }], 0, Number.NaN), 180);
  assert.equal(exampleHeight(32, [{ bottom: 180 }], 0, -4), 180);
});

test('a box that reaches lower sets the height, in page coordinates and whole pixels', () => {
  assert.equal(exampleHeight(96, [{ bottom: 40 }, { bottom: 320.1 }, { bottom: 200 }], 0), 321);
  // Scrolled by 100: a box whose bottom is 150 in the viewport ends at 250 on the page.
  assert.equal(exampleHeight(200, [{ bottom: 150 }], 100), 250);
  assert.equal(exampleHeight(200, [{ bottom: 50 }], 100), 200);
});

test('values that are no finite number are skipped, and the height stays in range', () => {
  const odd = [{ bottom: Number.NaN }, { bottom: Number.POSITIVE_INFINITY }, { bottom: 12 }];
  assert.equal(exampleHeight(80, odd, 0), 80);
  assert.equal(exampleHeight(Number.NaN, [{ bottom: 30 }], 0), 30);
  assert.equal(exampleHeight(80, [{ bottom: 120 }], Number.NaN), 120);
  assert.equal(exampleHeight(-5, [{ bottom: -20 }], 0), 0);
  assert.equal(exampleHeight(2 * MAX_SIZE, [], 0), MAX_SIZE);
  assert.equal(exampleHeight(10, [{ bottom: 3 * MAX_SIZE }], 0), MAX_SIZE);
});

test('every box of a generator is read once', () => {
  let read = 0;
  function* boxes(): Generator<{ bottom: number }> {
    for (const bottom of [10, 500, 30]) {
      read += 1;
      yield { bottom };
    }
  }
  assert.equal(exampleHeight(0, boxes(), 0), 500);
  assert.equal(read, 3);
});

test('every height the frame reports is one the kit page accepts', () => {
  const heights = [
    exampleHeight(96, [], 0),
    exampleHeight(Number.NaN, [{ bottom: Number.NaN }], Number.NaN),
    exampleHeight(-1, [], 0),
    exampleHeight(5 * MAX_SIZE, [], 0),
  ];
  for (const height of heights) {
    for (const shown of [true, false]) {
      const message = { kitvas: 1, channel: 'abcdefghijklmnop', type: 'example', shown, height };
      assert.ok(parseFrameMessage(message, 'abcdefghijklmnop'), `${height} ${shown}`);
    }
  }
});

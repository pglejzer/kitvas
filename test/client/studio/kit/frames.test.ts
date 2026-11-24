import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clampHeight,
  type ExampleFrame,
  exampleReport,
  MAX_HEIGHT,
  MIN_HEIGHT,
} from '../../../../client/studio/kit/frames.ts';

const BUTTON = 'abcdefghijklmnop';
const DIALOG = 'ponmlkjihgfedcba';

/** Stand-ins for the frames' windows: the checks only compare them. */
const buttonWindow = { name: 'button' };
const dialogWindow = { name: 'dialog' };
const pageWindow = { name: 'page' };

/** A frame whose window can change, as an iframe's does when it loads another page. */
type Host = { contentWindow: unknown };

const frame = (key: string, channel: string, contentWindow: unknown): ExampleFrame<Host> => ({
  key,
  channel,
  element: { contentWindow },
});

const frames = (): ExampleFrame<Host>[] => [
  frame('Button.1', BUTTON, buttonWindow),
  frame('Dialog.1', DIALOG, dialogWindow),
];

const example = (channel: string, fields: Record<string, unknown> = {}) => ({
  kitvas: 1,
  channel,
  type: 'example',
  shown: true,
  height: 240,
  ...fields,
});

/** A message as a sandboxed frame sends it: origin `'null'`. */
const from = (source: unknown, data: unknown, origin = 'null') => ({ origin, source, data });

test('heights are whole pixels between the limits', () => {
  assert.equal(MIN_HEIGHT, 48);
  assert.equal(MAX_HEIGHT, 1200);
  assert.equal(clampHeight(240), 240);
  assert.equal(clampHeight(240.2), 241);
  assert.equal(clampHeight(48), 48);
  assert.equal(clampHeight(1200), 1200);
  assert.equal(clampHeight(0), 48);
  assert.equal(clampHeight(47.5), 48);
  assert.equal(clampHeight(1200.5), 1200);
  assert.equal(clampHeight(1e6), 1200);
});

test('a shown example sizes its own frame, within the limits', () => {
  const list = frames();
  const report = exampleReport(list, from(buttonWindow, example(BUTTON)));
  assert.deepEqual(report, { frame: list[0], shown: true, height: 240 });
  const tall = exampleReport(list, from(dialogWindow, example(DIALOG, { height: 5000 })));
  assert.deepEqual(tall, { frame: list[1], shown: true, height: MAX_HEIGHT });
  const short = exampleReport(list, from(dialogWindow, example(DIALOG, { height: 3 })));
  assert.deepEqual(short, { frame: list[1], shown: true, height: MIN_HEIGHT });
});

test('an example that was not shown hides its own frame, whatever height it sends', () => {
  const list = frames();
  const data = example(DIALOG, { shown: false, height: 900 });
  assert.deepEqual(exampleReport(list, from(dialogWindow, data)), {
    frame: list[1],
    shown: false,
  });
});

test('only the window of a frame of the page, from the opaque origin, is heard', () => {
  const list = frames();
  const refused: [string, ReturnType<typeof from>][] = [
    ['the prototype origin', from(buttonWindow, example(BUTTON), 'http://127.0.0.1:4100')],
    ['the studio origin', from(buttonWindow, example(BUTTON), 'http://127.0.0.1:4000')],
    ['an empty origin', from(buttonWindow, example(BUTTON), '')],
    ['no source', from(null, example(BUTTON))],
    ['an undefined source', from(undefined, example(BUTTON))],
    ['a window that is no frame of the page', from(pageWindow, example(BUTTON))],
    ['a window with a stolen channel', from(dialogWindow, example(BUTTON))],
    ['a frame on another channel', from(buttonWindow, example(DIALOG))],
  ];
  for (const [name, event] of refused) assert.equal(exampleReport(list, event), undefined, name);
  assert.equal(exampleReport([], from(buttonWindow, example(BUTTON))), undefined, 'no frames');
});

test('only an example the protocol accepts is heard', () => {
  const list = frames();
  const refused: [string, unknown][] = [
    ['ready', { kitvas: 1, channel: BUTTON, type: 'ready', state: 'filled' }],
    ['shown', { kitvas: 1, channel: BUTTON, type: 'shown', state: 'filled' }],
    ['elements', { kitvas: 1, channel: BUTTON, type: 'elements', request: 1, items: [] }],
    ['shown as text', example(BUTTON, { shown: 'yes' })],
    ['a negative height', example(BUTTON, { height: -1 })],
    ['a height as text', example(BUTTON, { height: '100px' })],
    ['an endless height', example(BUTTON, { height: Number.POSITIVE_INFINITY })],
    ['kitvas 2', example(BUTTON, { kitvas: 2 })],
    ['markup', '<p>hello</p>'],
    ['null', null],
  ];
  for (const [name, data] of refused) {
    assert.equal(exampleReport(list, from(buttonWindow, data)), undefined, name);
  }
});

test("a frame's window is read when the message comes, not when the page started", () => {
  const list = frames();
  const button = list[0];
  assert.ok(button);
  const next = { name: 'button, next page' };
  button.element.contentWindow = next;
  assert.equal(exampleReport(list, from(buttonWindow, example(BUTTON))), undefined);
  assert.equal(exampleReport(list, from(next, example(BUTTON)))?.frame, button);
});

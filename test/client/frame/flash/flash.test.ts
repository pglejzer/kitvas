import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flashIds, MAX_FLASH, parseStudioMessage } from '../../../../client/channel/protocol.ts';
import { FLASH_MS, FLASH_REACH, FLASH_SHEET } from '../../../../client/frame/flash/flash.ts';
import { SCALES } from '../../../../src/studio/theme/tokens.ts';

const CHANNEL = 'abcdefghijklmnop';

const flash = (ids: unknown) => ({ kitvas: 1, channel: CHANNEL, type: 'flash', ids });

test('a frame takes a flash for elements by id, and only its known fields', () => {
  const ids = ['sections/Hero:section/Button.2', 'index:Hero'];
  assert.deepEqual(parseStudioMessage({ ...flash(ids), colour: 'red' }, CHANNEL), {
    kitvas: 1,
    channel: CHANNEL,
    type: 'flash',
    ids,
  });
  assert.ok(parseStudioMessage(flash([]), CHANNEL));
  const most = Array.from({ length: MAX_FLASH }, (_, index) => `index:Hero/p.${index}`);
  assert.ok(parseStudioMessage(flash(most), CHANNEL));
});

test('a frame refuses a flash it cannot trust', () => {
  const refused: [string, unknown][] = [
    ['ids that are no list', flash('index:Hero')],
    ['no ids', { kitvas: 1, channel: CHANNEL, type: 'flash' }],
    ['an id that is no text', flash(['index:Hero', 7])],
    ['an id that could end a selector', flash(['index:Hero"] *'])],
    ['an empty id', flash([''])],
    ['more ids than one flash names', flash(Array.from({ length: MAX_FLASH + 1 }, () => 'a'))],
  ];
  for (const [name, data] of refused) {
    assert.equal(parseStudioMessage(data, CHANNEL), undefined, name);
  }
});

test('a flash names each element once, and no more than a frame takes', () => {
  assert.deepEqual(flashIds(['a', 'b', 'a']), ['a', 'b']);
  const many = Array.from({ length: MAX_FLASH + 9 }, (_, index) => `e${index}`);
  const named = flashIds(many);
  assert.equal(named.length, MAX_FLASH);
  assert.ok(parseStudioMessage(flash(named), CHANNEL));
  assert.deepEqual(flashIds([]), []);
});

test("the ring shows for the studio's flash time", () => {
  assert.equal(`${FLASH_MS}ms`, SCALES.motion.flash);
  assert.ok(FLASH_SHEET.includes(`animation: flash ${FLASH_MS}ms ease-out`));
  assert.ok(FLASH_SHEET.includes(`0 0 0 ${FLASH_REACH}px transparent`));
});

test('the ring takes the studio selection colour, or the system one until the studio says it', () => {
  const colours = FLASH_SHEET.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi) ?? [];
  assert.deepEqual(colours, []);
  for (const use of FLASH_SHEET.matchAll(/var\(([^)]*)\)/g)) {
    assert.equal(use[1], '--kv-select, Highlight');
  }
  assert.ok(FLASH_SHEET.includes('var(--kv-select, Highlight)'));
});

test('under reduced motion and forced colours the ring shows still', () => {
  assert.match(
    FLASH_SHEET,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.ring \{ animation: none; outline-color: var\(--kv-select, Highlight\); \}/,
  );
  assert.match(
    FLASH_SHEET,
    /@media \(forced-colors: active\) \{\s*\.ring \{ animation: none; outline-color: Highlight; \}/,
  );
});

test('the ring never takes the pointer', () => {
  assert.ok(FLASH_SHEET.includes('pointer-events: none'));
});

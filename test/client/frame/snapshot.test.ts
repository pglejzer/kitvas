import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_ITEMS,
  MAX_STYLE,
  MAX_TEXT,
  parseFrameMessage,
} from '../../../client/channel/protocol.ts';
import {
  cut,
  type RawElement,
  STYLE_PROPERTIES,
  snapshotSize,
  snapshotStyle,
  snapshotText,
  takeSnapshots,
  toSnapshot,
} from '../../../client/frame/snapshot.ts';

const raw = (fields: Partial<RawElement> = {}): RawElement => ({
  id: 'sections/Hero:section/h1',
  width: 320.26,
  height: 48,
  text: '  Shop\n\t now  ',
  read: (name) => (name === 'color' ? ' rgb(29, 32, 37) ' : 'x'),
  ...fields,
});

test('text is trimmed, white space runs become one space, and it is cut to the limit', () => {
  assert.equal(snapshotText('  Shop\n\t now   open  '), 'Shop now open');
  assert.equal(snapshotText(null), '');
  assert.equal(snapshotText('   '), '');
  assert.equal(snapshotText('x'.repeat(MAX_TEXT + 50)).length, MAX_TEXT);
});

test('a cut never splits a surrogate pair', () => {
  const smile = '\u{1F600}';
  assert.equal(cut(`ab${smile}`, 3), 'ab');
  assert.equal(cut(`ab${smile}`, 4), `ab${smile}`);
  assert.equal(cut(`a${smile}`, 3), `a${smile}`);
  assert.equal(snapshotText(`${'x'.repeat(MAX_TEXT - 1)}${smile}`), 'x'.repeat(MAX_TEXT - 1));
  assert.equal(cut('abc', 0), '');
});

test('style lists the fixed properties as name:value; in their order', () => {
  const style = snapshotStyle((name) => (name === 'padding' ? ' 8px 16px ' : `<${name}>`));
  assert.equal(style.split(';').length - 1, STYLE_PROPERTIES.length);
  assert.ok(style.startsWith('color:<color>;background-color:<background-color>;font-size:'));
  assert.ok(style.includes(';padding:8px 16px;margin:<margin>;'));
  assert.ok(style.endsWith('display:<display>;opacity:<opacity>;'));
});

test('style is cut to the limit', () => {
  const style = snapshotStyle(() => 'v'.repeat(100));
  assert.equal(style.length, MAX_STYLE);
  assert.ok(style.startsWith(`color:${'v'.repeat(100)};background-color:`));
});

test('sizes are rounded to half a pixel and kept in range', () => {
  assert.equal(snapshotSize(10.24), 10);
  assert.equal(snapshotSize(10.26), 10.5);
  assert.equal(snapshotSize(10.75), 11);
  assert.equal(snapshotSize(0), 0);
  assert.equal(snapshotSize(-3), 0);
  assert.equal(snapshotSize(Number.NaN), 0);
  assert.equal(snapshotSize(Number.POSITIVE_INFINITY), 0);
  assert.equal(snapshotSize(2e6), 1e6);
});

test('a snapshot carries the trimmed values the protocol accepts', () => {
  const item = toSnapshot(raw());
  assert.ok(item);
  assert.equal(item.id, 'sections/Hero:section/h1');
  assert.equal(item.width, 320.5);
  assert.equal(item.height, 48);
  assert.equal(item.text, 'Shop now');
  assert.ok(item.style.startsWith('color:rgb(29, 32, 37);background-color:x;'));
  const message = { kitvas: 1, channel: 'c', type: 'elements', request: 1, items: [item] };
  assert.ok(parseFrameMessage(message, 'c'));
});

test('an element with an id the studio would refuse is left out', () => {
  assert.equal(toSnapshot(raw({ id: '' })), undefined);
  assert.equal(toSnapshot(raw({ id: 'index:Hero main' })), undefined);
  assert.equal(toSnapshot(raw({ id: 'a'.repeat(201) })), undefined);
  const items = takeSnapshots([raw({ id: 'a:b' }), raw({ id: 'bad id' }), raw({ id: 'c:d' })]);
  assert.deepEqual(
    items.map((item) => item.id),
    ['a:b', 'c:d'],
  );
});

test('at most MAX_ITEMS snapshots, and nothing past them is read', () => {
  let pulled = 0;
  function* many(): Generator<RawElement> {
    for (let index = 0; index < MAX_ITEMS + 500; index += 1) {
      pulled += 1;
      yield raw({ id: index === 3 ? 'bad id' : `index:li.${index}` });
    }
  }
  const items = takeSnapshots(many());
  assert.equal(items.length, MAX_ITEMS);
  assert.equal(pulled, MAX_ITEMS + 1);
  assert.equal(items[0]?.id, 'index:li.0');
  assert.equal(items[3]?.id, 'index:li.4');
});

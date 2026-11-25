import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EditorContext } from '../../../../../client/studio/edit/context.ts';
import {
  cardOf,
  passRelease,
  releaseBody,
} from '../../../../../client/studio/edit/select/release.ts';
import type { Frame } from '../../../../../client/studio/frames.ts';

/** A card whose element sits at `left`, `top` on the page. */
function card(left: number, top: number): Frame {
  const element = { getBoundingClientRect: () => ({ left, top }) };
  return { element, channel: `c${left}` } as unknown as Frame;
}

function contextOf(cards: Frame[], zoom: number): EditorContext {
  const partial = { bridge: { frames: () => cards }, store: { get: () => ({ zoom }) } };
  return partial as unknown as EditorContext;
}

const AT = { x: 150, y: 90, shift: false, alt: false };

test('the card is the one whose own element was hit', () => {
  const first = card(100, 40);
  const second = card(600, 40);
  assert.equal(cardOf([first, second], second.element), second);
  assert.equal(cardOf([first, second], {}), undefined);
  assert.equal(cardOf([first, second], null), undefined);
});

test('the release is in the pixels of the frame, with the keys held', () => {
  assert.deepEqual(releaseBody(AT, { left: 100, top: 40 }, 1), {
    type: 'release',
    x: 50,
    y: 50,
    shift: false,
    alt: false,
  });
  assert.deepEqual(releaseBody({ ...AT, shift: true, alt: true }, { left: 100, top: 40 }, 0.5), {
    type: 'release',
    x: 100,
    y: 100,
    shift: true,
    alt: true,
  });
});

test('a release over a card goes to that card alone', () => {
  const first = card(100, 40);
  const second = card(600, 40);
  const sent: { to: Frame; x: number; y: number }[] = [];
  const hit = passRelease(
    contextOf([first, second], 1),
    second.element,
    { ...AT, x: 650 },
    (to, body) => sent.push({ to, x: body.x, y: body.y }),
  );
  assert.equal(hit, second);
  assert.deepEqual(sent, [{ to: second, x: 50, y: 50 }]);
});

test('a release anywhere else on the page is not passed on', () => {
  const sent: Frame[] = [];
  const hit = passRelease(contextOf([card(100, 40)], 1), { tagName: 'BUTTON' }, AT, (to) =>
    sent.push(to),
  );
  assert.equal(hit, undefined);
  assert.equal(sent.length, 0);
});

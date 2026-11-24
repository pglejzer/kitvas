import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EditStudioBody } from '../../../../../client/channel/edit-protocol.ts';
import type { EditorContext } from '../../../../../client/studio/edit/context.ts';
import {
  cardUnder,
  forwardDrag,
  toFramePoint,
} from '../../../../../client/studio/edit/select/forward.ts';
import type { Frame } from '../../../../../client/studio/frames.ts';

const FRAME = { left: 100, top: 40 };

test('a page point becomes a frame point at 100 %', () => {
  assert.deepEqual(toFramePoint({ x: 150, y: 90 }, FRAME, 1), { x: 50, y: 50 });
});

test('at 50 % the frame is drawn half size, so distances double', () => {
  assert.deepEqual(toFramePoint({ x: 150, y: 90 }, FRAME, 0.5), { x: 100, y: 100 });
});

test('at 200 % distances halve', () => {
  assert.deepEqual(toFramePoint({ x: 300, y: 140 }, FRAME, 2), { x: 100, y: 50 });
});

test('a point left of or above the frame is negative, not clamped', () => {
  assert.deepEqual(toFramePoint({ x: 90, y: 30 }, FRAME, 1), { x: -10, y: -10 });
});

/** A context with the pieces `forwardDrag` reads: the frame element's box, the zoom, the bridge. */
function contextAt(zoom: number, sent: EditStudioBody[]): EditorContext {
  const element = { getBoundingClientRect: () => ({ left: 100, top: 40 }) };
  const partial = {
    bridge: { frame: { element }, send: (body: EditStudioBody) => sent.push(body) },
    store: { get: () => ({ zoom }) },
  };
  return partial as unknown as EditorContext;
}

test('forwardDrag sends the source on start only', () => {
  const sent: EditStudioBody[] = [];
  const ctx = contextAt(0.5, sent);
  const source = { kind: 'insert', label: 'Button' } as const;
  forwardDrag(ctx, 'start', { x: 150, y: 90 }, source);
  forwardDrag(ctx, 'move', { x: 160, y: 90 }, source);
  assert.deepEqual(sent, [
    { type: 'drag', phase: 'start', source, x: 100, y: 100 },
    { type: 'drag', phase: 'move', source: null, x: 120, y: 100 },
  ]);
});

type Posted = { channel: string; type: string; phase?: string; x?: number; source?: unknown };

/** A card at `left`, 200 px wide and tall, whose window keeps what it was sent. */
function cardAtLeft(name: string, left: number): { frame: Frame; posted: Posted[] } {
  const posted: Posted[] = [];
  const element = {
    getBoundingClientRect: () => ({ left, top: 0, right: left + 200, bottom: 200 }),
    contentWindow: { postMessage: (message: Posted) => posted.push(message) },
  };
  const frame: Frame = {
    role: 'current',
    channel: name.repeat(20),
    element: element as unknown as HTMLIFrameElement,
    ready: true,
  };
  return { frame, posted };
}

test('the card under the pointer takes the drag; between cards it stays where it was', () => {
  const phone = cardAtLeft('p', 0);
  const tablet = cardAtLeft('t', 300);
  const cards = [phone.frame, tablet.frame];
  assert.equal(cardUnder(cards, { x: 350, y: 10 }, phone.frame), tablet.frame);
  assert.equal(cardUnder(cards, { x: 250, y: 10 }, tablet.frame), tablet.frame);
  assert.equal(cardUnder([phone.frame], { x: 350, y: 10 }, phone.frame), phone.frame);
});

test('a drag into another card ends in the card it leaves and starts again in the next', () => {
  const phone = cardAtLeft('p', 0);
  const tablet = cardAtLeft('t', 300);
  const sent: EditStudioBody[] = [];
  const bridge = {
    frame: phone.frame,
    frames: () => [phone.frame, tablet.frame],
    send: (body: EditStudioBody) => sent.push(body),
  };
  const ctx = { bridge, store: { get: () => ({ zoom: 1 }) } } as unknown as EditorContext;
  const source = { kind: 'insert', label: 'Button' } as const;
  forwardDrag(ctx, 'start', { x: 50, y: 10 }, source);
  forwardDrag(ctx, 'move', { x: 350, y: 10 });
  forwardDrag(ctx, 'end', { x: 360, y: 10 });
  assert.deepEqual(
    sent.map((body) => (body.type === 'drag' ? body.phase : body.type)),
    ['start', 'cancel'],
    'the edit card hears the start and the cancel',
  );
  assert.deepEqual(
    tablet.posted.map((message) => [message.phase, message.x]),
    [
      ['start', 50],
      ['move', 50],
      ['end', 60],
    ],
  );
  assert.deepEqual(tablet.posted[0]?.source, source, 'the new card gets what is carried');
  assert.equal(tablet.posted[0]?.channel, tablet.frame.channel);
});

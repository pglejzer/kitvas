import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EditStudioBody } from '../../../client/channel/edit-protocol.ts';
import type { EditorContext } from '../../../client/studio/edit/context.ts';
import { forwardDrag, toFramePoint } from '../../../client/studio/edit/forward.ts';

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

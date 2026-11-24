import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromChannel } from '../../../../client/studio/ui/frame-tones.ts';

// A frame that loaded before the page's script says `ready` to nobody, and stops saying it once
// the page speaks to it. So the tones go out at a frame's first word of any kind, as long as it is
// a word of the studio's protocol on that frame's own channel.

test('a word of any type on the frame’s own channel counts; another channel or shape does not', () => {
  const channel = 'c'.repeat(22);
  assert.ok(fromChannel({ kitvas: 1, channel, type: 'ready', state: 'filled' }, channel));
  // An editor's or a canvas's message: its type is not one the base parser knows.
  assert.ok(fromChannel({ kitvas: 1, channel, type: 'tree', nodes: [] }, channel));
  assert.ok(!fromChannel({ kitvas: 1, channel: 'x'.repeat(22), type: 'ready' }, channel));
  assert.ok(!fromChannel({ kitvas: 2, channel, type: 'ready' }, channel));
  assert.ok(!fromChannel({ channel, type: 'ready' }, channel));
  for (const other of [null, undefined, 'ready', 7, [], {}]) {
    assert.ok(!fromChannel(other, channel));
  }
});

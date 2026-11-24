import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EditFrameMessage } from '../../../client/channel/edit-protocol.ts';
import { createCardList } from '../../../client/studio/canvas/card-list.ts';
import { createBridge, heardFrom, targetsOf } from '../../../client/studio/edit/bridge.ts';
import type { Frame } from '../../../client/studio/frames.ts';

type Posted = { channel: string; type: string; [key: string]: unknown };

/** A card's frame whose window keeps what the page posted to it. */
function card(name: string, width: number): { frame: Frame; posted: Posted[] } {
  const posted: Posted[] = [];
  const element = {
    width: String(width),
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

/** Three cards: the phone is the width shown. */
function setup() {
  const phone = card('p', 390);
  const tablet = card('t', 768);
  const desk = card('d', 1280);
  const list = createCardList(phone.frame);
  list.add(tablet.frame);
  list.add(desk.frame);
  const bridge = createBridge(phone.frame, list);
  return { phone, tablet, desk, list, bridge };
}

const types = (posted: Posted[]): string[] => posted.map((message) => message.type);

test('the selection, edit mode, the tree and the structure go to every card', () => {
  const { phone, tablet, desk, bridge } = setup();
  bridge.send({ type: 'edit', on: true });
  bridge.send({ type: 'select', ids: ['sections/Hero:h1'] });
  bridge.send({ type: 'tree', request: bridge.nextRequest() });
  bridge.send({ type: 'hide', ids: [] });
  for (const one of [phone, tablet, desk]) {
    assert.deepEqual(types(one.posted), ['edit', 'select', 'tree', 'hide']);
  }
  assert.equal(tablet.posted[1]?.channel, tablet.frame.channel, 'each on its own channel');
});

test('inspect and an inline text edit go to the edit card only', () => {
  const { phone, tablet, list, bridge } = setup();
  bridge.send({ type: 'inspect', request: 1, id: 'sections/Hero:h1' });
  list.setEdit(tablet.frame);
  bridge.send({ type: 'edit-text', id: 'sections/Hero:h1' });
  assert.deepEqual(types(phone.posted), ['inspect']);
  assert.deepEqual(types(tablet.posted), ['edit-text']);
  assert.equal(bridge.frame, tablet.frame, 'the bridge frame is the edit card');
});

test('a pick in another card makes it the edit card before the panels hear it', () => {
  const { tablet, bridge } = setup();
  const heard: { type: string; edit: Frame }[] = [];
  bridge.on((message) => heard.push({ type: message.type, edit: bridge.frame }));
  const pick: EditFrameMessage = {
    kitvas: 1,
    channel: tablet.frame.channel,
    type: 'pick',
    id: 'sections/Hero:h1',
    add: false,
    double: false,
  };
  bridge.receive(pick);
  assert.deepEqual(heard, [{ type: 'pick', edit: tablet.frame }]);
  assert.equal(bridge.frames()[0], tablet.frame, 'the edit card comes first');
});

test('answers come from the edit card only; hovers and keys from any card', () => {
  const { phone, desk } = setup();
  const list = createCardList(phone.frame);
  list.add(desk.frame);
  const of = (type: EditFrameMessage['type'], frame: Frame) =>
    heardFrom({ type, channel: frame.channel }, list);
  assert.equal(of('tree', desk.frame).heard, false);
  assert.equal(of('inspected', desk.frame).heard, false);
  assert.equal(of('text', desk.frame).heard, false);
  assert.equal(of('tree', phone.frame).heard, true);
  assert.equal(of('hovered', desk.frame).heard, true);
  assert.equal(of('key', desk.frame).heard, true);
  for (const gesture of ['pick', 'rect', 'menu', 'drop', 'handle'] as const) {
    const said = of(gesture, desk.frame);
    assert.equal(said.edit, desk.frame, gesture);
    assert.equal(said.heard, true, gesture);
  }
});

test('a preview goes to the cards from the context width up; taking it back goes to all', () => {
  const { phone, tablet, desk, list } = setup();
  const preview = { type: 'preview' as const, changes: [] };
  assert.deepEqual(targetsOf(preview, list, 768), [tablet.frame, desk.frame]);
  assert.deepEqual(targetsOf(preview, list, null), [phone.frame, tablet.frame, desk.frame]);
  assert.deepEqual(targetsOf(preview, list, 1280), [desk.frame]);
  assert.equal(targetsOf({ type: 'unpreview' }, list, 1280).length, 3);
});

test('the bridge sends previews where the context set by the bar applies', () => {
  const { phone, tablet, desk, bridge } = setup();
  bridge.setPreviewWidth?.(768);
  bridge.send({ type: 'preview', changes: [] });
  assert.deepEqual(
    [phone, tablet, desk].map((one) => one.posted.length),
    [0, 1, 1],
  );
  bridge.sendPreview?.([], 1280);
  assert.deepEqual(
    [phone, tablet, desk].map((one) => one.posted.length),
    [0, 1, 2],
  );
});

test('a forced state goes to every card, or to the one named', () => {
  const { phone, tablet, desk, bridge } = setup();
  bridge.sendLive({ type: 'force', ids: ['sections/Hero:a'], state: 'hover' });
  for (const one of [phone, tablet, desk]) assert.deepEqual(types(one.posted), ['force']);
  bridge.sendLive({ type: 'a11y', request: 1, id: 'sections/Hero:a' }, tablet.frame);
  assert.deepEqual(types(tablet.posted), ['force', 'a11y']);
  assert.deepEqual(types(desk.posted), ['force']);
});

test('a flash goes to every card, each element once, and nothing when none is named', () => {
  const { phone, tablet, desk, bridge } = setup();
  bridge.flash?.([]);
  for (const one of [phone, tablet, desk]) assert.deepEqual(one.posted, []);
  bridge.flash?.(['sections/Hero:a', 'sections/Hero:b', 'sections/Hero:a']);
  for (const one of [phone, tablet, desk]) {
    assert.deepEqual(one.posted, [
      {
        kitvas: 1,
        channel: one.frame.channel,
        type: 'flash',
        ids: ['sections/Hero:a', 'sections/Hero:b'],
      },
    ]);
  }
});

test('without cards the bridge is the one frame, as before', () => {
  const alone = card('x', 390);
  const bridge = createBridge(alone.frame);
  bridge.send({ type: 'select', ids: [] });
  bridge.send({ type: 'inspect', request: 1, id: 'sections/Hero:a' });
  assert.deepEqual(types(alone.posted), ['select', 'inspect']);
  assert.deepEqual(bridge.frames(), [alone.frame]);
});

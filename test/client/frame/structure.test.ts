import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EditStudioMessage } from '../../../client/channel/edit-protocol.ts';
import type {
  FrameEntry,
  ScaleStep,
  StructureFrameMessage,
} from '../../../client/channel/structure-protocol.ts';
import type { Drag } from '../../../client/frame/drag.ts';
import type { Handles } from '../../../client/frame/handles.ts';
import { hideCss, lockCss } from '../../../client/frame/hide.ts';
import {
  createStructure,
  type MenuEvent,
  type StructureParts,
} from '../../../client/frame/structure.ts';

const head = { kitvas: 1 as const, channel: 'c1' };

const entry = (id: string): FrameEntry => ({
  id,
  movable: true,
  accepts: true,
  mixed: false,
  interactive: false,
  root: null,
});
const step = (name: string, px: number): ScaleStep => ({ name, var: `--kit-space-${name}`, px });

type Calls = {
  log: string[];
  posted: StructureFrameMessage[];
  entries: () => ReadonlyMap<string, FrameEntry>;
  selection: () => readonly string[];
  scales: () => { space: readonly ScaleStep[]; size: readonly ScaleStep[] };
  menu: ((event: MenuEvent) => void) | undefined;
  structure: ReturnType<typeof createStructure>;
};

function setup(): Calls {
  const calls = { log: [] as string[] } as Calls;
  calls.posted = [];
  const drag: Drag = {
    enable: (on) => calls.log.push(`drag.enable ${on}`),
    forward: (message) => calls.log.push(`drag.forward ${message.phase}`),
  };
  const handles: Handles = {
    enable: (on) => calls.log.push(`handles.enable ${on}`),
    show: (id) => calls.log.push(`handles.show ${id}`),
  };
  const parts: StructureParts = {
    drag: (input) => {
      calls.entries = input.entries;
      calls.selection = input.selection;
      return drag;
    },
    handles: (scales) => {
      calls.scales = scales;
      return handles;
    },
    hide: {
      set: (ids) => calls.log.push(`hide ${ids.join(',')}`),
      lock: (ids) => calls.log.push(`lock ${ids.join(',')}`),
    },
    idOf: (target) => (typeof target === 'string' ? target : null),
  };
  calls.structure = createStructure({
    channel: 'c1',
    post: (message) => calls.posted.push(message),
    parts,
    listener: {
      add: (handler) => {
        calls.menu = handler;
      },
      remove: (handler) => {
        if (calls.menu === handler) calls.menu = undefined;
      },
    },
  });
  return calls;
}

const send = (calls: Calls, message: EditStudioMessage): void => calls.structure.handle(message);

test('hiding writes one rule per id and none for no ids', () => {
  assert.equal(hideCss([]), '');
  assert.equal(
    hideCss(['sections/Hero:section/h1', 'sections/Hero:section/p.2']),
    '[data-ks="sections/Hero:section/h1"]{display:none!important}\n' +
      '[data-ks="sections/Hero:section/p.2"]{display:none!important}',
  );
  // An id that should never get here still cannot leave the quotes.
  assert.equal(hideCss(['a"]{x']), '[data-ks="a\\"\\]\\{x"]{display:none!important}');
});

test('a hide message goes to hiding, in edit mode or not', () => {
  const calls = setup();
  send(calls, { ...head, type: 'hide', ids: ['a', 'b'] });
  assert.deepEqual(calls.log, ['hide a,b']);
});

test('locks apply while editing only: kept from a message, lifted in Preview', () => {
  const calls = setup();
  send(calls, { ...head, type: 'lock', ids: ['a'] });
  assert.deepEqual(calls.log, []);
  send(calls, { ...head, type: 'edit', on: true });
  assert.equal(calls.log[0], 'lock a');
  calls.log.length = 0;
  send(calls, { ...head, type: 'lock', ids: ['a', 'b'] });
  assert.deepEqual(calls.log, ['lock a,b']);
  calls.log.length = 0;
  send(calls, { ...head, type: 'edit', on: false });
  assert.equal(calls.log[0], 'lock ');
});

test('edit mode turns the drag on and off and listens for the context menu', () => {
  const calls = setup();
  send(calls, { ...head, type: 'edit', on: true });
  assert.deepEqual(calls.log, [
    'lock ',
    'drag.enable true',
    'handles.enable false',
    'handles.show null',
  ]);
  assert.ok(calls.menu);
  calls.log.length = 0;
  send(calls, { ...head, type: 'edit', on: false });
  assert.deepEqual(calls.log.slice(0, 2), ['lock ', 'drag.enable false']);
  assert.equal(calls.menu, undefined);
});

test('the drag reads the latest entries and selection', () => {
  const calls = setup();
  send(calls, { ...head, type: 'edit', on: true });
  send(calls, { ...head, type: 'structure', entries: [entry('a'), entry('b')] });
  send(calls, { ...head, type: 'select', ids: ['b'] });
  assert.deepEqual([...calls.entries().keys()], ['a', 'b']);
  assert.deepEqual(calls.selection(), ['b']);
});

test('the scales from tokens reach the handles', () => {
  const calls = setup();
  send(calls, { ...head, type: 'edit', on: true });
  send(calls, { ...head, type: 'tokens', space: [step('2', 8)], size: [step('10', 160)] });
  assert.deepEqual(calls.scales().space, [step('2', 8)]);
  assert.deepEqual(calls.scales().size, [step('10', 160)]);
});

test('handles show on a single selected element when the page asks for them', () => {
  const calls = setup();
  send(calls, { ...head, type: 'edit', on: true });
  send(calls, { ...head, type: 'handles', on: true });
  calls.log.length = 0;
  send(calls, { ...head, type: 'select', ids: ['a'] });
  assert.deepEqual(calls.log, ['handles.enable true', 'handles.show a']);
  calls.log.length = 0;
  send(calls, { ...head, type: 'select', ids: ['a', 'b'] });
  assert.deepEqual(calls.log, ['handles.enable true', 'handles.show null']);
  calls.log.length = 0;
  send(calls, { ...head, type: 'handles', on: false });
  assert.deepEqual(calls.log, ['handles.enable false', 'handles.show null']);
});

test('a forwarded drag goes to the drag only in edit mode', () => {
  const calls = setup();
  const move: EditStudioMessage = {
    ...head,
    type: 'drag',
    phase: 'move',
    source: null,
    x: 1,
    y: 2,
  };
  send(calls, move);
  assert.deepEqual(calls.log, []);
  send(calls, { ...head, type: 'edit', on: true });
  calls.log.length = 0;
  send(calls, move);
  assert.deepEqual(calls.log, ['drag.forward move']);
});

test('a context menu in edit mode posts the element under it and is not shown by the page', () => {
  const calls = setup();
  send(calls, { ...head, type: 'edit', on: true });
  let prevented = 0;
  const handler = calls.menu;
  assert.ok(handler);
  const prevent = (): void => {
    prevented++;
  };
  handler({
    target: 'sections/Hero:section/h1',
    clientX: 10,
    clientY: 20,
    preventDefault: prevent,
  });
  handler({ target: null, clientX: 3, clientY: 4, preventDefault: prevent });
  assert.equal(prevented, 2);
  assert.deepEqual(calls.posted, [
    { ...head, type: 'menu', id: 'sections/Hero:section/h1', x: 10, y: 20 },
    { ...head, type: 'menu', id: null, x: 3, y: 4 },
  ]);
});

test('turning edit mode off drops the selection and removes the handles', () => {
  const calls = setup();
  send(calls, { ...head, type: 'edit', on: true });
  send(calls, { ...head, type: 'handles', on: true });
  send(calls, { ...head, type: 'select', ids: ['a'] });
  calls.log.length = 0;
  send(calls, { ...head, type: 'edit', on: false });
  assert.deepEqual(calls.log, [
    'lock ',
    'drag.enable false',
    'handles.enable false',
    'handles.show null',
  ]);
  assert.deepEqual(calls.selection(), []);
});

test('a locked element and everything in it take no pointer; none locked writes nothing', () => {
  assert.equal(lockCss([]), '');
  assert.equal(
    lockCss(['sections/Hero:section/h1']),
    '[data-ks="sections/Hero:section/h1"],[data-ks="sections/Hero:section/h1"] *{pointer-events:none!important}',
  );
});

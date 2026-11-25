import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  EditFrameMessage,
  EditStudioMessage,
} from '../../../../client/channel/edit-protocol.ts';
import type { FrameEntry, ScaleStep } from '../../../../client/channel/structure-protocol.ts';
import type { Drag } from '../../../../client/frame/drag/drag.ts';
import type { Handles } from '../../../../client/frame/drag/handles.ts';
import { hideCss, lockCss } from '../../../../client/frame/edit/hide.ts';
import {
  createStructure,
  type MenuEvent,
  type StructureParts,
} from '../../../../client/frame/edit/structure.ts';

const head = { kitvas: 1 as const, channel: 'c1' };

const entry = (id: string): FrameEntry => ({
  id,
  movable: true,
  lists: [],
  item: false,
  accepts: true,
  mixed: false,
  interactive: false,
  root: null,
});
const step = (name: string, px: number): ScaleStep => ({ name, var: `--kit-space-${name}`, px });
/** A `handles` message for an element that takes every handle. */
const open = { blocked: [], stepped: [] };

type Calls = {
  log: string[];
  posted: EditFrameMessage[];
  entries: () => ReadonlyMap<string, FrameEntry>;
  selection: () => readonly string[];
  locked: () => readonly string[];
  /** What the drag tells the structure: it began (`true`) or ended. */
  quiet: (on: boolean) => void;
  /** What the structure passes on of a drag that began or ended. */
  quieted: boolean[];
  scales: () => { space: readonly ScaleStep[]; size: readonly ScaleStep[] };
  menu: ((event: MenuEvent) => void) | undefined;
  structure: ReturnType<typeof createStructure>;
};

function setup(): Calls {
  const calls = { log: [] as string[] } as Calls;
  calls.posted = [];
  calls.quieted = [];
  const drag: Drag = {
    enable: (on) => calls.log.push(`drag.enable ${on}`),
    forward: (message) => calls.log.push(`drag.forward ${message.phase}`),
    released: (point) => calls.log.push(`drag.released ${point.x},${point.y}`),
    scale: (value) => calls.log.push(`drag.scale ${value}`),
    swapped: () => calls.log.push('drag.swapped'),
  };
  const handles: Handles = {
    enable: (on) => calls.log.push(`handles.enable ${on}`),
    // The copy the handles sit on is named after the id, when the page chose one.
    show: (id, item) => {
      calls.log.push(item === undefined ? `handles.show ${id}` : `handles.show ${id} #${item}`);
    },
    scale: (value) => calls.log.push(`handles.scale ${value}`),
    limit: (blocked, stepped) =>
      calls.log.push(`handles.limit ${blocked.join(',')}|${stepped.join(',')}`),
    released: (point, shift, alt) =>
      calls.log.push(`handles.released ${point.x},${point.y} ${shift} ${alt}`),
  };
  const parts: StructureParts = {
    drag: (input) => {
      calls.entries = input.entries;
      calls.selection = input.selection;
      calls.locked = input.locked;
      calls.quiet = input.quiet;
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
    under: (target) =>
      target === 'row' ? { item: 2, path: [2], box: { x: 1, y: 2, width: 30, height: 40 } } : {},
  };
  calls.structure = createStructure({
    channel: 'c1',
    post: (message) => calls.posted.push(message),
    parts,
    quiet: (on) => calls.quieted.push(on),
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
  // The drag reads them too: a rectangle takes nothing that is locked.
  assert.deepEqual(calls.locked(), ['a', 'b']);
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
  send(calls, { ...head, type: 'handles', on: true, ...open });
  calls.log.length = 0;
  send(calls, { ...head, type: 'select', ids: ['a'] });
  assert.deepEqual(calls.log, ['handles.enable true', 'handles.show a']);
  calls.log.length = 0;
  send(calls, { ...head, type: 'select', ids: ['a', 'b'] });
  assert.deepEqual(calls.log, ['handles.enable true', 'handles.show null']);
  calls.log.length = 0;
  send(calls, { ...head, type: 'handles', on: false, ...open });
  assert.deepEqual(calls.log, ['handles.limit |', 'handles.enable false', 'handles.show null']);
});

test('the handles sit on the one copy the page chose, and on none when it chose several', () => {
  const calls = setup();
  send(calls, { ...head, type: 'edit', on: true });
  send(calls, { ...head, type: 'handles', on: true, ...open });
  calls.log.length = 0;
  send(calls, { ...head, type: 'select', ids: ['a'], copies: [{ id: 'a', item: 2 }] });
  assert.deepEqual(calls.log, ['handles.enable true', 'handles.show a #2']);
  calls.log.length = 0;
  // Three copies of one id are three elements: no handles, as for three ids.
  const copies = [0, 1, 2].map((item) => ({ id: 'a', item }));
  send(calls, { ...head, type: 'select', ids: ['a'], copies });
  assert.deepEqual(calls.log, ['handles.enable true', 'handles.show null']);
  calls.log.length = 0;
  // A select without copies forgets the ones before it.
  send(calls, { ...head, type: 'select', ids: ['a'] });
  assert.deepEqual(calls.log, ['handles.enable true', 'handles.show a']);
});

test('while a drag runs the handles are off the page, and what else is drawn hears of it', () => {
  const calls = setup();
  send(calls, { ...head, type: 'edit', on: true });
  send(calls, { ...head, type: 'handles', on: true, ...open });
  send(calls, { ...head, type: 'select', ids: ['a'] });
  calls.log.length = 0;
  calls.quiet(true);
  assert.deepEqual(calls.log, ['handles.enable true', 'handles.show null']);
  assert.deepEqual(calls.quieted, [true]);
  // The drag picks the element it takes: the selection it brings still shows no handles.
  calls.log.length = 0;
  send(calls, { ...head, type: 'select', ids: ['b'] });
  assert.deepEqual(calls.log, ['handles.enable true', 'handles.show null']);
  calls.log.length = 0;
  calls.quiet(false);
  assert.deepEqual(calls.log, ['handles.enable true', 'handles.show b']);
  assert.deepEqual(calls.quieted, [true, false]);
});

test('a drag that ends after edit mode went off places no handles', () => {
  const calls = setup();
  send(calls, { ...head, type: 'edit', on: true });
  calls.quiet(true);
  send(calls, { ...head, type: 'edit', on: false });
  calls.log.length = 0;
  calls.quiet(false);
  assert.deepEqual(calls.log, []);
  assert.deepEqual(calls.quieted, [true, false]);
});

test('a build taken in place reaches the drag, for its log', () => {
  const calls = setup();
  calls.structure.swapped();
  assert.deepEqual(calls.log, ['drag.swapped']);
});

test('the handles hear what the element cannot take before they are placed', () => {
  const calls = setup();
  send(calls, { ...head, type: 'edit', on: true });
  send(calls, { ...head, type: 'select', ids: ['a'] });
  calls.log.length = 0;
  const limits = { blocked: ['width', 'height'], stepped: ['gap'] };
  send(calls, { ...head, type: 'handles', on: true, ...limits });
  assert.deepEqual(calls.log, [
    'handles.limit width,height|gap',
    'handles.enable true',
    'handles.show a',
  ]);
});

test('the canvas zoom reaches the drag and the handles as one scale', () => {
  const calls = setup();
  calls.structure.scale(1 / 0.5);
  assert.deepEqual(calls.log, ['drag.scale 2', 'handles.scale 2']);
  // Nothing a size can be multiplied by: no zoom at all.
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    calls.log.length = 0;
    calls.structure.scale(bad);
    assert.deepEqual(calls.log, ['drag.scale 1', 'handles.scale 1'], `scale ${bad}`);
  }
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

test('a release the page heard ends a handle and a drag, in edit mode only', () => {
  const calls = setup();
  const release: EditStudioMessage = {
    ...head,
    type: 'release',
    x: 40,
    y: 60,
    shift: true,
    alt: false,
  };
  send(calls, release);
  assert.deepEqual(calls.log, []);
  send(calls, { ...head, type: 'edit', on: true });
  calls.log.length = 0;
  send(calls, release);
  assert.deepEqual(calls.log, ['handles.released 40,60 true false', 'drag.released 40,60']);
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

test('a context menu names the copy and the box under it when the frame finds them', () => {
  const calls = setup();
  send(calls, { ...head, type: 'edit', on: true });
  const handler = calls.menu;
  assert.ok(handler);
  handler({ target: 'row', clientX: 5, clientY: 6, preventDefault: () => undefined });
  assert.deepEqual(calls.posted, [
    {
      ...head,
      type: 'menu',
      id: 'row',
      x: 5,
      y: 6,
      item: 2,
      path: [2],
      box: { x: 1, y: 2, width: 30, height: 40 },
    },
  ]);
});

test('turning edit mode off drops the selection and removes the handles', () => {
  const calls = setup();
  send(calls, { ...head, type: 'edit', on: true });
  send(calls, { ...head, type: 'handles', on: true, ...open });
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

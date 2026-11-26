import assert from 'node:assert/strict';
import { test } from 'node:test';
import { watchOutside } from '../../../../../../client/studio/edit/props/custom/outside.ts';
import {
  blurVerdict,
  insideAny,
  pressVerdict,
} from '../../../../../../client/studio/edit/props/custom/outside-rule.ts';

type Fake = { id: string; contains(node: unknown): boolean };

/** A node that holds itself and the nodes made under it. */
function node(id: string, ...under: Fake[]): Fake {
  const self: Fake = {
    id,
    contains: (other) => other === self || under.some((child) => child.contains(other)),
  };
  return self;
}

/** An event source with the two calls the watch uses, and a way to fire an event at it. */
function source() {
  const heard = new Map<string, Set<EventListener>>();
  return {
    addEventListener(type: string, listener: EventListener): void {
      const set = heard.get(type) ?? new Set<EventListener>();
      set.add(listener);
      heard.set(type, set);
    },
    removeEventListener(type: string, listener: EventListener): void {
      heard.get(type)?.delete(listener);
    },
    count: (): number => [...heard.values()].reduce((sum, set) => sum + set.size, 0),
    types: (): string[] => [...heard.entries()].filter(([, set]) => set.size > 0).map(([t]) => t),
    fire(type: string, event: object): void {
      for (const listener of [...(heard.get(type) ?? [])]) listener(event as Event);
    },
  };
}

/** One open editor in a row, a press target in another row, and a list popup on the body. */
function setup(options: { busy?: () => boolean } = {}) {
  const field = node('field');
  const rootNode = node('editor', field);
  const opener = node('opener');
  const rowNode = node('row', rootNode, opener);
  const other = node('other-row-control');
  const state = { connected: true };
  const editorRoot = Object.defineProperties(rootNode, {
    closest: { value: (selector: string) => (selector === '.k-row' ? rowNode : null) },
    isConnected: { get: () => state.connected },
  });
  const doc = source();
  const win = source();
  let closed = 0;
  const frames: (() => void)[] = [];
  const watch = watchOutside({
    editor: { root: editorRoot as unknown as HTMLElement, busy: options.busy ?? (() => false) },
    close: () => {
      closed += 1;
    },
    doc,
    win,
    later: (fn) => frames.push(fn),
  });
  const press = (target: unknown): { stopped: number } => {
    const spy = { stopped: 0 };
    doc.fire('pointerdown', {
      target,
      preventDefault: () => (spy.stopped += 1),
      stopPropagation: () => (spy.stopped += 1),
    });
    return spy;
  };
  return {
    watch,
    doc,
    win,
    field,
    opener,
    other,
    state,
    frames,
    press,
    closed: () => closed,
    popup: { closest: (selector: string) => (selector === '.k-select-list' ? {} : null) },
  };
}

test('rule: a press closes unless it is inside or the eyedropper is picking', () => {
  assert.equal(pressVerdict({ inside: false, picking: false }), 'close');
  assert.equal(pressVerdict({ inside: true, picking: false }), 'keep');
  assert.equal(pressVerdict({ inside: false, picking: true }), 'keep');
  assert.equal(blurVerdict({ picking: false }), 'close');
  assert.equal(blurVerdict({ picking: true }), 'keep');
});

test('rule: inside is a node held by a part; nothing, or a gone part, holds nothing', () => {
  const part = node('part', node('child'));
  assert.equal(insideAny(part, [null, part]), true);
  assert.equal(insideAny(node('x'), [part, null]), false);
  assert.equal(insideAny(null, [part]), false);
});

test('1: a press outside the editor and its row closes it, once', () => {
  const t = setup();
  t.watch.sync(true);
  t.press(t.other);
  assert.equal(t.closed(), 1);
  // The watch stopped itself: a second press asks nothing.
  t.press(t.other);
  assert.equal(t.closed(), 1);
  assert.equal(t.doc.count() + t.win.count(), 0);
});

test('1: a press on the editor, its row, the opener and a list popup keeps it open', () => {
  const t = setup();
  t.watch.sync(true);
  t.press(t.field);
  t.press(t.opener);
  t.press(t.popup);
  assert.equal(t.closed(), 0);
  assert.equal(t.doc.count(), 1);
});

test('3: the press that closes is neither prevented nor stopped', () => {
  const t = setup();
  t.watch.sync(true);
  const spy = t.press(t.other);
  assert.equal(t.closed(), 1);
  assert.equal(spy.stopped, 0);
});

test('3: the press is heard in the capture phase, before the control under it', () => {
  const t = setup();
  let capture: boolean | undefined;
  const doc = {
    addEventListener: (_type: string, _fn: EventListener, flag?: boolean) => {
      capture = flag;
    },
    removeEventListener: () => undefined,
  };
  const root = { isConnected: true, closest: () => null } as unknown as HTMLElement;
  watchOutside({
    editor: { root, busy: () => false },
    close: () => undefined,
    doc,
    win: t.win,
    later: () => undefined,
  }).sync(true);
  assert.equal(capture, true);
});

test('4: the window blurring to the canvas frame closes it', () => {
  const t = setup();
  t.watch.sync(true);
  t.win.fire('blur', {});
  assert.equal(t.closed(), 1);
  assert.equal(t.win.count(), 0);
});

test('5: only a press and a blur listen; a drag, a scroll and a key never close it', () => {
  const t = setup();
  t.watch.sync(true);
  assert.deepEqual(t.doc.types(), ['pointerdown']);
  assert.deepEqual(t.win.types(), ['blur']);
  // A drag that began inside and ends outside, and a scroll of the panel, are not listened to.
  t.doc.fire('pointerup', { target: t.other });
  t.doc.fire('scroll', { target: t.other });
  assert.equal(t.closed(), 0);
});

test('5: while the eyedropper picks, neither a blur nor a press closes it', () => {
  let picking = true;
  const t = setup({ busy: () => picking });
  t.watch.sync(true);
  t.win.fire('blur', {});
  t.press(t.other);
  assert.equal(t.closed(), 0);
  picking = false;
  t.win.fire('blur', {});
  assert.equal(t.closed(), 1);
});

test('no listener left behind: stop removes both, and a second start adds none twice', () => {
  const t = setup();
  t.watch.sync(true);
  t.watch.sync(true);
  assert.equal(t.doc.count(), 1);
  assert.equal(t.win.count(), 1);
  t.watch.sync(false);
  t.watch.sync(false);
  assert.equal(t.doc.count() + t.win.count(), 0);
});

test('no listener left behind: an editor a redraw threw away is dropped at once, never closes', () => {
  const t = setup();
  t.watch.sync(true);
  t.frames.shift()?.();
  t.state.connected = false;
  t.press(t.other);
  assert.equal(t.closed(), 0);
  assert.equal(t.doc.count() + t.win.count(), 0);
});

test('no listener left behind: an editor never put in the page is dropped on the next frame', () => {
  const t = setup();
  t.state.connected = false;
  t.watch.sync(true);
  t.frames.shift()?.();
  assert.equal(t.doc.count() + t.win.count(), 0);
});

test('no listener left behind: the next editor to start sweeps one that left the page', () => {
  const a = setup();
  a.watch.sync(true);
  a.frames.shift()?.();
  a.state.connected = false;
  const b = setup();
  b.watch.sync(true);
  assert.equal(a.doc.count() + a.win.count(), 0);
  assert.equal(b.doc.count(), 1);
});

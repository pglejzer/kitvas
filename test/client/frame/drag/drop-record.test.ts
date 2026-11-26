import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDropRecord,
  type Holder,
  type Seated,
} from '../../../../client/frame/drag/motion/drop-record.ts';

// A tiny tree: a box holds an ordered list of nodes; a node reads its place from its box.
class Leaf implements Seated<Leaf> {
  parentNode: Box | null = null;
  /** False once the build replaced the page this node belonged to. */
  alive = true;
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
  get isConnected(): boolean {
    return this.alive && (this.parentNode === null || this.parentNode.isConnected);
  }
  get nextSibling(): Leaf | null {
    const kids = this.parentNode?.kids ?? [];
    return kids[kids.indexOf(this) + 1] ?? null;
  }
  remove(): void {
    this.parentNode?.take(this);
    this.parentNode = null;
  }
}

class Box implements Holder<Leaf> {
  kids: Leaf[] = [];
  alive = true;
  get isConnected(): boolean {
    return this.alive;
  }
  take(node: Leaf): void {
    this.kids = this.kids.filter((kid) => kid !== node);
  }
  insertBefore(node: Leaf, before: Leaf | null): void {
    node.remove();
    const at = before ? this.kids.indexOf(before) : -1;
    this.kids.splice(at < 0 ? this.kids.length : at, 0, node);
    node.parentNode = this;
  }
}

const box = (...names: string[]): Box => {
  const parent = new Box();
  for (const name of names) parent.insertBefore(new Leaf(name), null);
  return parent;
};
const names = (parent: Box): string[] => parent.kids.map((kid) => kid.name);
const first = (parent: Box, at = 0): Leaf => {
  const kid = parent.kids[at];
  if (!kid) throw new Error(`no node ${at}`);
  return kid;
};

test('a node moved into another parent goes back to its place before its next sibling', () => {
  const header = box('stack', 'rest');
  const card = box('title', 'price');
  const stack = first(header);
  const record = createDropRecord<Leaf>();
  record.note([stack]);
  card.insertBefore(stack, first(card, 1));
  assert.deepEqual(names(card), ['title', 'stack', 'price']);
  record.back();
  assert.deepEqual(names(header), ['stack', 'rest']);
  assert.deepEqual(names(card), ['title', 'price']);
});

test('several nodes noted together come back in their old order', () => {
  const list = box('a', 'b', 'c', 'd');
  const target = box('x');
  const record = createDropRecord<Leaf>();
  record.note([first(list, 0), first(list, 1)]);
  target.insertBefore(first(list, 0), null);
  target.insertBefore(first(list, 0), null);
  assert.deepEqual(names(target), ['x', 'a', 'b']);
  record.back();
  assert.deepEqual(names(list), ['a', 'b', 'c', 'd']);
  assert.deepEqual(names(target), ['x']);
});

test('nodes noted in two calls (the other copies of a list item) all come back', () => {
  const one = box('a', 'b');
  const two = box('a2', 'b2');
  const sink = box();
  const record = createDropRecord<Leaf>();
  record.note([first(one)]);
  sink.insertBefore(first(one), null);
  record.note([first(two)]);
  sink.insertBefore(first(two), null);
  record.back();
  assert.deepEqual(names(one), ['a', 'b']);
  assert.deepEqual(names(two), ['a2', 'b2']);
  assert.deepEqual(names(sink), []);
});

test('a placeholder that was never on the page leaves', () => {
  const page = box('a');
  const placeholder = new Leaf('new');
  const record = createDropRecord<Leaf>();
  record.note([placeholder]);
  page.insertBefore(placeholder, null);
  record.back();
  assert.deepEqual(names(page), ['a']);
});

test('forget drops the record, and a second back changes nothing', () => {
  const header = box('stack', 'rest');
  const card = box('title');
  const stack = first(header);
  const record = createDropRecord<Leaf>();
  record.note([stack]);
  card.insertBefore(stack, null);
  record.forget();
  record.back();
  assert.deepEqual(names(card), ['title', 'stack']);
  // A record made afresh puts the node back where it stood when it was noted, once.
  record.note([stack]);
  header.insertBefore(stack, null);
  record.back();
  assert.deepEqual(names(card), ['title', 'stack']);
  assert.deepEqual(names(header), ['rest']);
  header.insertBefore(stack, null);
  record.back();
  assert.deepEqual(names(header), ['rest', 'stack']);
});

test('a node that left the page with a build is not touched', () => {
  const header = box('stack', 'rest');
  const card = box('title');
  const stack = first(header);
  const record = createDropRecord<Leaf>();
  record.note([stack]);
  card.insertBefore(stack, null);
  stack.alive = false;
  record.back();
  assert.deepEqual(names(card), ['title', 'stack']);
  assert.deepEqual(names(header), ['rest']);
});

test('a parent that left the page with a build gets nothing put into it', () => {
  const header = box('stack', 'rest');
  const card = box('title');
  const stack = first(header);
  const record = createDropRecord<Leaf>();
  record.note([stack]);
  card.insertBefore(stack, null);
  header.alive = false;
  record.back();
  assert.deepEqual(names(card), ['title', 'stack']);
  assert.deepEqual(names(header), ['rest']);
});

test('when the next sibling is gone, the node goes last in its old parent', () => {
  const header = box('stack', 'rest');
  const card = box('title');
  const record = createDropRecord<Leaf>();
  record.note([first(header)]);
  card.insertBefore(first(header), null);
  first(header).remove();
  record.back();
  assert.deepEqual(names(header), ['stack']);
});

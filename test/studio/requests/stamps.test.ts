import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type Inspector,
  inspectorFor,
  isStale,
  type Stamped,
  stampOf,
  stampsNow,
} from '../../../src/studio/requests/stamps.ts';
import { shopDraft } from '../../helpers/draft/drafts.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';

const STAMPED: Stamped = {
  tag: 'Button',
  props: [{ name: 'variant', kind: 'literal', value: { kind: 'string', value: 'primary' } }],
  text: 'Start',
  className: { kind: 'string', value: 'hero-cta' },
  styles: {
    padding: { kind: 'scss', className: 'hero-cta', value: 'var(--kit-space-md)', offKit: false },
  } as Stamped['styles'],
  overrides: [],
};

test('a stamp changes with a prop, the text, the classes or a style, and nothing else', () => {
  const stamp = stampOf(STAMPED);
  assert.match(stamp, /^[0-9a-f]{64}$/);
  assert.equal(stampOf({ ...STAMPED }), stamp);
  assert.notEqual(stampOf({ ...STAMPED, text: 'Begin' }), stamp);
  assert.notEqual(stampOf({ ...STAMPED, props: [] }), stamp);
  assert.notEqual(stampOf({ ...STAMPED, className: null }), stamp);
  const restyled = {
    padding: { kind: 'scss', className: 'hero-cta', value: 'var(--kit-space-lg)', offKit: false },
  } as Stamped['styles'];
  assert.notEqual(stampOf({ ...STAMPED, styles: restyled }), stamp);
});

test('a request is stale when a stamp differs or an element is gone; never without an editor', () => {
  const inspect: Inspector = async () => null;
  const a = 'a'.repeat(64);
  const b = 'b'.repeat(64);
  assert.equal(isStale(inspect, [a, b], [a, b]), false);
  assert.equal(isStale(inspect, [a, b], [a, a]), true);
  assert.equal(isStale(inspect, [a, b], [a, null]), true, 'a gone element counts as changed');
  assert.equal(isStale(inspect, [null], [a]), true, 'one unread when made counts as changed');
  assert.equal(isStale(undefined, [a], [null]), false);
});

test('without an editor no element can be read, so every stamp is empty', async () => {
  const host = { drafts: shopDraft().store, kits: builtinKits() };
  const inspect = inspectorFor(host, 'shop');
  assert.equal(inspect, undefined);
  assert.deepEqual(await stampsNow(inspect, ['sections/Hero:section/Button']), [null]);
  // An element that is gone reads as nothing.
  assert.deepEqual(await stampsNow(async () => null, ['sections/Hero:section/Button']), [null]);
});

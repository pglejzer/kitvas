import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { addVersion, PENDING_HASH, readWhy, stampWhy } from '../../src/drafts/index.ts';
import { GOOD_LAYOUT, readVersionFiles, shopDraft, writeVersionFiles } from '../helpers/drafts.ts';

const HERO = 'export function Hero() { return <section className="hero">Hi</section>; }\n';
const SUMMARY = 'export function OrderSummary() { return <section>Pay</section>; }\n';
const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const NOW = new Date('2026-11-24T12:00:00.000Z');

/** A draft with a layout of two sections and both written. */
function draft() {
  const { store } = shopDraft();
  writeVersionFiles(store, 'shop', 1, {
    'md/layout.md': GOOD_LAYOUT,
    'src/tsx/sections/Hero.tsx': HERO,
    'src/tsx/sections/OrderSummary.tsx': SUMMARY,
  });
  return store;
}

const why = (hash: string, lines = ['Says what the shop sells.']) =>
  `${JSON.stringify({ lines, guidelines: ['ui-type-scale'], hash })}\n`;

test('a draft with no reasons lists every section as missing, in layout order', () => {
  const report = readWhy(draft(), 'shop', 1);
  assert.deepEqual(report, { sections: [], missing: ['Hero', 'OrderSummary'] });
});

test('a section whose hash is the sha256 of its TSX is current, and a changed TSX is stale', () => {
  const store = draft();
  writeVersionFiles(store, 'shop', 1, { 'why/Hero.json': why(sha(HERO)) });
  const [entry] = readWhy(store, 'shop', 1).sections;
  assert.deepEqual(entry, {
    section: 'Hero',
    element: null,
    lines: ['Says what the shop sells.'],
    guidelines: ['ui-type-scale'],
    stale: false,
  });
  writeVersionFiles(store, 'shop', 1, { 'src/tsx/sections/Hero.tsx': `${HERO}// edited\n` });
  assert.equal(readWhy(store, 'shop', 1).sections[0]?.stale, true);
});

test('a file that is not JSON or does not fit the schema is left out as missing', () => {
  const store = draft();
  writeVersionFiles(store, 'shop', 1, {
    'why/Hero.json': '{ not json',
    'why/OrderSummary.json': JSON.stringify({ lines: [], guidelines: [], hash: sha(SUMMARY) }),
  });
  assert.deepEqual(readWhy(store, 'shop', 1), {
    sections: [],
    missing: ['Hero', 'OrderSummary'],
  });
});

test('the section root is the first id of its file with no slash after the colon', () => {
  const store = draft();
  writeVersionFiles(store, 'shop', 1, {
    'why/Hero.json': why(sha(HERO)),
    'build/json/ids.json': JSON.stringify({
      ids: {
        'sections/Hero:section/Button': { file: 'a', line: 1, column: 1, tag: 'Button' },
        'sections/Hero:section': { file: 'a', line: 1, column: 1, tag: 'section' },
        'sections/OrderSummary:section': { file: 'b', line: 1, column: 1, tag: 'section' },
      },
    }),
  });
  assert.equal(readWhy(store, 'shop', 1).sections[0]?.element, 'sections/Hero:section');
});

test('a pending hash is not stale, and stamping puts the sha256 of the TSX in once', () => {
  const store = draft();
  writeVersionFiles(store, 'shop', 1, { 'why/Hero.json': why(PENDING_HASH) });
  assert.equal(readWhy(store, 'shop', 1).sections[0]?.stale, false);
  assert.equal(stampWhy(store, 'shop', 1), 1);
  const stamped = readVersionFiles(store, 'shop', 1, ['why/Hero.json'])['why/Hero.json'] ?? '';
  const parsed: unknown = JSON.parse(stamped);
  assert.ok(typeof parsed === 'object' && parsed !== null && 'hash' in parsed);
  assert.equal(parsed.hash, sha(HERO));
  assert.equal(stampWhy(store, 'shop', 1), 0);
  writeVersionFiles(store, 'shop', 1, { 'src/tsx/sections/Hero.tsx': `${HERO}// edited\n` });
  assert.equal(readWhy(store, 'shop', 1).sections[0]?.stale, true);
});

test('a new version copies the reasons with the sources', () => {
  const store = draft();
  const text = why(sha(HERO));
  writeVersionFiles(store, 'shop', 1, { 'why/Hero.json': text });
  const { version } = addVersion(store, 'shop', NOW);
  assert.equal(version, 2);
  assert.equal(readVersionFiles(store, 'shop', 2, ['why/Hero.json'])['why/Hero.json'], text);
});

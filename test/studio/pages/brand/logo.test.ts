// The studio's logo (spec 6.2): the paths of the brand file, its two kinds, its name, and the
// entrance that plays once for a tab.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { PLUGIN_ROOT } from '../../../../src/shared/index.ts';
import { LOGO_SEEN_KEY, logo, logoEntrance } from '../../../../src/studio/pages/brand/logo.ts';

const BRAND = readFileSync(join(PLUGIN_ROOT, 'docs', 'brand', 'kitvas-logo.svg'), 'utf8');
const MARK = readFileSync(join(PLUGIN_ROOT, 'docs', 'brand', 'kitvas-mark.svg'), 'utf8');

const pathsOf = (svg: string): string[] =>
  [...svg.matchAll(/ d="([^"]+)"/g)].map((match) => match[1] ?? '');
const placesOf = (svg: string): string[] =>
  [...svg.matchAll(/ transform="([^"]+)"/g)].map((match) => match[1] ?? '').sort();

test('the full logo draws the eight paths of the brand file, in their places', () => {
  const text = logo('full').text;
  const drawn = pathsOf(text);
  assert.equal(drawn.length, 8);
  const brand = pathsOf(BRAND);
  for (const d of drawn) assert.ok(brand.includes(d), d);
  assert.deepEqual([...drawn].sort(), [...brand].sort());
  assert.deepEqual(placesOf(text), placesOf(BRAND));
  assert.ok(text.startsWith('<svg class="k-logo" viewBox="0 0 245 64"'));
});

test('the mark is the block and the pointer, as the brand file of the mark', () => {
  const text = logo('mark').text;
  assert.ok(text.startsWith('<svg class="k-logo" viewBox="0 0 64 64"'));
  assert.deepEqual(pathsOf(text), pathsOf(MARK));
  assert.deepEqual(placesOf(text), placesOf(MARK));
  assert.ok(!text.includes('k-logo-letter'));
});

test('each part has its class: the block, the pointer and six letters', () => {
  const text = logo('full').text;
  assert.equal(text.match(/class="k-logo-block"/g)?.length, 1);
  assert.equal(text.match(/class="k-logo-pointer"/g)?.length, 1);
  assert.equal(text.match(/<g class="k-logo-letter"><path /g)?.length, 6);
  // A letter's place is on its path, so a rule that moves the letter keeps the place.
  assert.ok(!/<g class="k-logo-letter" transform/.test(text));
  assert.ok(text.includes('<g transform="translate(76 1)">'));
  // One colour: the text's, from the skin.
  assert.ok(!text.includes('fill="'));
  assert.ok(!text.includes('style='));
});

test('with a label the logo is an image with that name; without one it is decoration', () => {
  const named = logo('full', { label: 'kitvas, all drafts' }).text;
  assert.ok(named.includes(' role="img" aria-label="kitvas, all drafts"'));
  assert.ok(!named.includes('aria-hidden'));
  for (const text of [logo('mark').text, logo('full', { label: '' }).text]) {
    assert.ok(text.includes(' aria-hidden="true"'));
    assert.ok(!text.includes('role='));
    assert.ok(!text.includes('aria-label'));
  }
  assert.ok(!logo('mark', { label: '"><b>' }).text.includes('<b>'));
});

test('play and working add their marks, and a place adds its class', () => {
  const plain = logo('full').text;
  assert.ok(!plain.includes('data-play'));
  assert.ok(!plain.includes('data-claude'));
  assert.ok(logo('full', { play: true }).text.includes(' data-play'));
  assert.ok(logo('mark', { working: true }).text.includes(' data-claude'));
  const both = logo('mark', { label: 'kitvas', play: true, working: true }).text;
  assert.ok(both.includes('aria-label="kitvas" data-play data-claude>'));
  assert.ok(
    logo('mark', { className: 'start-giant' }).text.startsWith('<svg class="k-logo start-giant"'),
  );
});

/** Runs the entrance's script against a stand-in for the tab's storage and `<html>`. */
function enter(storage: unknown): { entered: boolean; threw: boolean } {
  const attributes = new Map<string, string>();
  const documentElement = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  };
  const code = /<script nonce="N">(.*)<\/script>/.exec(logoEntrance('N').text)?.[1] ?? '';
  assert.notEqual(code, '');
  let threw = false;
  try {
    runInNewContext(code, { sessionStorage: storage, document: { documentElement } });
  } catch {
    threw = true;
  }
  return { entered: attributes.has('data-logo-enter'), threw };
}

test('the entrance starts once for a tab, and not at all when the storage refuses', () => {
  const kept = new Map<string, string>();
  const storage = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => {
      kept.set(key, value);
    },
  };
  assert.deepEqual(enter(storage), { entered: true, threw: false });
  assert.ok(kept.has(LOGO_SEEN_KEY));
  assert.deepEqual(enter(storage), { entered: false, threw: false }, 'a reload does not play it');
  const refusing = {
    getItem: () => null,
    setItem: () => {
      throw new Error('The quota is full');
    },
  };
  assert.deepEqual(enter(refusing), { entered: false, threw: false });
  const blocked = {
    getItem: () => {
      throw new Error('The storage is blocked');
    },
  };
  assert.deepEqual(enter(blocked), { entered: false, threw: false });
});

test('the entrance script carries the nonce', () => {
  assert.ok(logoEntrance('abc').text.startsWith('<script nonce="abc">'));
});

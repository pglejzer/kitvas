// The studio's logo (spec 6.2, ADR 0084): the paths of the brand file, its two kinds, its name,
// the skin's rules and the entrance that plays once for a tab.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { PLUGIN_ROOT } from '../../../../src/shared/index.ts';
import {
  FAVICON,
  LOGO_SEEN_KEY,
  logo,
  logoEntrance,
} from '../../../../src/studio/pages/brand/logo.ts';
import { PART_D, PART_TURN } from '../../../../src/studio/pages/brand/part.ts';
import { html } from '../../../../src/studio/pages/html.ts';
import { page } from '../../../../src/studio/pages/shell.ts';
import { LOGO_SWAY_MS, SKIN_LOGO } from '../../../../src/studio/pages/skin/logo.ts';
import { ACCENT_COLORS } from '../../../../src/studio/theme/tokens.ts';

const BRAND = readFileSync(join(PLUGIN_ROOT, 'docs', 'brand', 'kitvas-logo.svg'), 'utf8');
const MARK = readFileSync(join(PLUGIN_ROOT, 'docs', 'brand', 'kitvas-mark.svg'), 'utf8');

const pathsOf = (svg: string): string[] =>
  [...svg.matchAll(/ d="([^"]+)"/g)].map((match) => match[1] ?? '');
/** The places, sorted; the brand file's turn of a loose part is the skin's rule in the studio. */
const placesOf = (svg: string): string[] =>
  [...svg.matchAll(/ transform="([^"]+)"/g)]
    .map((match) => (match[1] ?? '').replace(' rotate(-15)', ''))
    .sort();

test('the full logo draws the ten paths of the brand file, in their places', () => {
  const text = logo('full').text;
  const drawn = pathsOf(text);
  assert.equal(drawn.length, 10);
  const brand = pathsOf(BRAND);
  for (const d of drawn) assert.ok(brand.includes(d), d);
  assert.deepEqual([...drawn].sort(), [...brand].sort());
  assert.deepEqual(placesOf(text), placesOf(BRAND));
  assert.ok(text.startsWith('<svg class="k-logo" viewBox="0 0 180 46"'));
  assert.ok(text.includes('<g transform="translate(2 6)"><g class="k-logo-icon"><path d="'));
});

test('the mark is the icon of the brand file of the mark', () => {
  const text = logo('mark').text;
  assert.ok(text.startsWith('<svg class="k-logo" viewBox="0 0 34 34"'));
  assert.deepEqual(pathsOf(text), pathsOf(MARK));
  assert.deepEqual(placesOf(text), placesOf(MARK));
  assert.equal(pathsOf(text).length, 2);
  assert.equal(text.match(/class="k-logo-joint"/g)?.length, 1);
  assert.ok(!text.includes('k-logo-letter'));
  assert.ok(!text.includes('k-logo-dot'));
});

test('the tab icon is the icon in the two copper accents', () => {
  const prefix = 'data:image/svg+xml,';
  assert.ok(FAVICON.startsWith(prefix));
  const svg = decodeURIComponent(FAVICON.slice(prefix.length));
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34">'));
  assert.deepEqual(pathsOf(svg), pathsOf(MARK));
  assert.equal(pathsOf(svg).length, 2);
  assert.ok(
    svg.includes(
      `<style>path{fill:${ACCENT_COLORS.copper.light.accent}}@media (prefers-color-scheme:dark){path{fill:${ACCENT_COLORS.copper.dark.accent}}}</style>`,
    ),
  );
  const shown = page({ title: 'Shop', nonce: 'n', body: html``, skin: '', nav: null });
  assert.ok(shown.includes(`<link rel="icon" type="image/svg+xml" href="${FAVICON}">`));
});

test('each part has its class: the icon (two parts), six letters and two loose parts', () => {
  const text = logo('full').text;
  assert.equal(text.match(/<g class="k-logo-icon"><path d="/g)?.length, 1);
  assert.equal(text.match(/<path class="k-logo-joint" d="/g)?.length, 1);
  assert.equal(text.match(/<g class="k-logo-letter"><path /g)?.length, 6);
  assert.equal(text.match(/class="k-logo-dot /g)?.length, 2);
  assert.equal(text.match(/k-logo-dot-i/g)?.length, 1);
  assert.equal(text.match(/k-logo-stop/g)?.length, 1);
  // A CSS transform replaces the attribute, so what a rule moves (the icon, a letter's group, a
  // loose part's path) carries no place: the place is on a group around it.
  assert.ok(!/<path class="[^"]*" transform=/.test(text));
  assert.ok(!/<g class="k-logo-letter" transform/.test(text));
  assert.equal(text.match(/<g class="k-logo-dot [^"]*" transform="[^"]+"><path d="/g)?.length, 2);
  assert.ok(text.includes('<g transform="translate(47 0)">'));
  // The colours are rules of the skin: the icon and the parts the accent, the word the text's.
  assert.ok(!text.includes('fill="'));
  assert.ok(!text.includes('style='));
});

test('the part and its turn are those of the brand file', () => {
  const part = /<path d="([^"]+)" transform="translate\(28 10\.2\) rotate\((-?\d+)\)"/.exec(BRAND);
  assert.equal(PART_D, part?.[1]);
  assert.equal(PART_TURN, Number(part?.[2]));
});

test('the skin turns the loose parts, sways the full stop, nudges the joint', () => {
  assert.match(SKIN_LOGO, /\.k-logo-dot path \{[^}]*transform: rotate\(-15deg\);/);
  assert.match(SKIN_LOGO, /\.k-logo-icon, \.k-logo-dot \{ fill: var\(--st-color-accent\); \}/);
  assert.ok(SKIN_LOGO.includes(`animation: k-logo-sway ${LOGO_SWAY_MS / 1000}s`));
  assert.ok(SKIN_LOGO.includes(`animation: k-logo-fit ${LOGO_SWAY_MS / 1000}s`));
  assert.equal(LOGO_SWAY_MS, 1200);
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

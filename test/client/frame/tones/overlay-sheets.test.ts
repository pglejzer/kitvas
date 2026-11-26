import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { TONE_NAMES } from '../../../../client/frame/tones/tones.ts';
import { PLUGIN_ROOT } from '../../../../src/shared/env/paths.ts';

const FRAME = join(PLUGIN_ROOT, 'client', 'frame');

/** Every overlay of the frame that draws a colour (the sheets in these files). */
const SHEETS = [
  'drag/handles/guides.ts',
  'drag/handles/handles-sheet.ts',
  'drag/motion/preview.ts',
  'drag/gesture/rect-layer.ts',
  'edit/edit.ts',
  'edit/indicator.ts',
  'edit/label.ts',
  'live/pins.ts',
  'lens/pins.ts',
  'page/marks.ts',
];

/** The colours of the system: all an overlay may fall back to until the studio says its tones. */
const SYSTEM = new Set([
  'Canvas',
  'CanvasText',
  'GrayText',
  'Highlight',
  'HighlightText',
  'Mark',
  'MarkText',
]);

const read = (file: string): string => readFileSync(join(FRAME, file), 'utf8');

test('an overlay sheet reads a colour only through var(--kv-…, <system colour>)', () => {
  for (const file of SHEETS) {
    const text = read(file);
    assert.doesNotMatch(text, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, `${file}: no literal colour`);
    assert.ok(!text.includes('var(--kit-'), `${file}: nothing of the draft's kit`);
    const uses = [...text.matchAll(/var\((--[a-z-]+)(?:, ?([A-Za-z]+))?\)/g)];
    for (const [use, name = '', fallback] of uses) {
      assert.ok((TONE_NAMES as readonly string[]).includes(name), `${file}: ${use} is no tone`);
      assert.ok(
        fallback !== undefined && SYSTEM.has(fallback),
        `${file}: ${use} has no system colour`,
      );
    }
  }
});

test('the overlays together read every tone the studio sends', () => {
  const used = new Set<string>();
  for (const file of SHEETS) {
    for (const match of read(file).matchAll(/var\((--kv-[a-z-]+)/g)) used.add(match[1] ?? '');
  }
  for (const name of TONE_NAMES) assert.ok(used.has(name), `${name} is read by an overlay`);
});

test('every overlay host takes the studio tones once', () => {
  const folders = ['drag', 'edit', 'live', 'page'];
  for (const folder of folders) {
    for (const entry of readdirSync(join(FRAME, folder), { recursive: true, encoding: 'utf8' })) {
      if (!entry.endsWith('.ts')) continue;
      const text = read(`${folder}/${entry}`);
      if (!text.includes('attachShadow')) continue;
      const calls = text.match(/\btoned\(host\)/g) ?? [];
      assert.equal(calls.length, 1, `${folder}/${entry}: one toned(host) for its host`);
    }
  }
});

test('the frame bundle takes nothing from the studio or the sources', () => {
  for (const file of SHEETS) {
    assert.doesNotMatch(
      read(file),
      /from '(?:\.\.\/)+(?:src|client\/studio)\//,
      `${file}: no import from the studio`,
    );
  }
});

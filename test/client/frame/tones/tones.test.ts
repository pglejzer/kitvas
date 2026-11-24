import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FRAME_ACCENTS,
  FRAME_THEMES,
  parseStudioMessage,
} from '../../../../client/channel/protocol.ts';
import {
  MARK_TONES,
  ON_SELECT,
  SELECT,
  setTones,
  TONE_NAMES,
  toned,
  toneValues,
} from '../../../../client/frame/tones/tones.ts';
import { VIEW_ACCENTS } from '../../../../src/shared/settings/config.ts';
import * as theme from '../../../../src/studio/theme/tokens.ts';

const CHANNEL = 'abcdefghijklmnop';

const sent = (fields: Record<string, unknown>) => ({ kitvas: 1, channel: CHANNEL, ...fields });

/** A host that remembers what was set on it. */
function host() {
  const set = new Map<string, string>();
  return { set, style: { setProperty: (name: string, value: string) => set.set(name, value) } };
}

test('the frame knows the studio accents and both themes by the same names', () => {
  assert.deepEqual([...FRAME_ACCENTS], [...theme.ACCENTS]);
  assert.deepEqual([...FRAME_ACCENTS], [...VIEW_ACCENTS]);
  assert.deepEqual([...FRAME_THEMES].sort(), [...theme.THEMES].sort());
});

test('the table of the frame holds the same colours as the studio theme', () => {
  for (const accent of theme.ACCENTS) {
    assert.equal(SELECT[accent], theme.ACCENT_COLORS[accent].select, accent);
  }
  assert.equal(ON_SELECT, theme.ON_SELECT);
  for (const name of theme.THEMES) {
    const colors = theme.THEME_COLORS[name];
    assert.deepEqual(MARK_TONES[name], {
      fix: colors.fix,
      review: colors.review,
      good: colors.good,
      on: theme.ON_TONE[name],
    });
  }
});

test('every pair of a theme and an accent has a value for every name a sheet may read', () => {
  for (const name of FRAME_THEMES) {
    for (const accent of FRAME_ACCENTS) {
      const values = toneValues({ theme: name, accent });
      assert.deepEqual(Object.keys(values), [...TONE_NAMES]);
      for (const value of Object.values(values)) assert.match(value, /^#[0-9a-f]{6}$/);
      assert.equal(values['--kv-select'], SELECT[accent]);
    }
  }
});

test('a frame takes tones by name, and nothing else that looks like them', () => {
  assert.deepEqual(
    parseStudioMessage(sent({ type: 'tones', theme: 'dark', accent: 'rose' }), CHANNEL),
    {
      kitvas: 1,
      channel: CHANNEL,
      type: 'tones',
      theme: 'dark',
      accent: 'rose',
    },
  );
  // An extra field never rides along.
  const extra = sent({ type: 'tones', theme: 'light', accent: 'teal', select: 'red', css: 'x' });
  assert.deepEqual(Object.keys(parseStudioMessage(extra, CHANNEL) ?? {}).sort(), [
    'accent',
    'channel',
    'kitvas',
    'theme',
    'type',
  ]);
  const refused: Record<string, unknown>[] = [
    { type: 'tones', theme: 'system', accent: 'copper' },
    { type: 'tones', theme: 'dark', accent: 'blue' },
    { type: 'tones', theme: 'dark', accent: '#ff0000' },
    { type: 'tones', theme: 'dark', accent: 'url(http://evil.example)' },
    { type: 'tones', theme: 'dark' },
    { type: 'tones', accent: 'copper' },
    { type: 'tones', theme: ['dark'], accent: 'copper' },
  ];
  for (const fields of refused) {
    assert.equal(parseStudioMessage(sent(fields), CHANNEL), undefined, JSON.stringify(fields));
  }
  const other = {
    kitvas: 1,
    channel: 'ponmlkjihgfedcba',
    type: 'tones',
    theme: 'dark',
    accent: 'rose',
  };
  assert.equal(parseStudioMessage(other, CHANNEL), undefined);
});

test('an overlay host has no tones until the studio says them, then keeps up with it', () => {
  const early = host();
  toned(early);
  assert.equal(early.set.size, 0);
  setTones({ theme: 'dark', accent: 'teal' });
  assert.equal(early.set.get('--kv-select'), SELECT.teal);
  assert.equal(early.set.get('--kv-fix'), MARK_TONES.dark.fix);
  assert.equal(early.set.size, TONE_NAMES.length);
  // A host made later takes the tones at once.
  const late = host();
  toned(late);
  assert.equal(late.set.get('--kv-select'), SELECT.teal);
  setTones({ theme: 'light', accent: 'rose' });
  for (const one of [early, late]) {
    assert.equal(one.set.get('--kv-select'), SELECT.rose);
    assert.equal(one.set.get('--kv-on-tone'), MARK_TONES.light.on);
  }
});

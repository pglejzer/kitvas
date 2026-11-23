import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { loadKit, tokensToCss } from '../../../src/kit/index.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { SKIN_RULES, studioSkin } from '../../../src/studio/pages/skin.ts';

const base = loadKit(createFolderKitStore(join(PLUGIN_ROOT, 'kits')), 'base');

test('the skin is the Base tokens, then rules that use only tokens the kit has', () => {
  const tokens = tokensToCss(base.tokens);
  assert.ok(studioSkin(base.tokens).startsWith(tokens));
  const defined = new Set([...tokens.matchAll(/(--kit-[a-z0-9-]+):/g)].map((match) => match[1]));
  const used = [...SKIN_RULES.matchAll(/var\((--kit-[a-z0-9-]+)\)/g)].map((match) => match[1]);
  assert.ok(used.length > 20);
  for (const name of used) assert.ok(defined.has(name), `${name} is a Base token`);
});

test('colours come only from the tokens, and soft grey is never text', () => {
  assert.doesNotMatch(SKIN_RULES, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black)\b/i);
  assert.ok(!SKIN_RULES.includes('--kit-color-ink-soft'));
});

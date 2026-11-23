import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { loadKit, tokensToCss } from '../../../src/kit/index.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { escapeHtml, html } from '../../../src/studio/pages/html.ts';
import { lockedPage } from '../../../src/studio/pages/locked.ts';
import { pausedView } from '../../../src/studio/pages/paused.ts';
import { page } from '../../../src/studio/pages/shell.ts';
import { SKIN_RULES } from '../../../src/studio/pages/skin.ts';
import { t } from '../../helpers/translate.ts';

const base = loadKit(createFolderKitStore(join(PLUGIN_ROOT, 'kits')), 'base');

test('pages behind the cookie carry the paused view, hidden, with texts from the locale', () => {
  const view = pausedView(t).text;
  assert.equal(
    view,
    `<div class="paused" data-paused-view role="status" tabindex="-1" hidden><h1>${escapeHtml(t('studio.paused.title'))}</h1><p>${escapeHtml(t('studio.paused.body'))}</p></div>`,
  );
  // The body names a command in quotes; the markup carries them escaped.
  assert.ok(view.includes('&quot;kitvas studio&quot;'));
  const text = page({
    title: 'Drafts',
    nonce: 'N',
    skin: '',
    nav: { t, current: 'drafts' },
    body: html`<main></main>`,
  });
  assert.ok(text.includes(`<main></main>\n${view}\n</body>`));
  const locked = lockedPage({ t, nonce: 'N', skin: '', reason: 'closed' });
  assert.ok(!locked.includes('data-paused-view'));
});

test('the paused view takes the place of the page, styled from Base tokens only', () => {
  const start = SKIN_RULES.indexOf('/* The paused view');
  assert.ok(start >= 0);
  const rules = SKIN_RULES.slice(start, SKIN_RULES.indexOf('@media', start));
  assert.ok(rules.includes('body[data-paused] > :not(.paused) { display: none; }'));
  // No `display` of its own, so the `hidden` attribute keeps it out of sight until it is needed.
  assert.doesNotMatch(rules, /\.paused \{[^}]*display/);
  assert.match(rules, /\.paused:focus \{[^}]*outline: 2px solid var\(--kit-color-focus\)/);
  assert.doesNotMatch(rules, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black|transparent)\b/i);
  const defined = new Set(
    [...tokensToCss(base.tokens).matchAll(/(--kit-[a-z0-9-]+):/g)].map((match) => match[1]),
  );
  const used = [...rules.matchAll(/var\((--kit-[a-z0-9-]+)\)/g)].map((match) => match[1]);
  assert.ok(used.length > 0);
  for (const name of used) assert.ok(defined.has(name), `${name} is a Base token`);
});

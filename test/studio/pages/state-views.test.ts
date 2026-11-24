import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtml } from '../../../src/studio/pages/html.ts';
import { lockedPage } from '../../../src/studio/pages/locked.ts';
import { pausedView } from '../../../src/studio/pages/paused.ts';
import { SKIN_STATES } from '../../../src/studio/pages/skin/pages/states.ts';
import { commandBox } from '../../../src/studio/pages/states/command.ts';
import { t } from '../../helpers/translate.ts';

test('a command to copy is its text in the code font and a button that names what it does', () => {
  const box = commandBox(t, 'kitvas studio', { copy: true }).text;
  assert.ok(box.startsWith('<div class="k-cmd"><code>kitvas studio</code><button type="button"'));
  assert.ok(box.includes(` data-copy aria-label="${escapeHtml(t('studio.page.copy'))}"`));
  assert.ok(box.includes(`title="${escapeHtml(t('studio.page.copy'))}"`));
  assert.ok(!box.includes('<code>kitvas studio</code></div>'), 'the button follows the text');
  // The script says "Copied" in the page's words, in a line assistive technology hears.
  assert.ok(box.includes(` data-text-copied="${escapeHtml(t('studio.page.copied'))}"`));
  assert.ok(box.endsWith('<span class="k-sr" role="status" data-copy-status></span></div>'));
  assert.equal(
    commandBox(t, 'kitvas studio', { copy: false }).text,
    '<div class="k-cmd"><code>kitvas studio</code></div>',
  );
});

test('the command is escaped, never markup', () => {
  const box = commandBox(t, '<b>"x"</b>', { copy: false }).text;
  assert.equal(box, '<div class="k-cmd"><code>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</code></div>');
});

test('the paused view is hidden, takes focus, says one sentence and offers the command', () => {
  const view = pausedView(t).text;
  assert.ok(
    view.startsWith(
      '<div class="state-card state-paused k-rise" data-paused-view role="status" tabindex="-1" hidden>',
    ),
  );
  assert.ok(view.includes(`<h1>${escapeHtml(t('studio.paused.title'))}</h1>`));
  assert.ok(view.includes(`<p>${escapeHtml(t('studio.paused.body'))}</p>`));
  assert.ok(view.includes('<code>kitvas studio</code>'));
  assert.ok(!view.includes('<img') && !view.includes('<svg class="state'), 'no illustration');
});

test('the locked page has no studio bar, no script, and a command with no copy button', () => {
  for (const reason of ['closed', 'used'] as const) {
    const text = lockedPage({ t, nonce: 'N', skin: 'body{}', reason });
    assert.ok(!text.includes('<nav'));
    assert.ok(!text.includes('<script'));
    assert.ok(!text.includes('data-paused-view'));
    assert.ok(text.includes('<h1>Open the studio from its link</h1>'));
    assert.ok(text.includes('<div class="k-cmd"><code>kitvas studio</code></div>'));
    assert.ok(text.includes('<main class="state-main">'));
  }
});

test('the paused skin hides the page behind it and rings the view the script focuses', () => {
  assert.ok(
    SKIN_STATES.includes(
      'body[data-paused] > :not(.state-paused):not(.k-sprite) { display: none; }',
    ),
  );
  assert.match(
    SKIN_STATES,
    /\.state-paused:focus \{[^}]*outline: 2px solid var\(--st-color-accent\)/,
  );
});

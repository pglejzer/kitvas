import assert from 'node:assert/strict';
import { test } from 'node:test';
import { html } from '../../../src/studio/pages/html.ts';
import { pausedView } from '../../../src/studio/pages/paused.ts';
import { page } from '../../../src/studio/pages/shell.ts';
import { t } from '../../helpers/translate.ts';

// The view's own markup and its rules are in state-views.test.ts; here, where a page carries it.

test('a page behind the cookie carries the paused view last, after its content', () => {
  const view = pausedView(t).text;
  const text = page({
    title: 'Drafts',
    nonce: 'N',
    skin: '',
    nav: { t, current: 'drafts' },
    body: html`<main></main>`,
  });
  // After the page's content and the View popover, so the script finds one view to show.
  assert.ok(text.includes('<main></main>\n'));
  assert.ok(text.includes(`${view}\n</body>`));
  assert.equal(text.split('data-paused-view').length, 2);
});

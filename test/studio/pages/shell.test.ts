import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ViewSettings } from '../../../src/shared/settings/config.ts';
import { html } from '../../../src/studio/pages/html.ts';
import { iconSprite } from '../../../src/studio/pages/icons/icon.ts';
import { lockedPage } from '../../../src/studio/pages/locked.ts';
import { barStatusSlot, homeLink, page, viewAttributes } from '../../../src/studio/pages/shell.ts';
import type { StudioSkin } from '../../../src/studio/pages/skin.ts';
import { viewButton, viewPopover } from '../../../src/studio/pages/view-settings.ts';
import { t } from '../../helpers/translate.ts';

const nav = { t, current: 'drafts' as const };
const frame = { title: 'Drafts', nonce: 'N', nav, body: html`<main></main>` };

const skinWith = (view: ViewSettings): StudioSkin => ({ css: 'body{}', view: () => view });

const DEFAULT: ViewSettings = { theme: 'system', panels: 'cards', accent: 'copper' };
const DARK: ViewSettings = { theme: 'dark', panels: 'flush', accent: 'rose' };

test('the view is written on the html element; the system theme writes no theme', () => {
  assert.equal(viewAttributes(DEFAULT).text, ' data-panels="cards" data-accent="copper"');
  assert.equal(
    viewAttributes(DARK).text,
    ' data-theme="dark" data-panels="flush" data-accent="rose"',
  );
  const chosen = page({ ...frame, skin: skinWith(DARK) });
  assert.ok(
    chosen.includes('<html lang="en" data-theme="dark" data-panels="flush" data-accent="rose">'),
  );
  assert.ok(chosen.includes('<style nonce="N">body{}</style>'));
});

test('a sheet alone is the default view: what a test and a locked page have', () => {
  const text = page({ ...frame, skin: 'body{}' });
  assert.ok(text.includes('<html lang="en" data-panels="cards" data-accent="copper">'));
  assert.ok(text.includes('<meta name="color-scheme" content="light dark">'));
});

test('the view is read for every page, so a change shows on the next one', () => {
  let view = DEFAULT;
  const skin: StudioSkin = { css: '', view: () => view };
  assert.ok(!page({ ...frame, skin }).includes('data-theme='));
  view = { ...DEFAULT, theme: 'light' };
  assert.ok(page({ ...frame, skin }).includes('<html lang="en" data-theme="light"'));
});

test('a page has the icons, then the bar: the logo, the links, the status and View', () => {
  const text = page({ ...frame, skin: '' });
  assert.ok(text.includes(`<body>\n${iconSprite().text}\n<header class="k-bar">`));
  const home = homeLink(t, 'full').text;
  assert.ok(text.includes(`<div class="k-bar-start">${home}<nav class="k-nav"`));
  assert.ok(text.includes('<nav class="k-nav" aria-label="Studio">'));
  assert.ok(
    text.includes(
      `<div class="k-bar-end">${barStatusSlot(t).text}${viewButton(t).text}</div></header>`,
    ),
  );
  // The word is gone: the logo says it.
  assert.ok(!text.includes('k-mark'));
});

test('the logo in the bar is a link home with a name, and shows that Claude works', () => {
  const home = homeLink(t, 'full').text;
  assert.ok(
    home.startsWith('<a class="k-logo-link" href="/"><svg class="k-logo" viewBox="0 0 245 64"'),
  );
  assert.ok(home.includes(`role="img" aria-label="${t('studio.nav.home')}" data-claude>`));
  assert.ok(home.endsWith('</svg></a>'));
  assert.ok(!home.includes('data-play'), 'only the start page plays the entrance');
  assert.ok(homeLink(t, 'mark').text.includes('viewBox="0 0 64 64"'));
});

test("Claude's status slot is empty and holds the words the script shows", () => {
  const slot = barStatusSlot(t).text;
  assert.ok(slot.startsWith('<span class="k-bar-status" data-bar-listening role="status"'));
  assert.ok(slot.includes(`data-text-listening="${t('studio.edit.ai.bar.listening')}"`));
  assert.ok(slot.includes(`data-text-working="${t('studio.edit.ai.bar.working')}"`));
  assert.ok(slot.endsWith('></span>'));
});

test('the View button is an icon and a word, with a name and a tooltip, and says what it opens', () => {
  const button = viewButton(t).text;
  assert.ok(button.startsWith('<button type="button" class="k-btn" data-view-open'));
  assert.ok(button.includes('aria-haspopup="dialog" aria-expanded="false"'));
  assert.ok(button.includes('aria-label="View" title="View"'));
  assert.ok(button.includes('<use href="#i-sliders"></use>'));
  // The word gives way in a narrow bar; the name stays.
  assert.ok(button.endsWith('</svg><span class="k-bar-word">View</span></button>'));
});

test('the popover starts hidden and marks the chosen value of each setting', () => {
  const pop = viewPopover(t, DARK).text;
  assert.ok(pop.startsWith('<div class="k-pop view-pop" data-view-pop role="dialog"'));
  assert.ok(pop.includes('aria-label="View" hidden>'));
  const pressed = [...pop.matchAll(/data-value="([a-z]+)" aria-pressed="true"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(pressed, ['dark', 'flush', 'rose']);
  for (const set of ['theme', 'panels', 'accent']) {
    assert.ok(pop.includes(`aria-labelledby="view-${set}" data-view-set="${set}"`), set);
  }
  assert.equal(pop.match(/data-value=/g)?.length, 9);
  // An accent is a colour with no text: its name is its label and its tooltip.
  assert.ok(pop.includes('data-value="copper" aria-pressed="false" aria-label="Copper"'));
  assert.ok(pop.includes('title="Copper"'));
  assert.ok(pop.includes('data-text-saved="Saved for you on this computer."'));
  assert.ok(pop.includes('role="status">Saved for you on this computer.</p>'));
});

test('every page with the studio links has one popover; the editor screen has no studio bar', () => {
  const plain = page({ ...frame, skin: '' });
  assert.equal(plain.split('data-view-pop').length - 1, 1);
  const screen = page({ ...frame, skin: '', chrome: 'screen' });
  assert.equal(screen.split('data-view-pop').length - 1, 1);
  assert.ok(!screen.includes('<header class="k-bar">'));
  assert.ok(!screen.includes('data-view-open'));
});

test('a locked page has no bar and no popover, and still shows the chosen view', () => {
  const locked = lockedPage({ t, nonce: 'N', skin: skinWith(DARK), reason: 'closed' });
  assert.ok(!locked.includes('data-view-pop'));
  assert.ok(!locked.includes('k-bar'));
  // The person chose the view; a page that anyone on this computer can open still shows it.
  assert.ok(locked.includes('data-theme="dark"'));
});

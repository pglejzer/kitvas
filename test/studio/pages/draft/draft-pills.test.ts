import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Draft, States } from '../../../../src/drafts/index.ts';
import { choiceLink } from '../../../../src/studio/pages/draft/draft-links.ts';
import { pills } from '../../../../src/studio/pages/draft/draft-stage.ts';
import { escapeHtml } from '../../../../src/studio/pages/html.ts';
import type { DraftChoice } from '../../../../src/studio/views/draft-query.ts';
import { t } from '../../../helpers/translate.ts';

const DRAFT: Draft = {
  schemaVersion: 1,
  slug: 'shop',
  title: 'Shop',
  kind: 'screen',
  kit: { id: 'kitvas-ui', version: '1.1.0', hash: 'a'.repeat(64) },
  createdAt: '2026-11-22T10:00:00.000Z',
  versions: [
    { number: 1, createdAt: '2026-11-22T10:00:00.000Z' },
    { number: 3, createdAt: '2026-11-22T11:00:00.000Z' },
  ],
};

const STATES: States = {
  schemaVersion: 1,
  default: 'filled',
  states: [
    { id: 'filled', label: 'With data' },
    { id: 'empty', label: 'Loading prices' },
  ],
};

const ONE_STATE: States = {
  schemaVersion: 1,
  default: 'filled',
  states: [{ id: 'filled', label: 'With data' }],
};

const CHOICE: DraftChoice = { version: 3, state: 'filled', width: 390 };

const docked = (
  choice: DraftChoice = CHOICE,
  states: States = STATES,
  breakpoints: readonly number[] = [768, 1280],
): string => pills({ t, choice, states, link: choiceLink(DRAFT, choice), breakpoints }).text;

const count = (text: string, part: string): number => text.split(part).length - 1;

/** The More menu's markup. */
const more = (text: string): string =>
  /<details class="pill-menu pill-more"[^>]*>.*?<\/details>/.exec(text)?.[0] ?? '';

/** The width pill's markup, up to where More begins. */
const widthPill = (text: string): string =>
  /<div class="k-pop k-pill" data-dock="width">.*?<details class="pill-menu pill-more"/.exec(
    text,
  )?.[0] ?? '';

/** The rows of the sizes in More by width. */
const rows = (text: string): Map<number, string> => {
  const found = new Map<number, string>();
  for (const match of text.matchAll(
    /<a class="k-menu-item pill-size(?: pill-preset)?" data-dock-size="(\d+)"[^>]*>.*?<\/a>/g,
  )) {
    found.set(Number(match[1]), match[0]);
  }
  return found;
};

test('one row at the top right: the state pill, then the width pill; the zoom pill is not here', () => {
  const text = docked();
  assert.ok(text.startsWith('<div class="pill-row" data-shell="dock" role="group"'));
  assert.ok(text.includes(`aria-label="${escapeHtml(t('studio.edit.canvas.controls'))}"`));
  assert.equal(count(text, 'class="pill-row"'), 1);
  const states = text.indexOf('data-dock="states"');
  const width = text.indexOf('data-dock="width"');
  assert.ok(states > 0 && width > states);
  // The second row of pills (cards, a states bar) is gone.
  assert.ok(!text.includes('class="k-pop k-pill" data-dock="cards"'));
  assert.ok(!text.includes('<nav class="k-pop k-pill" data-dock="states"'));
  // The zoom pill is in the bottom row with the ask bar (`canvasTools`).
  assert.ok(!text.includes('data-dock="zoom"'));
});

test('the pill shows 390, 768 and 1280 and More', () => {
  const pill = widthPill(docked());
  const shown = [...pill.matchAll(/data-dock-width="(\d+)"/g)].map((match) => match[1]);
  assert.deepEqual(shown, ['390', '768', '1280']);
  assert.match(docked(), /<summary class="k-btn"[^>]*><span class="pill-word">[^<]+<\/span><svg/);
  assert.ok(docked().indexOf('data-dock="more"') > docked().indexOf('data-dock-width="1280"'));
  // No size of the menu is a button of the pill.
  assert.ok(!/data-dock-width="(320|430|1024|1440|1920|2560)"/.test(pill));
});

test('the presets are links to the same view with a device icon, the current one marked', () => {
  const text = docked({ ...CHOICE, width: 768 });
  assert.ok(text.includes('<nav class="pill-group" data-dock="widths"'));
  for (const [width, name] of [
    [390, 'phone'],
    [768, 'tablet'],
    [1280, 'laptop'],
  ] as const) {
    const link = new RegExp(
      `<a class="k-btn pill-opt" data-dock-width="${width}"[^>]*>.*?href="#i-${name}".*?<span>${width}</span></a>`,
    );
    const found = link.exec(text)?.[0] ?? '';
    const href = escapeHtml(`/drafts/shop?version=3&state=filled&width=${width}`);
    assert.ok(found.includes(`href="${href}"`), String(width));
    assert.ok(found.includes(`title="${escapeHtml(t(`studio.width.${width}`))}"`), String(width));
    assert.equal(found.includes('aria-current="true"'), width === 768, String(width));
  }
});

test('More holds every size, the custom width, Cards 1 2 3 and Every width', () => {
  const menu = more(docked());
  assert.ok(menu.includes('data-pill-menu'));
  // The sizes, by device; the three presets too, for the pill that shows only the width in use.
  assert.deepEqual([...rows(menu).keys()], [320, 390, 430, 768, 1024, 1280, 1440, 1920, 2560]);
  const presets = menu.matchAll(/pill-size pill-preset" data-dock-size="(\d+)"/g);
  assert.deepEqual(
    [...presets].map((match) => match[1]),
    ['390', '768', '1280'],
  );
  const heads = [...menu.matchAll(/class="k-meta pill-head" aria-hidden="true">([^<]*)</g)].map(
    (match) => match[1],
  );
  assert.deepEqual(heads, [
    escapeHtml(t('studio.width.group.phone')),
    escapeHtml(t('studio.width.group.tablet')),
    escapeHtml(t('studio.width.group.desktop')),
    escapeHtml(t('studio.edit.canvas.custom')),
    escapeHtml(t('studio.edit.canvas.cards')),
  ]);
  // The custom width: a plain GET form with the number field.
  assert.ok(menu.includes('<form class="pill-field" data-dock="view" method="get" action="">'));
  assert.match(menu, /<input class="k-field pill-number" type="number"[^>]*name="view"/);
  // Cards 1 2 3 and Every width (the script shows it).
  const counts = [...menu.matchAll(/data-dock-cards="(\d)"/g)].map((match) => match[1]);
  assert.deepEqual(counts, ['1', '2', '3']);
  assert.match(menu, /<button type="button" class="k-menu-item" data-dock-every [^>]*hidden>/);
  assert.ok(menu.indexOf('data-dock="sizes"') < menu.indexOf('data-dock="view"'));
  assert.ok(menu.indexOf('data-dock="view"') < menu.indexOf('data-dock="cards"'));
});

test('a width that is not a preset shows in the pill as its number, pressed', () => {
  const text = docked({ ...CHOICE, view: 1000 });
  const custom = /<a class="k-btn pill-opt" data-dock-custom[^>]*>[^<]*<\/a>/.exec(text)?.[0];
  assert.ok(custom);
  assert.ok(custom.includes('aria-current="true"'));
  assert.ok(custom.endsWith('>1000</a>'));
  assert.ok(!custom.includes('hidden'));
  assert.ok(custom.includes(escapeHtml('width=390&view=1000')));
  // It is inside the pill, before More; no preset is pressed.
  assert.ok(text.indexOf('data-dock-custom') < text.indexOf('data-dock="more"'));
  assert.ok(!/data-dock-width="[0-9]+"[^>]*aria-current/.test(text));
  assert.ok(/<input class="k-field pill-number" type="number"[^>]*value="1000"/.test(text));
  assert.ok(text.includes('<input type="hidden" name="width" value="390">'));
});

test('at a preset the pill has the custom button too, hidden, so nothing moves on load', () => {
  const text = docked();
  assert.match(text, /<a class="k-btn pill-opt" data-dock-custom href="[^"]*" hidden><\/a>/);
});

test('the state pill names the state shown and lists the others', () => {
  const text = docked({ ...CHOICE, state: 'empty' });
  const pill = /<details class="pill-menu pill-state"[^>]*>.*?<\/details>/.exec(text)?.[0] ?? '';
  assert.ok(pill.includes('data-dock="states"'));
  assert.ok(pill.includes('<span class="pill-state-name">Loading prices</span>'));
  assert.ok(pill.includes('<summary class="k-btn"'));
  const filled = /<a class="k-menu-item" data-state="filled"[^>]*>.*?<\/a>/.exec(pill)?.[0] ?? '';
  const empty = /<a class="k-menu-item" data-state="empty"[^>]*>.*?<\/a>/.exec(pill)?.[0] ?? '';
  assert.ok(filled.includes(escapeHtml('/drafts/shop?version=3&state=filled&width=390')));
  assert.ok(filled.includes('<span>With data</span>'));
  assert.ok(!filled.includes('aria-current'));
  assert.ok(empty.includes('aria-current="true"'));
  assert.ok(empty.includes('<span>Loading prices</span>'));
});

test('a draft with one state has no state pill', () => {
  const text = docked(CHOICE, ONE_STATE);
  assert.ok(!text.includes('data-dock="states"'));
  assert.ok(!text.includes('data-state='));
  assert.ok(text.includes('data-dock="width"'));
});

test('the number field takes any width from 320 to 2560 and works without the script', () => {
  const text = docked({ ...CHOICE, compare: 1 });
  const field = /<input class="k-field pill-number" type="number"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(field.includes('name="view"'));
  assert.ok(field.includes('data-dock-view'));
  assert.ok(field.includes('min="320"'));
  assert.ok(field.includes('max="2560"'));
  assert.ok(field.includes('step="1"'));
  assert.ok(field.includes('value="390"'));
  assert.ok(field.includes(`aria-label="${escapeHtml(t('studio.edit.canvas.width'))}"`));
  assert.ok(text.includes('<input type="hidden" name="version" value="3">'));
  assert.ok(text.includes('<input type="hidden" name="state" value="filled">'));
  assert.ok(text.includes('<input type="hidden" name="width" value="390">'));
  assert.ok(text.includes('<input type="hidden" name="compare" value="1">'));
  assert.ok(!docked().includes('name="compare"'));
});

test('at a preset the mark of hidden marks is there but hidden, and says nothing', () => {
  const text = docked();
  assert.match(
    text,
    /<button type="button" class="k-icon-btn pill-mark" data-dock-note[^>]* hidden>/,
  );
  assert.ok(text.includes('<span class="k-sr" role="status" data-dock-said></span>'));
});

test('a width that is not a preset says that the marks are hidden at it', () => {
  const text = docked({ ...CHOICE, view: 1000 });
  const note = escapeHtml(t('studio.edit.canvas.marksHidden'));
  assert.ok(
    text.includes(
      `<button type="button" class="k-icon-btn pill-mark" data-dock-note aria-label="${note}" title="${note}">`,
    ),
  );
  assert.ok(text.includes(`<span class="k-sr" role="status" data-dock-said>${note}</span></div>`));
});

test('at a custom width the state links keep it and the preset links drop it', () => {
  const text = docked({ ...CHOICE, view: 1000 });
  const state = /<a class="k-menu-item" data-state="empty"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(state.includes(escapeHtml('state=empty&width=390&view=1000')));
  const preset = /<a class="k-btn pill-opt" data-dock-width="768"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(preset.includes(escapeHtml('width=768')));
  assert.ok(!preset.includes('view='));
});

test('the cards links in More mark the shown count and keep the width', () => {
  const text = docked({ ...CHOICE, cards: 2 });
  const links = [...text.matchAll(/<a class="k-btn pill-opt" data-dock-cards="(\d)"[^>]*>/g)];
  const two = links.find((link) => link[1] === '2')?.[0] ?? '';
  assert.ok(two.includes('aria-current="true"'));
  assert.ok(two.includes(escapeHtml('width=390&cards=2')));
  const one = links.find((link) => link[1] === '1')?.[0] ?? '';
  assert.ok(!one.includes('&amp;cards='));
  assert.ok(!one.includes('aria-current'));
});

test('the pills keep the cards, and the number field names them', () => {
  const text = docked({ ...CHOICE, cards: 3 });
  const state = /<a class="k-menu-item" data-state="empty"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(state.includes(escapeHtml('state=empty&width=390&cards=3')));
  const preset = /<a class="k-btn pill-opt" data-dock-width="768"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(preset.includes(escapeHtml('width=768&cards=3')));
  assert.ok(text.includes('<input type="hidden" name="cards" value="3">'));
  assert.ok(!docked().includes('name="cards"'));
});

test('while comparing the cards in More are off, with the reason, and a comparison stays on', () => {
  const text = docked({ ...CHOICE, compare: 1 });
  const part = /<div class="pill-block" data-dock="cards"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(part.includes('data-off'));
  assert.ok(part.includes(`title="${escapeHtml(t('studio.edit.canvas.cardsOff'))}"`));
  assert.ok(!text.includes('data-dock-cards'));
  assert.ok(!text.includes('data-dock-every'));
  assert.equal(count(text, 'aria-disabled="true"'), 3);
  const preset = /<a class="k-btn pill-opt" data-dock-width="768"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(preset.includes(escapeHtml('width=768&compare=1')));
});

test('a size row has its name and width, a tick where the kit has a breakpoint', () => {
  const found = rows(docked());
  for (const width of [1024, 1440]) {
    assert.ok(!found.get(width)?.includes('pill-dot'), `no dot ${width}`);
  }
  assert.ok(found.get(1024)?.includes(escapeHtml(t('studio.width.size.tablet.wide'))));
  const kit = rows(docked(CHOICE, STATES, [1024]));
  assert.deepEqual(
    [...kit].filter(([, row]) => row.includes('pill-tick')).map(([width]) => width),
    [1024],
  );
  assert.ok(kit.get(1024)?.includes(escapeHtml(t('studio.width.breakpoint'))));
});

test('the shown size in More is current, any other row plain', () => {
  const found = rows(docked({ ...CHOICE, view: 1920 }));
  assert.ok(found.get(1920)?.includes('aria-current="true"'));
  assert.equal(count([...found.values()].join(''), 'aria-current'), 1);
  const plain = [...rows(docked({ ...CHOICE, view: 1000 })).values()].join('');
  assert.equal(count(plain, 'aria-current'), 0);
});

test('a row of More links a view and keeps the cards', () => {
  const found = rows(docked({ ...CHOICE, cards: 2 }));
  assert.ok(found.get(1920)?.includes(escapeHtml('width=390&view=1920&cards=2')));
});

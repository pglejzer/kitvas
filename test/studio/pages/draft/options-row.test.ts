import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Draft, States } from '../../../../src/drafts/index.ts';
import type { DraftOption } from '../../../../src/shared/index.ts';
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
  versions: [{ number: 1, createdAt: '2026-11-22T10:00:00.000Z' }],
};

const STATES: States = {
  schemaVersion: 1,
  default: 'filled',
  states: [
    { id: 'filled', label: 'With data' },
    { id: 'empty', label: 'Empty' },
  ],
};

const OPTIONS: DraftOption[] = [
  {
    id: 'columns',
    label: 'Columns',
    default: '3',
    values: [
      { id: '3', label: '3' },
      { id: '2', label: '2' },
    ],
  },
  {
    id: 'cards',
    label: 'Cards',
    default: 'outlined',
    values: [
      { id: 'outlined', label: 'Outlined' },
      { id: 'filled', label: 'Filled' },
    ],
  },
];

const CHOICE: DraftChoice = { version: 1, state: 'filled', width: 1280 };

const docked = (
  choice: DraftChoice = CHOICE,
  options: readonly DraftOption[] = OPTIONS,
  extra: Partial<DraftChoice> = {},
): string => {
  const shown = { ...choice, ...extra };
  return pills({
    t,
    choice: shown,
    states: STATES,
    link: choiceLink(DRAFT, shown),
    breakpoints: [768, 1280],
    options,
  }).text;
};

const count = (text: string, part: string): number => text.split(part).length - 1;

/** The row's markup, up to its closing end. */
const rowOf = (text: string): string =>
  /<div class="k-pop opt-row" id="options-row".*$/.exec(text)?.[0] ?? '';

test('a version with two options has the pill between the state and the width, and the row', () => {
  const text = docked();
  const states = text.indexOf('data-dock="states"');
  const pill = text.indexOf('class="k-pop k-pill pill-options"');
  const width = text.indexOf('data-dock="width"');
  assert.ok(states > 0 && pill > states && width > pill);
  assert.equal(count(text, 'data-options-toggle'), 1);
  assert.ok(text.includes('aria-expanded="true" aria-controls="options-row"'));
  // The count, the word and the dot; the dot is hidden at the defaults.
  assert.ok(text.includes('<span class="pill-count k-meta">2</span>'));
  assert.ok(
    text.includes(`<span class="pill-word">${escapeHtml(t('studio.edit.options.pill'))}</span>`),
  );
  assert.ok(/data-options-off [^>]*hidden>/.test(text));
  // The row follows the pill row, not inside it.
  assert.ok(text.indexOf('id="options-row"') > text.indexOf('</div>', width));
  assert.equal(count(rowOf(text), 'data-option="'), 2);
});

test('every value is a link that keeps the state and the other values, and the pressed one says so', () => {
  const text = docked(CHOICE, OPTIONS, { options: { cards: 'filled' } });
  const row = rowOf(text);
  const two = /<a [^>]*data-value="2"[^>]*>/.exec(row)?.[0] ?? '';
  assert.ok(
    two.includes(
      'href="/drafts/shop?version=1&amp;state=filled&amp;width=1280&amp;opt-columns=2&amp;opt-cards=filled"',
    ),
    two,
  );
  assert.ok(two.includes('aria-pressed="false"'));
  // A value that is the default writes no pair of its own.
  const three = /<a [^>]*data-value="3"[^>]*>/.exec(row)?.[0] ?? '';
  assert.ok(three.includes('aria-pressed="true"'));
  assert.ok(!three.includes('opt-columns'), three);
  const filled = /<a [^>]*data-value="filled"[^>]*>/.exec(row)?.[0] ?? '';
  assert.ok(filled.includes('aria-pressed="true"'));
  // Each option is a group with its label.
  assert.ok(row.includes('role="group" aria-labelledby="options-name-columns"'));
  assert.ok(row.includes('id="options-name-columns"'));
  // The state links of the pills keep the values too.
  assert.ok(/data-state="empty" href="[^"]*opt-cards=filled/.test(text));
});

test('at the defaults the row says Default; off them the dot shows and the note is hidden', () => {
  const plain = rowOf(docked());
  assert.ok(!/data-options-default-note hidden/.test(plain));
  const off = docked(CHOICE, OPTIONS, { options: { columns: '2' } });
  assert.ok(/data-options-default-note hidden/.test(rowOf(off)));
  assert.ok(!/data-options-off [^>]*hidden>/.test(off));
  // Reset and Make default need the script, which shows them.
  assert.ok(/data-options-reset [^>]*hidden>/.test(rowOf(off)));
  assert.ok(/data-options-default [^>]*hidden>/.test(rowOf(off)));
});

test('a version without options writes neither the pill nor the row', () => {
  const text = docked(CHOICE, []);
  assert.ok(!text.includes('pill-options'));
  assert.ok(!text.includes('options-row'));
  assert.ok(text.startsWith('<div class="pill-row"'));
  const bare = pills({
    t,
    choice: CHOICE,
    states: STATES,
    link: choiceLink(DRAFT, CHOICE),
    breakpoints: [],
  }).text;
  assert.ok(!bare.includes('options'));
});

test('comparing two versions shows no options', () => {
  const text = docked(CHOICE, OPTIONS, { compare: 2 });
  assert.ok(!text.includes('pill-options'));
  assert.ok(!text.includes('options-row'));
});

test('the width field carries the values that differ, so a typed width keeps them', () => {
  const text = docked(CHOICE, OPTIONS, { options: { columns: '2' } });
  assert.ok(text.includes('<input type="hidden" name="opt-columns" value="2" data-dock-option>'));
});

test('labels of options and values are escaped', () => {
  const nasty: DraftOption[] = [
    {
      id: 'tone',
      label: '<b>Tone</b>',
      default: 'a',
      values: [
        { id: 'a', label: '"Quiet" & <i>soft</i>' },
        { id: 'b', label: 'Loud' },
      ],
    },
  ];
  const text = docked(CHOICE, nasty);
  assert.ok(!text.includes('<b>Tone</b>'));
  assert.ok(text.includes(escapeHtml('<b>Tone</b>')));
  assert.ok(!text.includes('<i>soft</i>'));
  assert.ok(text.includes(escapeHtml('"Quiet" & <i>soft</i>')));
});

test('a theme value from the additions carries the mark; a base theme and another option do not', () => {
  const themed: DraftOption[] = [
    {
      id: 'theme',
      label: 'Theme',
      default: 'light',
      values: [
        { id: 'light', label: 'Light' },
        { id: 'sepia', label: 'Sepia' },
      ],
    },
    {
      id: 'columns',
      label: 'Columns',
      default: 'sepia',
      values: [{ id: 'sepia', label: 'Sepia' }],
    },
  ];
  const note = t('studio.edit.props.added', { source: '@mui/material' });
  const shown = { ...CHOICE };
  const text = pills({
    t,
    choice: shown,
    states: STATES,
    link: choiceLink(DRAFT, shown),
    breakpoints: [768, 1280],
    options: themed,
    added: { themes: ['sepia'], note },
  }).text;
  const row = rowOf(text);
  assert.equal(count(row, 'class="k-added"'), 1);
  assert.ok(row.includes(`aria-label="${escapeHtml(note)}"`));
  const sepia = /data-value="sepia"[^>]*>Sepia<span class="k-added"/.exec(row);
  assert.ok(sepia !== null);
  assert.ok(!/data-value="light"[^>]*>Light<span/.test(row));
});

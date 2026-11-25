// `/shortcuts`: the editor's keys, one island per group, from the table the editor's `?` list
// reads (`views/shortcuts.ts`). The words are the editor's own (`studio.edit.*`).

import type { Translate } from '../../../shared/index.ts';
import {
  KEY_SHOWN,
  KEY_WORDS,
  SHORTCUT_GROUPS,
  SHORTCUT_ROWS,
  type ShortcutRow,
} from '../../views/shortcuts.ts';
import { type Html, html } from '../html.ts';
import { type InfoDeps, type InfoRequest, infoPage } from './layout.ts';

/**
 * One key of a way to press. `Mod` and `Alt` are written the way a PC reads them; the page's script
 * swaps them on a Mac (`data-mod`, `data-alt`).
 */
function keyOf(t: Translate, part: string): Html {
  if (part === 'Mod') return html`<kbd class="k-kbd" data-mod>Ctrl</kbd>`;
  if (part === 'Alt') return html`<kbd class="k-kbd" data-alt>Alt</kbd>`;
  const word = KEY_WORDS[part];
  const name = word === undefined ? (KEY_SHOWN[part] ?? part) : t(`studio.edit.${word}`);
  return html`<kbd class="k-kbd">${name}</kbd>`;
}

/** One way to press, as keys joined by a plus: `Mod+Shift+Z`. */
function wayOf(t: Translate, combo: string): Html {
  const keys = combo
    .split('+')
    .map(
      (part, at) => html`${at > 0 ? html`<span class="info-plus">+</span>` : ''}${keyOf(t, part)}`,
    );
  return html`<span class="info-key-way">${keys}</span>`;
}

function rowOf(t: Translate, row: ShortcutRow): Html {
  const ways = row.keys.map(
    (combo, at) =>
      html`${at > 0 ? html`<span class="k-meta">${t('studio.edit.shortcuts.or')}</span>` : ''}${wayOf(t, combo)}`,
  );
  return html`<li class="info-key" data-shortcut="${row.id}"><span>${t(`studio.edit.${row.label}`)}</span><span class="info-key-ways">${ways}</span></li>`;
}

export function shortcutsPage(deps: InfoDeps, request: InfoRequest): string {
  const { t } = deps;
  const cards = SHORTCUT_GROUPS.map((group) => {
    const rows = SHORTCUT_ROWS.filter((row) => row.group === group).map((row) => rowOf(t, row));
    return html`<section class="info-card info-card-pad" data-group="${group}"><h2>${t(`studio.edit.shortcuts.group.${group}`)}</h2><ul class="info-keys">${rows}</ul></section>`;
  });
  const hint = html`<p class="info-hint"><span>${t('studio.shortcuts.hintBefore')}</span><kbd class="k-kbd">?</kbd><span>${t('studio.shortcuts.hintAfter')}</span></p>`;
  return infoPage(deps, request, {
    title: t('studio.shortcuts.title'),
    lead: t('studio.shortcuts.intro'),
    current: 'shortcuts',
    row: hint,
    body: html`<div class="info-cards info-cards-keys">${cards}</div>`,
  });
}

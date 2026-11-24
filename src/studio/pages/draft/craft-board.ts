// The pick control of a craft draft: the board itself is the built page; here are the three
// sketches as cards, each with the command that picks it, and after a pick the picked sketch with
// the commands that take the final into the kit. The studio only shows them; `kitvas craft` does
// the work. Plan 18, task D: each command is a `.k-cmd` with its copy button.

import { type Draft, SKETCHES } from '../../../drafts/index.ts';
import type { Translate } from '../../../shared/index.ts';
import { type Html, html } from '../html.ts';
import { commandBox } from '../states/command.ts';

/**
 * Before a pick, a card per sketch with its command; after it, the picked sketch and the commands
 * that add it to the kit or export it (the later versions hold the picked sketch alone). `null`
 * when the draft is not a craft draft.
 */
export function craftPick(t: Translate, draft: Draft): Html | null {
  if (draft.craft === undefined) return null;
  const { picked } = draft.craft;
  const label = t('studio.craft.pickLabel');
  const command = (line: string): Html => commandBox(t, line, { copy: true });
  const head = html`<h2 class="sketch-title">${label}</h2>`;
  if (picked !== null) {
    const next = [
      `kitvas craft add ${draft.slug}`,
      `kitvas craft export ${draft.slug} --to <folder>`,
    ];
    const card = html`<div class="k-item sketch-card" data-sketch="${picked}" aria-current="true"><div class="sketch-head"><h3>${t('studio.craft.sketch', { sketch: picked })}</h3><span class="k-chip" data-tone="accent">${t('studio.craft.picked')}</span></div><p class="k-quiet">${t('studio.craft.pickedLine', { sketch: picked })}</p>${next.map(command)}</div>`;
    return html`<section class="sketch-pick k-scroll" aria-label="${label}"><div class="k-pad sketch-body">${head}${card}</div></section>`;
  }
  const cards = SKETCHES.map(
    (sketch) =>
      html`<li class="k-item sketch-card" data-sketch="${sketch}"><h3>${t('studio.craft.sketch', { sketch })}</h3>${command(`kitvas craft pick ${draft.slug} ${sketch}`)}</li>`,
  );
  return html`<section class="sketch-pick k-scroll" aria-label="${label}"><div class="k-pad sketch-body">${head}<p class="k-quiet">${t('studio.craft.pickHint')}</p><ul class="k-stack" role="list">${cards}</ul></div></section>`;
}

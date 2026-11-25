// The block at the top of `/`: the logo, one sentence, the start switch and a line of facts. It
// stands in the inverted scope (`k-inverse`, `theme/`), so the shared controls inside it need no
// colours of their own. The start switch is markup for `client/studio/start/switch.ts`: change both
// together. Without the script every command is shown, one under another.

import { type KitStore, loadKit } from '../../../kit/index.ts';
import { KitvasError, type Translate } from '../../../shared/index.ts';
import { startChoices } from '../../views/start.ts';
import { logo, logoEntrance } from '../brand/logo.ts';
import { type Html, html, trusted } from '../html.ts';
import { commandBox } from '../states/command.ts';

export type BlockInput = {
  t: Translate;
  nonce: string;
  /** The name of the kit the project uses. */
  kitName: string;
  /** How many drafts there are, and how many of them need attention. */
  drafts: number;
  attention: number;
  /** The draft changed last, for the Edit command; `null` with none. */
  lastSlug: string | null;
};

/** The kit's name; its id when the kit does not load. */
export function kitLabel(kits: KitStore, id: string): string {
  try {
    return loadKit(kits, id).kit.name;
  } catch (error) {
    if (error instanceof KitvasError) return id;
    throw error;
  }
}

function startSwitch(t: Translate, lastSlug: string | null): Html {
  const choices = startChoices(lastSlug);
  const buttons = choices.map(
    (choice, index) =>
      html`<button type="button" data-choice="${choice.id}" aria-pressed="${index === 0 ? 'true' : 'false'}">${t(`studio.start.choice.${choice.id}.name`)}</button>`,
  );
  const panels = choices.map((choice, index) => {
    const shown = index === 0 ? trusted(' data-on') : '';
    return html`<div class="start-choice" data-panel="${choice.id}"${shown}>${commandBox(t, choice.command, { copy: true })}<p class="start-what">${t(`studio.start.choice.${choice.id}.line`)} ${t('studio.start.copyHint')}</p></div>`;
  });
  return html`<div class="start-go" data-start><div class="k-seg start-seg" role="group" aria-label="${t('studio.start.choice.label')}">${buttons}</div>${panels}</div>`;
}

function facts(input: BlockInput): Html {
  const { t, kitName, drafts, attention } = input;
  const kit = html`<a class="start-kit" href="/kit" title="${kitName}">${t('studio.start.facts.kit', { name: kitName })}</a>`;
  if (drafts === 0) {
    return html`<p class="start-meta">${kit}<span>${t('studio.start.facts.none')}</span></p>`;
  }
  const count = html`<span>${t(drafts === 1 ? 'studio.start.facts.draft' : 'studio.start.facts.drafts', { count: drafts })}</span>`;
  const needs =
    attention === 0
      ? ''
      : html`<a href="/?show=attention">${t(attention === 1 ? 'studio.start.facts.attentionOne' : 'studio.start.facts.attention', { count: attention })}</a>`;
  return html`<p class="start-meta">${kit}${count}${needs}</p>`;
}

export function startBlock(input: BlockInput): Html {
  const { t, nonce } = input;
  const lead = html`<p class="start-lead"><strong>${t('studio.start.lead.strong')}</strong>${t('studio.start.lead.rest')}</p>`;
  return html`<section class="start-block k-inverse">${logo('mark', { className: 'start-giant' })}<div class="start-block-in"><div class="start-brand">${logoEntrance(nonce)}<h1 class="start-name">${logo('full', { label: t('studio.start.name'), play: true })}</h1>${lead}${startSwitch(t, input.lastSlug)}${facts(input)}</div></div></section>`;
}

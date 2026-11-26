// The options of a version on the canvas (plan 25): the Options pill in the pill row and the row it
// opens under the pills. Both are written only for a version that has options; every value is a
// link, so the row works without the script. The page script (`client/studio/options/`) switches in
// place, keeps the row open or folded and draws the caption. The markup (`data-options-*`,
// `data-option`, `data-value`, `data-default`, `id="options-row"`) is the contract with it: change
// both together.

import {
  type DraftOption,
  type OptionChoice,
  THEME_OPTION,
  type Translate,
} from '../../../shared/index.ts';
import { addedMark } from '../added-mark.ts';
import { type Html, html } from '../html.ts';
import { icon } from '../icons/icon.ts';

export type OptionsInput = {
  t: Translate;
  /** The version's options, from `readOptions`; none: nothing is written. */
  options: readonly DraftOption[];
  /** The values that differ from the defaults (`DraftChoice.options`). */
  differ: OptionChoice;
  /** The link to this view with these values that differ (`draft-stage.ts` adds the width). */
  hrefFor: (differ: OptionChoice) => string;
  /** The kit's themes that come from the project's additions, and the mark's text (`added-mark.ts`). */
  added?: { themes: readonly string[]; note: string };
};

/** The value an option shows now. */
const shownOf = (option: DraftOption, differ: OptionChoice): string =>
  differ[option.id] ?? option.default;

/** The values that differ from the defaults, with `option` set to `value`. */
function withValue(
  options: readonly DraftOption[],
  differ: OptionChoice,
  option: DraftOption,
  value: string,
): OptionChoice {
  const next: OptionChoice = {};
  for (const one of options) {
    const chosen = one.id === option.id ? value : shownOf(one, differ);
    if (chosen !== one.default) next[one.id] = chosen;
  }
  return next;
}

/**
 * The pill: an icon, "Options", how many the version has, a dot while the values are not the
 * defaults, and a chevron. A button that opens and folds the row; the word goes first when the
 * canvas is narrow (the fit, `client/studio/canvas/fit/`), so the button names itself.
 */
export function optionsPill({ t, options, differ }: OptionsInput): Html {
  if (options.length === 0) return html``;
  const word = t('studio.edit.options.pill');
  const label = t('studio.edit.options.pillLabel', { count: options.length });
  const off = Object.keys(differ).length > 0 ? '' : html` hidden`;
  return html`<div class="k-pop k-pill pill-options"><button type="button" class="k-btn" data-options-toggle aria-expanded="true" aria-controls="options-row" aria-label="${label}" title="${t('studio.edit.options.pillTitle')}">${icon('sliders')}<span class="pill-word">${word}</span><span class="pill-count k-meta">${options.length}</span><span class="pill-off" data-options-off title="${t('studio.edit.options.off')}"${off}></span>${icon('chevron-down')}</button></div>`;
}

/** One option: its name, then a link for each of its values. */
function axis(input: OptionsInput, option: DraftOption): Html {
  const { options, differ, hrefFor } = input;
  const shown = shownOf(option, differ);
  const name = `options-name-${option.id}`;
  const values = option.values.map((value) => {
    const href = hrefFor(withValue(options, differ, option, value.id));
    const pressed = value.id === shown ? 'true' : 'false';
    const marked =
      option.id === THEME_OPTION && input.added?.themes.includes(value.id) === true
        ? addedMark(input.added.note)
        : '';
    return html`<a class="k-btn opt-value" href="${href}" data-value="${value.id}" aria-pressed="${pressed}">${value.label}${marked}</a>`;
  });
  return html`<div class="opt-axis" data-option="${option.id}" data-default="${option.default}" role="group" aria-labelledby="${name}"><span class="opt-name" id="${name}">${option.label}</span>${values}</div>`;
}

/**
 * The row under the pills: the options with their values, and at its end "Default" while every
 * value is the default, else Reset and (in Edit, on the latest version) Make default. The two
 * buttons need the script, which shows them; without it a value's link is the way back.
 */
export function optionsRow(input: OptionsInput): Html {
  const { t, options, differ } = input;
  if (options.length === 0) return html``;
  const axes = options.map((option) => axis(input, option));
  const isDefault = Object.keys(differ).length === 0;
  const note = isDefault ? '' : html` hidden`;
  const reset = t('studio.edit.options.reset');
  const make = t('studio.edit.options.makeDefault');
  return html`<div class="k-pop opt-row" id="options-row" role="group" aria-label="${t('studio.edit.options.row')}" data-options-row><div class="opt-axes" data-options-axes>${axes}</div><div class="opt-end"><span class="opt-default" data-options-default-note${note}>${icon('check')}${t('studio.edit.options.default')}</span><button type="button" class="k-btn" data-options-reset title="${t('studio.edit.options.resetTitle')}" hidden>${reset}</button><button type="button" class="k-btn opt-make" data-options-default title="${t('studio.edit.options.makeDefaultTitle')}" hidden>${make}</button></div></div>`;
}

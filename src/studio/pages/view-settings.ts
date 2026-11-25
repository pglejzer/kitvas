// The View button and its popover (ADR 0057): theme, panels and accent, on every studio page.
// The page's bar holds the button; the shell puts the popover into the page once. The script
// (`client/studio/ui/view-settings.ts`) opens it, applies a choice at once and saves it for the
// person (`POST /api/v1/settings/view`); without the script the page keeps the saved view.
//
// Markup the script reads: `[data-view-open]` (any number of buttons), `[data-view-pop]`, in it
// `[data-view-set="theme|panels|accent"]` groups of `button[data-value]` with `aria-pressed`, and
// `[data-view-note]` with its two texts in `data-text-saved` and `data-text-failed`.

import type { Translate, ViewSettings } from '../../shared/index.ts';
import { type Html, html } from './html.ts';
import { icon } from './icons/icon.ts';

type Choice = { value: string; label: string };

function choices(t: Translate): Record<keyof ViewSettings, Choice[]> {
  return {
    theme: [
      { value: 'system', label: t('studio.view.theme.system') },
      { value: 'light', label: t('studio.view.theme.light') },
      { value: 'dark', label: t('studio.view.theme.dark') },
    ],
    panels: [
      { value: 'cards', label: t('studio.view.panels.cards') },
      { value: 'flush', label: t('studio.view.panels.flush') },
    ],
    accent: [
      { value: 'copper', label: t('studio.view.accent.copper') },
      { value: 'teal', label: t('studio.view.accent.teal') },
      { value: 'coral', label: t('studio.view.accent.coral') },
      { value: 'rose', label: t('studio.view.accent.rose') },
    ],
  };
}

/**
 * The button that opens the popover; a bar puts it at its end. Its word (`k-bar-word`) gives way
 * in a narrow bar; the icon and the name stay.
 */
export function viewButton(t: Translate): Html {
  const label = t('studio.view.open');
  return html`<button type="button" class="k-btn" data-view-open aria-haspopup="dialog" aria-expanded="false" aria-label="${label}" title="${label}">${icon('sliders')}<span class="k-bar-word">${label}</span></button>`;
}

const pressed = (on: boolean): string => (on ? 'true' : 'false');

/** The popover, hidden until the button opens it. One per page. */
export function viewPopover(t: Translate, view: ViewSettings): Html {
  const all = choices(t);
  const text = (set: 'theme' | 'panels'): Html[] =>
    all[set].map(
      (choice) =>
        html`<button type="button" data-value="${choice.value}" aria-pressed="${pressed(view[set] === choice.value)}">${choice.label}</button>`,
    );
  const accents = all.accent.map(
    (choice) =>
      html`<button type="button" class="view-accent" data-value="${choice.value}" aria-pressed="${pressed(view.accent === choice.value)}" aria-label="${choice.label}" title="${choice.label}"></button>`,
  );
  const title = t('studio.view.title');
  return html`<div class="k-pop view-pop" data-view-pop role="dialog" aria-label="${title}" hidden>
<p class="view-pop-title">${title}</p>
<div class="view-row"><span id="view-theme">${t('studio.view.theme')}</span><div class="k-seg" role="group" aria-labelledby="view-theme" data-view-set="theme">${text('theme')}</div></div>
<div class="view-row"><span id="view-panels">${t('studio.view.panels')}</span><div class="k-seg" role="group" aria-labelledby="view-panels" data-view-set="panels">${text('panels')}</div></div>
<div class="view-row"><span id="view-accent">${t('studio.view.accent')}</span><div class="view-accents" role="group" aria-labelledby="view-accent" data-view-set="accent">${accents}</div></div>
<p class="k-meta view-note" data-view-note data-text-saved="${t('studio.view.saved')}" data-text-failed="${t('studio.view.failed')}" role="status">${t('studio.view.saved')}</p>
</div>`;
}

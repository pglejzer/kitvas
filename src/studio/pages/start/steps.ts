// First run: three steps in place of the drafts, when there is no draft yet.

import type { Translate } from '../../../shared/index.ts';
import { type Html, html } from '../html.ts';

const STEPS = ['ask', 'see', 'change'] as const;

/** The head of the steps, `<h2>`'s words. */
export const stepsTitle = (t: Translate): string => t('studio.start.steps.title');

export function firstSteps(t: Translate): Html {
  const items = STEPS.map(
    (step) =>
      html`<li><h3>${t(`studio.start.steps.${step}.title`)}</h3><p>${t(`studio.start.steps.${step}.body`)}</p></li>`,
  );
  return html`<ol class="start-steps">${items}</ol>`;
}

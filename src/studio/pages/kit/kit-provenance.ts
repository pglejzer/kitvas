// The kit page's source line, its verification line and the problems the last verification found.

import type { Translate } from '../../../shared/index.ts';
import type { CompareLevel, VerifyView } from '../../views/kit-status.ts';
import { type Html, html } from '../html.ts';

export type Provenance = {
  /** The translated source line, from `sourceLine`. */
  source: string;
  kitId: string;
  verify: VerifyView;
  /** A `code` kit verified as it is now: its components at each level (`CodeView.counts`). */
  counts?: Record<CompareLevel, number> | undefined;
};

/** The sentence for a state. The command that mends it is a box of its own, not in the sentence. */
function verifyNote(t: Translate, view: VerifyView): string {
  const params = { date: view.date, count: view.count };
  return view.state === 'passed'
    ? t('studio.kit.verify.passed', params)
    : t(`studio.kit.verifyNote.${view.state}`, params);
}

/** The block's lead: where the kit comes from, then whether it is verified; two calm lines. */
export function kitLead(t: Translate, input: Provenance): Html {
  const { verify } = input;
  const cls = verify.state === 'failed' ? 'k-fix' : 'k-quiet';
  const counts = input.counts;
  const compared =
    counts === undefined
      ? ''
      : html`<span class="kit-lead-line k-quiet" data-compared-counts>${t('studio.kit.comparedCounts', counts)}</span>`;
  return html`<span class="kit-lead-line" data-kit-source>${input.source}</span><span class="kit-lead-line ${cls}" data-verify="${verify.state}">${verifyNote(t, verify)}</span>${compared}`;
}

/** The problems of the last verification, as a card; nothing when there are none. */
export function verifyIssuesCard(t: Translate, view: VerifyView): Html | '' {
  if (view.issues.length === 0) return '';
  const items = view.issues.map(
    (issue) =>
      html`<li data-verify-step="${issue.step}">${t(issue.key, issue.params)} <code>${issue.path}</code></li>`,
  );
  return html`<section class="kit-part kit-card kit-provenance" data-kit-provenance aria-labelledby="kit-verify"><h2 id="kit-verify">${t('studio.kit.verifyTitle')}</h2><ul class="kit-list">${items}</ul></section>`;
}

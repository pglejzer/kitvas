// The kit page's source line and verification line.

import type { Translate } from '../../shared/index.ts';
import type { VerifyView } from '../views/kit-status.ts';
import { type Html, html } from './html.ts';

export type Provenance = {
  /** The translated source line, from `sourceLine`. */
  source: string;
  kitId: string;
  verify: VerifyView;
};

/** A problem is worded by its message key, like the kit's own problems. */
function verifyNote(t: Translate, kitId: string, view: VerifyView): string {
  const params = { id: kitId, date: view.date, count: view.count };
  return t(`studio.kit.verify.${view.state}`, params);
}

export function provenanceSection(t: Translate, input: Provenance): Html {
  const { verify } = input;
  const note = verifyNote(t, input.kitId, verify);
  const cls = verify.state === 'failed' ? 'fix' : 'quiet';
  const issues =
    verify.issues.length === 0
      ? ''
      : html`<ul class="plain">${verify.issues.map(
          (issue) =>
            html`<li data-verify-step="${issue.step}">${t(issue.key, issue.params)} <code>${issue.path}</code></li>`,
        )}</ul>`;
  return html`<section class="kit-part" data-kit-provenance>
<p class="meta"><span data-kit-source>${input.source}</span></p>
<p class="${cls}" data-verify="${verify.state}">${note}</p>${issues}
</section>`;
}

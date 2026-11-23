// The findings beside the prototype, numbered in reading order, and the next step under them.

import { type Finding, type Guideline, guidelineFor } from '../../checks/index.ts';
import type { Translate } from '../../shared/index.ts';
import type { Line } from '../views/status.ts';
import { type Html, html } from './html.ts';

export type NotesInput = { t: Translate; shown: Finding[]; elsewhere: number; next: Line };

function placeOf(t: Translate, finding: Finding): string | null {
  if (finding.file === null) return null;
  if (finding.line === 0) return finding.file;
  return t('studio.notes.place', { file: finding.file, line: finding.line });
}

/**
 * The guideline a finding breaks: its sentence, whether a source or a kitvas heuristic backs it,
 * and its sources. Links come only from the built-in book, never from the finding's text.
 */
export function guidelineNote(t: Translate, guideline: Guideline): Html {
  const links = guideline.sources
    .filter((source) => source.url.startsWith('https://'))
    .map(
      (source, index) =>
        html`${index > 0 ? ', ' : ''}<a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.name}</a>`,
    );
  const basis = t(guideline.basis === 'source' ? 'studio.notes.sourced' : 'studio.notes.heuristic');
  const sources = links.length === 0 ? '' : html` ${t('studio.notes.sources')} ${links}`;
  return html`<p>${t(`guideline.${guideline.key}.rule`)}</p><p>${basis}${sources}</p>`;
}

/** The rule id and the place stay in the details; the note itself is plain words. */
function details(t: Translate, finding: Finding): Html {
  const place = placeOf(t, finding);
  const guideline = guidelineFor(finding.rule);
  const book = guideline === undefined ? '' : guidelineNote(t, guideline);
  return html`<details><summary>${t('studio.notes.more')}</summary><p>${finding.hint}</p>${book}<p><code>${finding.rule}</code>${place === null ? '' : html` ${place}`}</p></details>`;
}

export function notesSection(input: NotesInput): Html {
  const { t } = input;
  let number = 0;
  const note = (finding: Finding): Html => {
    number += 1;
    // The studio's script marks the element on the prototype with this number.
    const element = finding.element === null ? '' : html` data-element="${finding.element}"`;
    return html`<li class="note" data-tone="${finding.severity}"${element}><span class="num">${number}</span><div>${finding.message}<small>${t(`studio.check.${finding.check}`)}</small>${details(t, finding)}</div></li>`;
  };
  const group = (severity: 'fix' | 'review'): Html | '' => {
    const items = input.shown.filter((finding) => finding.severity === severity);
    if (items.length === 0) return '';
    const heading = t(`studio.status.${severity}`, { count: items.length });
    return html`<h2 class="${severity}">${heading}</h2><ol class="list" role="list">${items.map((finding) => note(finding))}</ol>`;
  };
  // Template parts run left to right, so the numbers go on from the fix group to the review group.
  const fix = group('fix');
  const review = group('review');
  const elsewhere =
    input.elsewhere > 0
      ? html`<p class="quiet">${t('studio.notes.elsewhere', { count: input.elsewhere })}</p>`
      : '';
  const next = html`<p class="next">${t(input.next.key, input.next.params)}</p>`;
  return html`<section class="notes" aria-label="${t('studio.notes.label')}">${fix}${review}${elsewhere}${next}</section>`;
}

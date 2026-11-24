// The findings beside the prototype, numbered in reading order, and the next step under them.
// Plan 18, task D: a filter of counts (All, To fix, To review, Accepted) over the list, which
// scrolls under it, and a `.k-item` per finding with its number, its words, the element and its
// actions. The hooks stay: `li.note` with `data-element`, `data-tone` and `.num` (the canvas marks
// read them), `li.accepted-note` and `data-rule` (the waivers), `[data-checks-actions]` (where a
// script puts a finding's controls).

import {
  type Finding,
  type Guideline,
  guidelineFor,
  type WaivedFinding,
} from '../../../checks/index.ts';
import type { Translate } from '../../../shared/index.ts';
import type { Line } from '../../views/status.ts';
import { type Html, html, trusted } from '../html.ts';

export type NotesInput = {
  t: Translate;
  shown: Finding[];
  elsewhere: number;
  next: Line;
  /** Findings a waiver accepts (`checks.json`'s `waived`): listed apart, never numbered or marked. */
  waived?: readonly WaivedFinding[];
};

/** The filters, in the order the bar shows them (`client/studio/edit/live/filter.ts`). */
export const CHECK_FILTERS = ['all', 'fix', 'review', 'accepted'] as const;
export type CheckFilter = (typeof CHECK_FILTERS)[number];
export type CheckCounts = Record<CheckFilter, number>;

/** How many findings each filter shows; All is every one listed, the accepted ones too. */
export function checkCounts(
  shown: readonly Pick<Finding, 'severity'>[],
  waived: readonly unknown[],
): CheckCounts {
  const fix = shown.filter((finding) => finding.severity === 'fix').length;
  const review = shown.length - fix;
  return { all: shown.length + waived.length, fix, review, accepted: waived.length };
}

/** `Pricing / Card.2` for `sections/Pricing:section/Stack/Card.2`, as the editor names it. */
export function elementLabel(id: string): string {
  const colon = id.indexOf(':');
  if (colon < 0) return id;
  const stem = id.slice(0, colon).split('/').pop() ?? '';
  const tag =
    id
      .slice(colon + 1)
      .split('/')
      .pop() ?? '';
  return stem === '' ? tag : `${stem} / ${tag}`;
}

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
  return html`<details class="checks-details"><summary>${t('studio.notes.more')}</summary><p>${finding.hint}</p>${book}<p><code>${finding.rule}</code>${place === null ? '' : html` ${place}`}</p></details>`;
}

/** The finding's words, and under them the check it comes from and the element it is on. */
function words(t: Translate, finding: Finding): Html {
  const where = finding.element === null ? '' : html` · ${elementLabel(finding.element)}`;
  return html`<div class="checks-finding-text"><span class="checks-finding-title">${finding.message}</span><small class="k-meta">${t(`studio.check.${finding.check}`)}${where}</small></div>`;
}

const ACTIONS = trusted('<div class="checks-actions" data-checks-actions></div>');
const PRESSED = trusted(' aria-pressed="true"');
const NOT_PRESSED = trusted(' aria-pressed="false"');
const DISABLED = trusted(' disabled');

/** The filter of counts. All is pressed until the script puts back the person's choice. */
function filterBar(t: Translate, counts: CheckCounts): Html {
  const buttons = CHECK_FILTERS.map((filter) => {
    const count = counts[filter];
    const pressed = filter === 'all' ? PRESSED : NOT_PRESSED;
    const off = filter !== 'all' && count === 0 ? DISABLED : '';
    return html`<button type="button" data-checks-filter="${filter}" data-count="${count}"${pressed}${off}><b class="checks-filter-count">${count}</b><span>${t(`studio.notes.filter.${filter}`)}</span></button>`;
  });
  return html`<div class="k-pad checks-head"><div class="k-seg checks-filter" role="group" aria-label="${t('studio.notes.filter')}">${buttons}</div></div>`;
}

export function notesSection(input: NotesInput): Html {
  const { t } = input;
  let number = 0;
  const note = (finding: Finding): Html => {
    number += 1;
    // The studio's script marks the element on the prototype with this number.
    const element = finding.element === null ? '' : html` data-element="${finding.element}"`;
    return html`<li class="note k-item checks-finding" data-tone="${finding.severity}" data-rule="${finding.rule}"${element}><div class="checks-finding-head"><span class="num checks-num" data-tone="${finding.severity}">${number}</span>${words(t, finding)}</div>${details(t, finding)}${ACTIONS}</li>`;
  };
  const group = (severity: 'fix' | 'review'): Html | '' => {
    const items = input.shown.filter((finding) => finding.severity === severity);
    if (items.length === 0) return '';
    const heading = t(`studio.status.${severity}`, { count: items.length });
    return html`<div class="checks-group" data-checks-group="${severity}"><h2 class="checks-group-title">${heading}</h2><ol class="k-stack" role="list">${items.map((finding) => note(finding))}</ol></div>`;
  };
  // An accepted finding has no number and no `data-element`: the canvas never marks it. Its rule
  // and element stay on the row so "Withdraw" (client/studio/edit/live/waivers.ts) can name them.
  const accepted = (finding: WaivedFinding): Html => {
    const element = finding.element === null ? '' : html` data-waived-element="${finding.element}"`;
    return html`<li class="accepted-note k-item checks-finding" data-rule="${finding.rule}"${element}><div class="checks-finding-head"><span class="k-dot" data-state="good" aria-hidden="true"></span>${words(t, finding)}</div><p class="k-meta checks-reason">${t('studio.notes.reason', { reason: finding.reason })}</p>${details(t, finding)}${ACTIONS}</li>`;
  };
  const waived = input.waived ?? [];
  const acceptedList =
    waived.length === 0
      ? ''
      : html`<div class="checks-group" data-checks-group="accepted"><h2 class="checks-group-title">${t('studio.notes.accepted', { count: waived.length })}</h2><ol class="k-stack" role="list">${waived.map((finding) => accepted(finding))}</ol></div>`;
  // Template parts run left to right, so the numbers go on from the fix group to the review group.
  const fix = group('fix');
  const review = group('review');
  const elsewhere =
    input.elsewhere > 0
      ? html`<p class="k-meta checks-elsewhere">${t('studio.notes.elsewhere', { count: input.elsewhere })}</p>`
      : '';
  const next = t(input.next.key, input.next.params);
  const counts = checkCounts(input.shown, waived);
  const label = t('studio.notes.label');
  // Nothing listed: no filter, and the next step as the pane's one line (clean, or not checked).
  if (counts.all === 0) {
    return html`<section class="checks-notes" aria-label="${label}"><div class="k-scroll"><div class="k-empty checks-empty">${elsewhere}<p class="checks-next">${next}</p></div></div></section>`;
  }
  return html`<section class="checks-notes" aria-label="${label}">${filterBar(t, counts)}<div class="k-scroll"><div class="k-pad checks-list">${fix}${review}${acceptedList}${elsewhere}<p class="k-meta checks-next">${next}</p></div></div></section>`;
}

// The findings beside the prototype, numbered in reading order, and the next step under them.
// Plan 18f, task 4 (mock v10, Checks): summary tiles (to fix, to review, passed), "Full check ran
// <time> ago" with Run again, and a card per finding. A card has its number, its words, "<element>
// in <section>", an evidence slot and its actions; a script fills the evidence and the buttons
// (`client/studio/edit/checks/`) and puts the waiver's Accept beside them. The hooks stay:
// `li.note` with `data-element`, `data-tone` and `.num` (the canvas marks read them),
// `li.accepted-note` and `data-rule` (the waivers), `[data-checks-actions]` (where a script puts
// a finding's controls). `data-message` and `data-hint` hand the script what the finding says,
// since `checks.json` keeps a finding as words only. A version not checked says so and offers the
// full check, never a command to copy.

import {
  type Finding,
  type Guideline,
  guidelineFor,
  type WaivedFinding,
} from '../../../checks/index.ts';
import type { Translate } from '../../../shared/index.ts';
import type { Line } from '../../views/status.ts';
import { type Html, html, trusted } from '../html.ts';

/** What the pane knows of the check beyond its findings. */
export type RunInput = {
  /** The latest version, in the editor: the full check can be started from here. */
  canRun: boolean;
  /** When `checks.json` was last written, in milliseconds; `null` when it is not known. */
  ranAt: number | null;
  /** How many rules of the book found nothing; `null` when there is no check to count on. */
  passed: number | null;
};

export type NotesInput = {
  t: Translate;
  shown: Finding[];
  elsewhere: number;
  next: Line;
  /** Findings a waiver accepts (`checks.json`'s `waived`): listed apart, never numbered or marked. */
  waived?: readonly WaivedFinding[];
  run?: RunInput;
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

/** `Card.2` in `Pricing` for `sections/Pricing:section/Stack/Card.2`; no section for a bare id. */
export function elementIn(id: string): { element: string; section: string } {
  const colon = id.indexOf(':');
  if (colon < 0) return { element: id, section: '' };
  const section = id.slice(0, colon).split('/').pop() ?? '';
  const element =
    id
      .slice(colon + 1)
      .split('/')
      .pop() ?? '';
  return { element: element === '' ? id : element, section };
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

/** The finding's words, and under them the element it is on and its section (or the check). */
function words(t: Translate, finding: Finding): Html {
  const { element } = finding;
  let where = t(`studio.check.${finding.check}`);
  if (element !== null) {
    const place = elementIn(element);
    where =
      place.section === ''
        ? place.element
        : t('studio.notes.in', { element: place.element, section: place.section });
  }
  return html`<div class="checks-finding-text"><span class="checks-finding-title">${finding.message}</span><small class="k-meta">${where}</small></div>`;
}

const ACTIONS = trusted('<div class="checks-actions" data-checks-actions></div>');
const EVIDENCE = trusted('<div class="checks-evidence-slot" data-checks-evidence></div>');
const NOT_PRESSED = trusted(' aria-pressed="false"');
const DISABLED = trusted(' disabled');

const runButton = (label: string): Html =>
  html`<button type="button" class="k-btn k-btn-line" data-checks-run>${label}</button>`;

/** A tile that shows only the findings of its tone; one with nothing to show cannot be chosen. */
function tile(t: Translate, filter: 'fix' | 'review', count: number): Html {
  const off = count === 0 ? DISABLED : '';
  return html`<button type="button" class="checks-tile" data-checks-filter="${filter}" data-count="${count}"${NOT_PRESSED}${off}><b class="checks-tile-count">${count}</b><span>${t(`studio.notes.filter.${filter}`)}</span><i class="k-dot" data-state="${filter}" aria-hidden="true"></i></button>`;
}

/** The summary: the three tiles, the accepted ones as a chip, and when the check ran with its button. */
function head(t: Translate, counts: CheckCounts, run: RunInput | undefined): Html {
  const passed =
    run?.passed === undefined || run.passed === null
      ? ''
      : html`<div class="checks-tile" data-checks-passed><b class="checks-tile-count">${run.passed}</b><span>${t('studio.notes.passed')}</span><i class="k-dot" data-state="good" aria-hidden="true"></i></div>`;
  const accepted =
    counts.accepted === 0
      ? ''
      : html`<button type="button" class="k-btn k-btn-line checks-accepted" data-checks-filter="accepted" data-count="${counts.accepted}"${NOT_PRESSED}>${t('studio.notes.filter.accepted')} ${counts.accepted}</button>`;
  const ran =
    run?.ranAt === undefined || run.ranAt === null
      ? ''
      : html`<span class="k-meta checks-ran" data-checks-ran="${run.ranAt}"></span>`;
  const again = run?.canRun === true ? runButton(t('studio.notes.run.again')) : '';
  const row = ran === '' && again === '' ? '' : html`<div class="checks-run">${ran}${again}</div>`;
  return html`<div class="checks-head"><div class="checks-score" role="group" aria-label="${t('studio.notes.filter')}">${tile(t, 'fix', counts.fix)}${tile(t, 'review', counts.review)}${passed}</div>${accepted}${row}</div>`;
}

/** A version never checked: it says so, and the person can run the full check from here. */
function notChecked(t: Translate, label: string, run: RunInput | undefined): Html {
  const button = run?.canRun === true ? runButton(t('studio.notes.run.first')) : '';
  const line =
    run?.canRun === true ? html`<span class="k-meta checks-ran" data-checks-ran=""></span>` : '';
  return html`<section class="checks-notes" aria-label="${label}"><div class="k-scroll"><div class="k-empty checks-empty"><p class="checks-next">${t('studio.notes.notChecked')}</p>${line}${button}</div></div></section>`;
}

export function notesSection(input: NotesInput): Html {
  const { t } = input;
  let number = 0;
  const note = (finding: Finding): Html => {
    number += 1;
    // The studio's script marks the element on the prototype with this number.
    const element = finding.element === null ? '' : html` data-element="${finding.element}"`;
    return html`<li class="note k-card checks-finding" data-tone="${finding.severity}" data-rule="${finding.rule}"${element} data-message="${finding.message}" data-hint="${finding.hint}"><div class="checks-finding-head"><span class="num checks-num" data-tone="${finding.severity}">${number}</span>${words(t, finding)}</div>${EVIDENCE}${details(t, finding)}${ACTIONS}</li>`;
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
    return html`<li class="accepted-note k-card checks-finding" data-rule="${finding.rule}"${element}><div class="checks-finding-head"><span class="k-dot" data-state="good" aria-hidden="true"></span>${words(t, finding)}</div><p class="k-meta checks-reason">${t('studio.notes.reason', { reason: finding.reason })}</p>${details(t, finding)}${ACTIONS}</li>`;
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
  // A version not checked says so, and offers the full check where it can run it.
  if (input.next.key === 'studio.next.check') return notChecked(t, label, input.run);
  // Nothing built yet: the next step is the pane's one line.
  if (input.next.key === 'studio.next.build') {
    return html`<section class="checks-notes" aria-label="${label}"><div class="k-scroll"><div class="k-empty checks-empty"><p class="checks-next">${next}</p></div></div></section>`;
  }
  const summary = head(t, counts, input.run);
  if (counts.all === 0) {
    return html`<section class="checks-notes" aria-label="${label}">${summary}<div class="k-scroll"><div class="k-empty checks-empty">${elsewhere}<p class="checks-next">${next}</p></div></div></section>`;
  }
  return html`<section class="checks-notes" aria-label="${label}">${summary}<div class="k-scroll"><div class="checks-list">${fix}${review}${acceptedList}${elsewhere}<p class="k-meta checks-next">${next}</p></div></div></section>`;
}

// `/doctor`: what `kitvas doctor` finds, as rows, and the report to paste into an issue. A studio
// with no doctor, or a run that throws, gets the two commands to run by hand; the page answers 200.

import { type CheckResult, type CheckStatus, tally } from '../../../doctor/index.ts';
import type { Translate } from '../../../shared/index.ts';
import { type Html, html } from '../html.ts';
import { icon } from '../icons/icon.ts';
import { commandBox } from '../states/command.ts';
import { BY_HAND, type InfoDeps, type InfoRequest, infoPage } from './layout.ts';

/** The report's text, which the block's Copy button reads (`client/studio/info/copy-report.ts`). */
const REPORT_ID = 'doctor-report-text';

export type DoctorAnswer = { checks: CheckResult[]; report: string };
export type DoctorPageDeps = InfoDeps & {
  /** The doctor's checks and report; left out where the studio has no doctor. */
  doctor?: (() => Promise<DoctorAnswer>) | undefined;
};

/** The dot's state: `skipped` has none, so its dot stays grey. */
const DOT: Readonly<Record<CheckStatus, string | undefined>> = {
  ok: 'good',
  warn: 'review',
  fail: 'fix',
  skipped: undefined,
};

function checkRow(t: Translate, check: CheckResult): Html {
  const state = DOT[check.status];
  const dot =
    state === undefined
      ? html`<span class="k-dot"></span>`
      : html`<span class="k-dot" data-state="${state}"></span>`;
  const fix =
    check.fix === undefined
      ? ''
      : html`<span class="k-meta">${t('doctor.fixPrefix', { text: check.fix })}</span>`;
  return html`<li class="info-check" data-check="${check.id}" data-status="${check.status}">${dot}<span class="info-check-id"><span class="k-sr">${t(`doctor.status.${check.status}`)} </span>${check.id}</span><span class="info-check-text"><span>${check.detail}</span>${fix}</span></li>`;
}

/** The report in a box the same way a command is, so the copy button of every page works it. */
function reportBox(t: Translate, report: string): Html {
  const label = t('studio.page.copy');
  return html`<div class="k-cmd info-report"><pre><code id="${REPORT_ID}">${report}</code></pre><button type="button" class="k-icon-btn" data-copy aria-label="${label}" title="${label}" data-text-copied="${t('studio.page.copied')}">${icon('copy')}</button><span class="k-sr" role="status" data-copy-status></span></div>`;
}

/** The block's row: the four counts, each with its dot, then the two buttons. */
function countsRow(t: Translate, checks: readonly CheckResult[]): Html {
  const counts = tally(checks);
  const items = (['ok', 'warn', 'fail', 'skipped'] as const).map((status) => {
    const state = DOT[status];
    const dot =
      state === undefined
        ? html`<span class="k-dot"></span>`
        : html`<span class="k-dot" data-state="${state}"></span>`;
    const zero = counts[status] === 0 ? html` data-zero` : '';
    return html`<li class="info-count" data-count="${status}"${zero}>${dot}<span>${t(`studio.doctor.count.${status}`, { count: counts[status] })}</span></li>`;
  });
  const label = t('studio.doctor.copyReport');
  const copy = html`<button type="button" class="k-btn k-btn-line" data-copy-from="${REPORT_ID}" data-text-label="${label}" data-text-copied="${t('studio.page.copied')}"><span data-copy-label>${label}</span></button>`;
  const again = html`<a class="k-btn k-btn-line" href="/doctor">${t('studio.doctor.again')}</a>`;
  return html`<div class="info-doctor-row"><ul class="info-counts">${items}</ul><div class="info-actions">${again}${copy}</div></div>`;
}

function found(t: Translate, answer: DoctorAnswer): Html {
  const rows = answer.checks.map((check) => checkRow(t, check));
  const checks = html`<section class="info-card info-card-pad"><h2>${t('studio.doctor.checks')}</h2><ul class="info-list">${rows}</ul></section>`;
  const report = html`<section class="info-card info-card-pad"><h2>${t('studio.doctor.report')}</h2>${reportBox(t, answer.report)}<p class="k-meta">${t('studio.doctor.reportNote')}</p></section>`;
  return html`<div class="info-doctor">${checks}${report}</div>`;
}

function missing(t: Translate): Html {
  const commands = html`<section class="info-card info-card-pad"><h2>${t('studio.doctor.checks')}</h2><p>${t('studio.doctor.unavailable')}</p><p>${t('studio.doctor.byHand')}</p>${commandBox(t, `${BY_HAND} doctor`, { copy: true })}${commandBox(t, `${BY_HAND} doctor --report`, { copy: true })}</section>`;
  return html`<div class="info-doctor info-doctor-one">${commands}</div>`;
}

/** The answer of the doctor, or `undefined` when the studio has none or it threw. */
async function ask(deps: DoctorPageDeps): Promise<DoctorAnswer | undefined> {
  if (deps.doctor === undefined) return undefined;
  try {
    return await deps.doctor();
  } catch {
    return undefined;
  }
}

export async function doctorPage(deps: DoctorPageDeps, request: InfoRequest): Promise<string> {
  const { t } = deps;
  const answer = await ask(deps);
  return infoPage(deps, request, {
    title: t('studio.doctor.title'),
    lead: t('studio.doctor.lead'),
    current: 'doctor',
    ...(answer === undefined ? {} : { row: countsRow(t, answer.checks) }),
    body: answer === undefined ? missing(t) : found(t, answer),
  });
}
